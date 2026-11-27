const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = name => fs.readFileSync(path.join(__dirname, name), 'utf8');
const bulkSource = read('../web/attachment-bulk.js'), app = read('../web/app.js'), html = read('../web/workbench.html');
const tick = () => new Promise(resolve => setImmediate(resolve));
const scope = { owner: 'user', kind: 'paper', contextId: 'replication_rp-one_code', files: [{ id: 'a', file_name: 'A.do' }, { id: 'b', file_name: 'B.do' }] };
function bulkHarness(options = {}) {
  const removed = [], progress = [];
  let owner = 'user';
  const window = { __academicAttachments: { identity: async () => owner, remove: async (id, expected) => { removed.push({ id, expected }); if (options.remove) await options.remove(id); } } };
  vm.runInNewContext(bulkSource, { window });
  return { bulk: window.__academicAttachmentBulk, removed, progress, owner(value) { owner = value; }, run(extra = {}) { return window.__academicAttachmentBulk.remove({ ...scope, progress: value => progress.push(value), ...extra }); } };
}
test('confirmed IDs are deduplicated and removed sequentially within the exact owner and material context', async () => {
  const h = bulkHarness(), files = scope.files.concat(scope.files[0]); const result = await h.run({ files });
  assert.deepEqual(h.removed.map(file => file.id), ['a', 'b']);
  for (const call of h.removed) assert.deepEqual(JSON.parse(JSON.stringify(call.expected)), { owner: 'user', kind: 'paper', contextId: scope.contextId });
  assert.equal(result.removed.length, 2); assert.equal(result.remaining.length, 0); assert.equal(h.progress.at(-1).index, 2);
  assert.equal(h.bulk.busy('user', 'paper', scope.contextId), false);
});
test('partial failures report exact filenames, preserve remaining IDs and never claim complete success', async () => {
  const h = bulkHarness({ remove: async id => { if (id === 'b') throw Error('Offline'); } }), result = await h.run();
  assert.deepEqual(Array.from(result.removed), ['a']); assert.deepEqual(Array.from(result.remaining), ['b']);
  assert.match(h.bulk.summary(result), /失败 1 个：B.do（Offline）/);
});
test('account changes stop subsequent requests and duplicate concurrent batches cannot run', async () => {
  let finish;
  const h = bulkHarness({ remove: () => new Promise(resolve => { finish = resolve; }) });
  const pending = h.run(); await tick(); assert.equal(h.bulk.busy('user', 'paper', scope.contextId), true);
  await assert.rejects(h.run(), /已有文件操作/);
  h.owner('another'); finish(); const result = await pending;
  assert.deepEqual(h.removed.map(file => file.id), ['a']); assert.equal(result.stopped, true); assert.deepEqual(Array.from(result.remaining), ['b']);
});
test('invalid contexts, empty selections and unrelated modules never delete anything', async () => {
  const h = bulkHarness();
  for (const invalid of [{ contextId: 'peer_review_one' }, { kind: 'knowledge' }, { owner: '' }, { files: [] }]) await assert.rejects(h.run(invalid));
  assert.equal(h.removed.length, 0);
});

const repSource = read('test-replications.cjs');
const repContext = vm.createContext({ app, html, vm, structuredClone });
vm.runInContext(repSource.slice(repSource.indexOf('function uiHarness('), repSource.indexOf('\ntest(', repSource.indexOf('function uiHarness('))), repContext);
function replication(options = {}) {
  const rows = new Map(), removed = [];
  let h;
  const attachments = {
    identity: async () => h.context.account && h.context.account.id,
    list: async (_kind, id) => structuredClone(rows.get(id) || []),
    remove: async (id, expected) => { removed.push({ id, expected }); if (options.remove) await options.remove(id); rows.set(expected.contextId, (rows.get(expected.contextId) || []).filter(file => file.id !== id)); }
  };
  h = repContext.uiHarness({ attachments }); vm.runInContext(bulkSource, h.context);
  for (const kind of ['paper', 'supplement', 'data', 'code', 'result']) rows.set('replication_rp-one_' + kind, [{ id: kind + '-a', file_name: 'A.<test>' }, { id: kind + '-b', file_name: 'B.txt' }]);
  h.select(); h.context.bindReplicationEvents();
  return { ...h, rows, removed, entry: kind => h.context.replicationAttachmentCache()['replication_rp-one_' + kind] };
}
test('all five material groups select files, review names and delete only after the matching confirmation', async () => {
  for (const kind of ['paper', 'supplement', 'data', 'code', 'result']) {
    const h = replication(); await tick(); h.node('replicationNotes').value = '未保存草稿';
    h.node('panel-replications').handlers.change({ target: { checked: true, closest: selector => selector === '[data-replication-file-all]' ? { checked: true, dataset: { replicationFileAll: kind } } : null } });
    await h.context.replicationFileBulkAction(kind, 'review');
    assert.match(h.node('replicationFileList_' + kind).innerHTML, /确认删除 2 个文件/); assert.match(h.node('replicationFileList_' + kind).innerHTML, /A\.&lt;test>/);
    assert.equal(h.removed.length, 0); assert.equal(await h.context.replicationFileBulkAction(kind, 'confirm', 'wrong'), false);
    const token = h.entry(kind).review.token; assert.equal(await h.context.replicationFileBulkAction(kind, 'confirm', token), true);
    assert.deepEqual(h.removed.map(file => file.id), [kind + '-a', kind + '-b']);
    assert.equal(h.node('replicationNotes').value, '未保存草稿'); assert.match(h.node('replicationFileList_' + kind).innerHTML, /已删除 2 个文件/);
  }
});
test('cancel and switching tasks invalidate confirmation without affecting selection in another group', async () => {
  const h = replication(); await tick(); h.context.selectReplicationFiles('code', 'code-a', true, false); h.context.selectReplicationFiles('data', 'data-a', true, false);
  await h.context.replicationFileBulkAction('code', 'review'); const token = h.entry('code').review.token;
  await h.context.replicationFileBulkAction('code', 'cancel'); assert.equal(await h.context.replicationFileBulkAction('code', 'confirm', token), false);
  assert.deepEqual(Array.from(h.entry('data').selected), ['data-a']);
  await h.context.replicationFileBulkAction('code', 'review'); const stale = h.entry('code').review.token;
  h.select({ id: 'rp-two' }); await tick(); assert.equal(await h.context.replicationFileBulkAction('code', 'confirm', stale), false); assert.equal(h.removed.length, 0);
});
test('failed inline deletions retain only failed selections for an explicit retry', async () => {
  let fail = true;
  const h = replication({ remove: async id => { if (id === 'code-b' && fail) throw Error('Offline'); } }); await tick();
  h.context.selectReplicationFiles('code', null, true, true); await h.context.replicationFileBulkAction('code', 'review');
  assert.equal(await h.context.replicationFileBulkAction('code', 'confirm', h.entry('code').review.token), false);
  assert.deepEqual(Array.from(h.entry('code').selected), ['code-b']); assert.match(h.node('replicationFileList_code').innerHTML, /失败 1 个/);
  fail = false; await h.context.replicationFileBulkAction('code', 'review'); await h.context.replicationFileBulkAction('code', 'confirm', h.entry('code').review.token);
  assert.deepEqual(h.removed.map(file => file.id), ['code-a', 'code-b', 'code-b']);
});

test('switching tasks during deletion keeps the confirmed file scope and leaves the new task draft untouched', async () => {
  let finish;
  const h = replication({ remove: async id => { if (id === 'code-a') await new Promise(resolve => { finish = resolve; }); } }); await tick();
  h.context.selectReplicationFiles('code', null, true, true); await h.context.replicationFileBulkAction('code', 'review');
  const pending = h.context.replicationFileBulkAction('code', 'confirm', h.entry('code').review.token); await tick();
  h.select({ id: 'rp-two' }); h.node('replicationNotes').value = '新任务草稿'; finish(); await pending;
  assert.deepEqual(h.removed.map(file => file.expected.contextId), ['replication_rp-one_code', 'replication_rp-one_code']);
  assert.equal(h.node('replicationNotes').value, '新任务草稿'); assert.equal(h.state.replicationId, 'rp-two');
});

const modalSource = read('../web/attachments.js'), modalTests = read('test-attachments-ui.cjs');
const modalContext = vm.createContext({ source: modalSource, page: html, bulkSource, vm });
vm.runInContext(modalTests.slice(modalTests.indexOf('function harness('), modalTests.indexOf('\ntest(')), modalContext);
function event(action, token) { return { target: { closest: selector => selector === '[data-file-bulk]' ? { dataset: { fileBulk: action, fileBulkToken: token } } : null } }; }
function modalToken(h) { return (h.node('fileBulkReview').innerHTML.match(/data-file-bulk-token="([^"]+)"/) || [])[1]; }
test('upload modal provides the same selection and review flow with partial failure reporting', async () => {
  let rows = [{ id: 'a', file_name: 'A.pdf' }, { id: 'b', file_name: 'B.pdf' }]; const removed = [];
  const h = modalContext.harness({ bulk: true, identity: async () => 'user', list: async () => structuredClone(rows), remove: async id => { removed.push(id); if (id === 'b') throw Error('Offline'); rows = rows.filter(file => file.id !== id); } });
  h.open(scope.contextId); await tick(); assert.equal(h.node('fileBulkToolbar').hidden, false);
  h.node('fileBulkToolbar').handlers.change({ target: { closest: selector => selector === '[data-file-bulk-all]' ? { checked: true } : null } });
  await h.node('fileBulkToolbar').handlers.click(event('review')); assert.equal(removed.length, 0);
  assert.match(h.node('fileBulkReview').innerHTML, /A.pdf/);
  await h.node('fileBulkReview').handlers.click(event('confirm', modalToken(h)));
  assert.deepEqual(removed, ['a', 'b']); assert.match(h.node('fileStatus').textContent, /失败 1 个/); assert.match(h.node('fileBulkToolbar').innerHTML, /已选 1 \/ 1/);
});
test('account change hides old modal data and stops the remaining confirmed files', async () => {
  let owner = 'user', finish; const removed = [];
  const h = modalContext.harness({ bulk: true, identity: async () => owner, list: async () => [{ id: 'a', file_name: 'Private A' }, { id: 'b', file_name: 'Private B' }], remove: id => { removed.push(id); return new Promise(resolve => { finish = resolve; }); } });
  h.open(scope.contextId); await tick(); h.node('fileBulkToolbar').handlers.change({ target: { closest: selector => selector === '[data-file-bulk-all]' ? { checked: true } : null } });
  await h.node('fileBulkToolbar').handlers.click(event('review'));
  const pending = h.node('fileBulkReview').handlers.click(event('confirm', modalToken(h))); await tick();
  owner = 'other'; h.handlers['window:academic-account-changed'](); finish(); await pending;
  assert.deepEqual(removed, ['a']); assert.equal(h.node('fileModal').hidden, true); assert.equal(h.node('fileBulkReview').hidden, true);
});

test('storage deletion validates the expected identity and filters metadata by owner and material context', async () => {
  const api = read('../web/static-api.js'), start = api.indexOf('    remove: async function (id, expected)'), end = api.indexOf('\n  };', start), calls = [];
  const query = { select() { return this; }, eq(...args) { calls.push(args); return this; }, single: async () => ({ data: { object_path: 'user/paper/one.pdf' } }), delete() { return this; }, then(resolve) { return Promise.resolve({ error: null }).then(resolve); } };
  const ctx = vm.createContext({ attachmentSession: async () => ({ user: { id: 'user' } }), attachmentContext() {}, attachmentBucket: 'research-attachments', client: { from: () => query, storage: { from: () => ({ remove: async paths => { calls.push(['remove', ...paths]); return {}; } }) } } });
  vm.runInContext('var sdk = ({' + api.slice(start, end) + '});', ctx);
  await assert.rejects(ctx.sdk.remove('a', { owner: 'other' }), /账号已切换/); assert.equal(calls.length, 0);
  await ctx.sdk.remove('a', { owner: 'user', kind: 'paper', contextId: scope.contextId });
  assert.ok(calls.some(call => call[0] === 'user_id' && call[1] === 'user')); assert.ok(calls.some(call => call[0] === 'context_id' && call[1] === scope.contextId));
  assert.deepEqual(calls.filter(call => call[0] === 'remove'), [['remove', 'user/paper/one.pdf']]);
});
