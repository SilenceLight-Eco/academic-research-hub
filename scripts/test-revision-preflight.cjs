const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '../web/paper-pipeline-v2.html'), 'utf8');
const source = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const app = fs.readFileSync(path.join(__dirname, '../web/app.js'), 'utf8');
const base = fs.readFileSync(path.join(__dirname, 'test-submission-status.cjs'), 'utf8');
const factory = vm.createContext({ source, vm, Date, console, require });
vm.runInContext(base.slice(base.indexOf('function harness('), base.indexOf("test('entire pipeline")), factory);
const present = () => ({ revision: { state: 'present', count: 1 }, response: { state: 'present', count: 1 } });
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };

function harness() {
  const h = factory.harness(), messages = [], calls = [], alerts = [];
  const host = { dataset: { revisionPreflight: '["paper1",null]' }, innerHTML: '' };
  h.context.location = h.context.window.location = { origin: 'https://example.test' };
  h.context.setTimeout = setTimeout; h.context.clearTimeout = clearTimeout;
  h.context.window.parent = { postMessage: data => messages.push(data), __academicCheckRevisionMaterials: async (_source, request) => { calls.push(request); return { ok: true, materials: present() }; } };
  h.context.document.querySelectorAll = selector => selector === '[data-revision-preflight]' ? [host] : [];
  h.context.alert = text => alerts.push(text);
  h.seed({ status: 'major_revision', revisionDueAt: '2026-11-03' }); h.run('currentPage = "revision"; render();');
  const rounds = () => h.run('getSubmissionRevisionRounds(DATA.submitted[0])');
  const add = () => h.context.addRevisionItem('paper1', null);
  const update = (field, value, index = 0) => { const round = rounds()[0]; h.context.updateRevisionItem('paper1', round.id, round.items[index].id, field, value); };
  const attach = () => h.context.openSubmissionFiles('paper1', null, 'revision');
  const check = () => h.context.runRevisionPreflight('paper1', null);
  const report = () => h.run('renderRevisionPreflight(DATA.submitted[0], null)');
  function complete() { add(); update('comment', 'Comment'); update('response', 'Reply'); update('status', 'done'); attach(); }
  return { ...h, messages, calls, alerts, host, rounds, add, update, attach, check, report, complete };
}

test('manual preflight lists unfinished opinions, whitespace-only replies and missing/unknown materials separately', async () => {
  const h = harness(); h.add(); h.update('response', '  \n ');
  h.context.window.parent.__academicCheckRevisionMaterials = async () => ({ ok: true, materials: { revision: { state: 'missing', count: 0 }, response: { state: 'unknown', message: 'permission denied' } } });
  await h.check(); const report = h.report();
  assert.match(report, /未完成意见 1 条/); assert.match(report, /空白回复 1 条/);
  assert.match(report, /缺失材料 1 类/); assert.match(report, /未确认材料 1 类/);
  assert.doesNotMatch(report, /本轮检查通过/); assert.match(report, /定位意见/); assert.match(report, /查看材料/);
});

test('zero opinions cannot pass, even when material categories contain attachments', async () => {
  const h = harness(); await h.check(); assert.match(h.report(), /尚未登记审稿意见/); assert.doesNotMatch(h.report(), /本轮检查通过/);
});

test('complete opinions plus confirmed attachments pass without any storage writes or status changes', async () => {
  const h = harness(); h.complete(); const before = JSON.stringify([...h.stored]);
  await h.check(); assert.match(h.report(), /本轮检查通过/); assert.match(h.report(), /检查时间/);
  assert.equal(JSON.stringify([...h.stored]), before); assert.equal(h.field('status'), 'major_revision');
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0].fileRoundId, h.rounds()[0].attachmentRoundId);
});

test('invalid responses, malformed attachment counts, login errors and timeouts never masquerade as missing files or success', async () => {
  for (const result of [null, { ok: false }, { ok: true, materials: {} }, { ok: true, materials: { revision: { state: 'present', count: 0 }, response: { state: 'present', count: -1 } } }]) {
    const h = harness(); h.complete(); h.context.window.parent.__academicCheckRevisionMaterials = async () => result;
    await h.check(); assert.match(h.report(), /未确认材料 2 类/); assert.doesNotMatch(h.report(), /本轮检查通过/);
  }
  const h = harness(); h.complete(); h.context.window.parent.__academicCheckRevisionMaterials = async () => { throw new Error('请先登录'); };
  await h.check(); assert.match(h.report(), /请先登录/); assert.match(h.report(), /缺失材料 0 类/);
  let timeout; h.context.setTimeout = fn => { timeout = fn; return 1; }; h.context.clearTimeout = () => {};
  h.context.window.parent.__academicCheckRevisionMaterials = () => new Promise(() => {});
  const pending = h.check(); timeout(); await pending; assert.match(h.report(), /读取超时/);
});

test('no background reads or repeated requests while a manual check is already running', async () => {
  const h = harness(); h.complete(); assert.equal(h.calls.length, 0);
  const pending = deferred(); let count = 0;
  h.context.window.parent.__academicCheckRevisionMaterials = () => { count++; return pending.promise; };
  const first = h.check(); assert.match(h.host.innerHTML, /正在检查/); await h.check(); assert.equal(count, 1);
  pending.resolve({ ok: true, materials: present() }); await first; assert.match(h.report(), /本轮检查通过/);
});

test('editing a reply immediately invalidates results without redrawing the editor or issuing network calls', async () => {
  const h = harness(); h.complete(); await h.check(); const markup = h.node('page-content').innerHTML;
  h.update('response', 'Changed'); assert.match(h.host.innerHTML, /请重新检查/);
  assert.equal(h.node('page-content').innerHTML, markup); assert.equal(h.calls.length, 1);
});

test('changes during a check discard the late result instead of showing a false pass', async () => {
  const h = harness(); h.complete(); const pending = deferred();
  h.context.window.parent.__academicCheckRevisionMaterials = () => pending.promise;
  const request = h.check(); h.update('response', 'Changed during read'); pending.resolve({ ok: true, materials: present() });
  const entry = await request; assert.equal(entry.status, 'stale'); assert.doesNotMatch(h.report(), /本轮检查通过/);
});

test('upload/delete notifications invalidate matching materials only, including in-flight checks', async () => {
  const h = harness(); h.complete(); await h.check(); const id = h.rounds()[0].attachmentRoundId;
  h.context.invalidateRevisionPreflightMaterials('submission_rother12345_revision'); assert.match(h.report(), /本轮检查通过/);
  h.context.invalidateRevisionPreflightMaterials('submission_' + id + '_response'); assert.match(h.host.innerHTML, /请重新检查/);
  const pending = deferred(); h.context.window.parent.__academicCheckRevisionMaterials = () => pending.promise;
  const check = h.check(); h.context.invalidateRevisionPreflightMaterials('submission_' + id + '_revision');
  pending.resolve({ ok: true, materials: present() }); assert.equal((await check).status, 'stale');
});

test('only the trusted parent can invalidate material checks through browser messages', async () => {
  const h = harness(); h.complete(); await h.check();
  const start = source.indexOf('window.addEventListener("message", event => {') + 'window.addEventListener("message", '.length;
  const end = source.indexOf('\n  });\n  document.getElementById("page-content")', start);
  const handler = vm.runInContext('(' + source.slice(start, end) + '\n})', h.context);
  const data = { type: 'academic-research-hub-materials-changed', contextId: 'submission_' + h.rounds()[0].attachmentRoundId + '_response' };
  handler({ origin: 'https://evil.test', source: h.context.window.parent, data });
  handler({ origin: 'https://example.test', source: {}, data }); assert.match(h.report(), /本轮检查通过/);
  handler({ origin: 'https://example.test', source: h.context.window.parent, data }); assert.match(h.report(), /请重新检查/);
});

test('material linkage is retained when files precede opinions, history is deleted, or paper moves to published', () => {
  const h = harness(); h.attach(); const fileId = h.field('history')[0].attachmentRoundId;
  h.add(); assert.equal(h.rounds()[0].attachmentRoundId, fileId);
  h.context.deleteHistory('paper1', 0); assert.equal(h.rounds()[0].attachmentRoundId, fileId);
  h.context.moveToPublished('paper1');
  assert.equal(h.run('getSubmissionRevisionRounds(DATA.published[0])[0].attachmentRoundId'), fileId);
});

test('creating materials after opinions preserves the original opinion and material IDs', () => {
  const h = harness(); h.add(); const round = h.rounds()[0]; h.attach();
  assert.equal(h.rounds()[0].id, round.id); assert.equal(h.rounds()[0].items[0].id, round.items[0].id);
  assert.equal(h.rounds()[0].attachmentRoundId, h.field('history')[0].attachmentRoundId);
});

test('legacy unlinked archives never guess material identity from matching dates or round numbers', () => {
  const h = harness();
  h.context.setPaperField(h.run('DATA.submitted[0]'), 'history', []);
  h.context.setPaperField(h.run('DATA.submitted[0]'), 'submissionRevisionRounds', [{ id: 'rlegacy12345', number: 1, date: '2026-10-01', items: [] }]);
  h.context.setPaperField(h.run('DATA.submitted[0]'), 'submissionFileRounds', [{ id: 'rmaterials1', number: 1, date: '2026-10-01' }]);
  assert.equal(h.run('revisionPreflightSnapshot(DATA.submitted[0], "rlegacy12345").fileRoundId'), '');
  let calls = 0; h.context.openSubmissionFiles = () => calls++;
  h.context.openRevisionPreflightMaterial('paper1', 'rlegacy12345', 'response');
  assert.equal(calls, 0); assert.match(h.alerts.at(-1), /不会.*猜测/);
});

test('material action opens the exact existing private context and refuses unsupported types', () => {
  const h = harness(); h.complete(); const calls = [];
  h.context.openSubmissionFiles = (...args) => calls.push(args);
  h.context.openRevisionPreflightMaterial('paper1', null, 'response');
  assert.deepEqual(calls[0], ['paper1', h.rounds()[0].attachmentRoundId, 'response']);
  h.context.openRevisionPreflightMaterial('paper1', null, '__proto__'); assert.equal(calls.length, 1);
});

test('preflight escapes group labels and errors, and locating a blank response focuses its real field', async () => {
  const h = harness(); h.add(); h.context.renameRevisionGroup('paper1', null, 'geditor001', '<img src=x>'); h.update('groupId', 'geditor001');
  h.context.window.parent.__academicCheckRevisionMaterials = async () => { throw new Error('<script>bad</script>'); };
  await h.check(); const markup = h.report(); assert.ok(markup.includes('&lt;img')); assert.ok(markup.includes('&lt;script&gt;')); assert.ok(!markup.includes('<script>'));
  const round = h.rounds()[0], focused = [], group = { open: false };
  const item = { dataset: { revisionItem: round.items[0].id }, closest: () => group, scrollIntoView() {}, focus() {}, querySelector: selector => ({ focus: () => focused.push(selector) }) };
  const panel = { dataset: { revisionRound: round.id }, open: false, querySelectorAll: () => [item] };
  const card = { dataset: { paperKey: 'paper1' }, querySelectorAll: selector => selector === '[data-revision-round]' ? [panel] : [item] };
  h.context.document.querySelectorAll = () => [card];
  h.context.jumpToRevisionPreflightItem('paper1', null, round.items[0].id, 'reply');
  assert.equal(group.open, true); assert.match(focused[0], /回复文字/);
});

function parentHarness() {
  const calls = [], frame = { contentWindow: {} }, roundId = 'rmaterials123';
  const context = vm.createContext({ window: {}, account: { email: 'test@example.com' }, navigator: { onLine: true }, activeWorkspaceConflict: null,
    $: () => frame, autoSaveDraftAccountKey: () => context.account?.email || 'local',
    projectPaperTargets: () => [{ id: 'paper1', kind: 'submitted', item: { submissionFileRounds: [{ id: roundId }] } }],
    Promise, Error, String, Array, Object, Number
  });
  context.window.__academicAttachments = { list: async (kind, id) => { calls.push({ kind, id }); return [{ file_name: 'Private.docx' }]; } };
  const start = app.indexOf('  // ===== 返修提交前：只读核对私有材料 =====');
  vm.runInContext(app.slice(start, app.indexOf('  // ===== 返修意见与待办联动 =====', start)), context);
  return { context, calls, frame, roundId, check: request => context.window.__academicCheckRevisionMaterials(frame.contentWindow, request || { paperKey: 'paper1', fileRoundId: roundId }) };
}

test('parent reads only metadata in the exact two private round/type contexts, without returning filenames', async () => {
  const h = parentHarness(), result = await h.check();
  assert.equal(result.materials.revision.state, 'present'); assert.equal(result.materials.response.count, 1);
  assert.deepEqual(h.calls, [{ kind: 'paper', id: 'submission_rmaterials123_revision' }, { kind: 'paper', id: 'submission_rmaterials123_response' }]);
  assert.ok(!JSON.stringify(result).includes('Private.docx'));
});

test('parent validates source, login, offline/conflicts, paper and file catalogue before reading metadata', async () => {
  const h = parentHarness();
  await assert.rejects(h.context.window.__academicCheckRevisionMaterials({}, {}), /来源无效/);
  for (const request of [{ paperKey: 'missing', fileRoundId: h.roundId }, { paperKey: 'paper1', fileRoundId: 'runknown1234' }, { paperKey: "bad'", fileRoundId: h.roundId }]) await assert.rejects(h.check(request));
  h.context.account = null; await assert.rejects(h.check(), /先登录/); h.context.account = { email: 'test@example.com' };
  h.context.navigator.onLine = false; await assert.rejects(h.check(), /离线/); h.context.navigator.onLine = true;
  h.context.activeWorkspaceConflict = {}; await assert.rejects(h.check(), /同步冲突/); assert.equal(h.calls.length, 0);
});

test('parent distinguishes confirmed absence from permission/network failures and unlinked archives', async () => {
  const h = parentHarness();
  h.context.window.__academicAttachments.list = async (_kind, id) => { if (id.endsWith('_response')) throw new Error('Denied'); return []; };
  const result = await h.check(); assert.equal(result.materials.revision.state, 'missing'); assert.equal(result.materials.response.state, 'unknown');
  const unlinked = await h.check({ paperKey: 'paper1', fileRoundId: '' }); assert.equal(unlinked.materials.revision.state, 'unknown');
});

test('account changes while metadata loads discard the old account result', async () => {
  const h = parentHarness(), pending = deferred(); h.context.window.__academicAttachments.list = () => pending.promise;
  const check = h.check(); h.context.account = { email: 'other@example.com' }; pending.resolve([]);
  await assert.rejects(check, /账号已切换/);
});
