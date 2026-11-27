const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, file), 'utf8');
const app = read('../web/app.js'), html = read('../web/workbench.html');
const toolsContext = vm.createContext({ window: {} });
vm.runInContext(read('../web/research-tools.js'), toolsContext);
const tools = toolsContext.window.__academicResearchTools;
const harnessSource = read('test-reference-operations.cjs'), staticApiSource = read('../web/static-api.js');
const apiContext = vm.createContext({ staticApiSource, vm, structuredClone, Response, Request, Headers, URL, setTimeout, clearTimeout, Date, Math, JSON, Object, Array, String, Number, Boolean, Map, Set, Promise, Error, RegExp, console });
vm.runInContext(harnessSource.slice(harnessSource.indexOf('function createApiHarness('), harnessSource.indexOf('\ntest(')), apiContext);
const apiHarness = (payload, options = {}) => apiContext.createApiHarness(payload, { researchTools: tools, ...options });
const repSource = read('test-replications.cjs'), repContext = vm.createContext({ app, html, vm, structuredClone });
vm.runInContext(repSource.slice(repSource.indexOf('function uiHarness('), repSource.indexOf('\ntest(', repSource.indexOf('function uiHarness('))), repContext);
const sample = { id: 'local-1', kind: 'data', name: '示例.csv', path: 'D:\\研究材料\\示例.csv', notes: '大文件保存在本机' };
const request = (h, body) => h.request(body, '/api/replications');
const tick = () => new Promise(resolve => setImmediate(resolve));
function button(action, kind = 'data', row = null, name = '') { return { dataset: { replicationLocalAction: action, replicationLocalKind: kind, replicationLocalName: name }, closest: () => row }; }
function row(id = 'local-1', task = 'rp-one') { return { dataset: { replicationLocalId: id, replicationLocalTask: task } }; }

test('local paths persist in the account workspace through reload, partial saves, trash and restore without storing binary data', async () => {
  const h = apiHarness({ replications: { items: [{ id: 'rp-one', title: '论文', status: '未开始' }], trash: [] }, todos: [{ id: 'keep' }] });
  assert.equal((await request(h, { action: 'save', id: 'rp-one', localFiles: [sample] })).status, 200);
  await request(h, { action: 'save', id: 'rp-one', notes: '新笔记' });
  const loaded = apiHarness(h.readWorkspace());
  assert.deepEqual((await (await loaded.get('/api/replications')).json()).replications.items[0].localFiles, [sample]);
  await request(h, { action: 'trash', id: 'rp-one' });
  await request(h, { action: 'restore', id: h.readWorkspace().replications.trash[0].id });
  assert.deepEqual(h.readWorkspace().replications.items[0].localFiles, [sample]);
  assert.equal(h.readWorkspace().todos[0].id, 'keep');
});

test('invalid local records and failed cloud writes never partially replace saved task content', async () => {
  const payload = { replications: { items: [{ id: 'rp-one', title: '论文', status: '未开始', localFiles: [sample] }], trash: [], folders: [] } };
  const h = apiHarness(payload);
  for (const rows of [[sample, sample], [{ ...sample, kind: 'unknown' }], [{ ...sample, path: [] }], [{ ...sample, path: 'a\0b' }], [{ ...sample, path: 'x'.repeat(4097) }], Array(201).fill(sample)]) {
    assert.equal((await request(h, { action: 'save', id: 'rp-one', title: 'Must not change', localFiles: rows })).status, 422);
    assert.deepEqual(h.readWorkspace(), payload);
  }
  const offline = apiHarness(payload, { failWrites: true });
  assert.ok((await request(offline, { action: 'save', id: 'rp-one', localFiles: [] })).status >= 400);
  assert.deepEqual(offline.readWorkspace(), payload);
});

test('all five categories add and edit inline local records through normal handlers and retain newer pending drafts', async () => {
  const h = repContext.uiHarness(); h.select(); h.context.bindReplicationEvents();
  for (const kind of ['paper', 'supplement', 'data', 'code', 'result']) {
    await h.context.replicationLocalFileAction(button('add', kind, null, '大文件.csv'));
    const file = h.context.activeReplication().localFiles.at(-1);
    const input = { value: 'D:\\材料\\' + kind + '.csv', dataset: { replicationLocalField: 'path' }, closest: () => row(file.id) };
    h.node('panel-replications').handlers.input({ target: { closest: () => input } });
    assert.equal(file.path, input.value);
    assert.match(h.node('replicationLocalFiles_' + kind).innerHTML, /aria-label="本地文件路径"/);
    assert.ok(html.includes('id="replicationLocalFiles_' + kind + '"'));
  }
  assert.equal(h.slots['replication:rp-one'].payload.localFiles.length, 5);
  h.context.applyReplications({ items: [{ id: 'rp-one', localFiles: [] }], trash: [] });
  assert.equal(h.context.activeReplication().localFiles.length, 5);
  h.state.replicationQuery = 'D:\\材料\\data.csv'; h.context.renderReplicationList();
  assert.match(h.node('replicationList').innerHTML, /Test/);
});

test('copy uses the exact recorded path; removing a path only edits metadata and never calls attachment removal', async () => {
  let removed = 0; const copied = [];
  const h = repContext.uiHarness({ attachments: { list: async () => [], remove: async () => { removed++; } } });
  h.select({ localFiles: [{ ...sample }] }); h.context.navigator = { clipboard: { writeText: async value => copied.push(value) } };
  await h.context.replicationLocalFileAction(button('copy', 'data', row()));
  assert.deepEqual(copied, [sample.path]);
  await h.context.replicationLocalFileAction(button('remove', 'data', row()));
  assert.equal(h.context.activeReplication().localFiles.length, 0); assert.equal(removed, 0);
  assert.equal(h.slots['replication:rp-one'].payload.localFiles.length, 0);
});

test('stale task controls and signed-out users cannot change another task or expose old path records', async () => {
  const h = repContext.uiHarness(); h.select({ localFiles: [{ ...sample }] });
  h.select({ id: 'rp-two', localFiles: [{ ...sample, path: 'E:\\other.csv' }] });
  await h.context.replicationLocalFileAction(button('remove', 'data', row()));
  assert.equal(h.context.activeReplication().localFiles.length, 1);
  h.context.account = null; h.context.renderReplicationLocalFiles('data');
  assert.equal(h.node('replicationLocalFiles_data').innerHTML, '');
  await h.context.replicationLocalFileAction(button('add'));
  assert.equal(h.context.activeReplication().localFiles.length, 1);
});

test('failed uploads offer a filename-prefilled path record; progress does not replace a local path being typed', async () => {
  let finish;
  const h = repContext.uiHarness({ attachments: { list: async () => [], upload: async (_kind, _id, _file, progress) => { progress(20); await new Promise(resolve => { finish = resolve; }); throw Error('超过50 MB'); } } });
  h.select(); const pending = h.context.uploadReplicationFiles('data', [{ name: 'large.csv', size: 80000000 }]); await tick();
  h.node('replicationLocalFiles_data').innerHTML = 'editing marker';
  h.context.renderReplicationUploadStatus('data'); assert.equal(h.node('replicationLocalFiles_data').innerHTML, 'editing marker');
  finish(); await pending;
  assert.match(h.node('replicationLocalFiles_data').innerHTML, /记录失败文件路径：large.csv/);
  await h.context.replicationLocalFileAction(button('add', 'data', null, 'large.csv'));
  assert.equal(h.context.activeReplication().localFiles[0].name, 'large.csv');
  assert.doesNotMatch(h.node('replicationLocalFiles_data').innerHTML, /记录失败文件路径：large.csv/);
});

test('modal failure notifications only offer paths for the matching authenticated owner and category', () => {
  const h = repContext.uiHarness(); h.select(); h.context.bindReplicationEvents();
  const detail = { owner: 'other', kind: 'paper', contextId: 'replication_rp-one_code', name: 'failed.py' };
  h.windowHandlers['academic-attachment-upload-failed']({ detail });
  assert.doesNotMatch(h.node('replicationLocalFiles_code').innerHTML, /failed.py/);
  h.windowHandlers['academic-attachment-upload-failed']({ detail: { ...detail, owner: 'user' } });
  assert.match(h.node('replicationLocalFiles_code').innerHTML, /记录失败文件路径：failed.py/);
});

test('the upload modal reports the exact failed filename and authenticated material context for path prefilling', async () => {
  const source = read('../web/attachments.js'), modalTests = read('test-attachments-ui.cjs');
  const environment = vm.createContext({ source, page: html, vm });
  vm.runInContext(modalTests.slice(modalTests.indexOf('function harness('), modalTests.indexOf('\ntest(')), environment);
  const h = environment.harness({ identity: async () => 'user', upload: async () => { throw Error('too large'); } });
  h.open('replication_rp-one_data'); await tick();
  await h.upload({ name: 'large.csv', size: 80000000 });
  const failed = h.events.find(event => event.type === 'academic-attachment-upload-failed');
  assert.deepEqual(JSON.parse(JSON.stringify(failed.detail)), { owner: 'user', kind: 'paper', contextId: 'replication_rp-one_data', name: 'large.csv' });
});

test('path records escape untrusted text, preserve Unicode and network paths, and appear in reports as local-only references', () => {
  const rows = tools.validateLocalFiles([{ ...sample, path: '\\\\server\\研究文件\\large.csv', name: '<img onerror=bad>' }]);
  assert.equal(rows[0].path, '\\\\server\\研究文件\\large.csv');
  const h = repContext.uiHarness(); h.select({ localFiles: rows });
  assert.match(h.node('replicationLocalFiles_data').innerHTML, /&lt;img/);
  assert.doesNotMatch(h.node('replicationLocalFiles_data').innerHTML, /<img/);
  const report = tools.replicationReport({ title: '论文', localFiles: rows });
  assert.match(report, /文件未上传到云端/); assert.ok(report.includes(rows[0].path));
});
