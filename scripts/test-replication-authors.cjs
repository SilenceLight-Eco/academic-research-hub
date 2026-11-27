const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, file), 'utf8');
const app = read('../web/app.js'), html = read('../web/workbench.html');
const toolsContext = vm.createContext({ window: {} }); vm.runInContext(read('../web/research-tools.js'), toolsContext);
const tools = toolsContext.window.__academicResearchTools;
const staticApiSource = read('../web/static-api.js'), harnessSource = read('test-reference-operations.cjs');
const apiContext = vm.createContext({ staticApiSource, vm, structuredClone, Response, Request, Headers, URL, setTimeout, clearTimeout, Date, Math, JSON, Object, Array, String, Number, Boolean, Map, Set, Promise, Error, RegExp, console });
vm.runInContext(harnessSource.slice(harnessSource.indexOf('function createApiHarness('), harnessSource.indexOf('\ntest(')), apiContext);
const apiHarness = (payload, options = {}) => apiContext.createApiHarness(payload, { researchTools: tools, ...options });
const request = (h, body) => h.request(body, '/api/replications');
const repSource = read('test-replications.cjs'), repContext = vm.createContext({ app, html, vm, structuredClone });
vm.runInContext(repSource.slice(repSource.indexOf('function uiHarness('), repSource.indexOf('\ntest(', repSource.indexOf('function uiHarness('))), repContext);
const payload = () => ({ replications: { items: [{ id: 'rp-one', title: '论文', authors: '原作者', status: '未开始' }], trash: [], folders: [] } });

test('separate ordered author rows and blank drafts survive cloud reload, partial saves and trash restoration', async () => {
  const h = apiHarness(payload()), authorList = ['张三', 'Doe, Jane', ''];
  assert.equal((await request(h, { action: 'save', id: 'rp-one', authorList, authors: 'stale combined value' })).status, 200);
  await request(h, { action: 'save', id: 'rp-one', notes: 'keep' });
  const loaded = apiHarness(h.readWorkspace());
  const item = (await (await loaded.get('/api/replications')).json()).replications.items[0];
  assert.deepEqual(item.authorList, authorList); assert.equal(item.authors, '张三；Doe, Jane');
  await request(h, { action: 'trash', id: 'rp-one' });
  await request(h, { action: 'restore', id: h.readWorkspace().replications.trash[0].id });
  assert.deepEqual(h.readWorkspace().replications.items[0].authorList, authorList);
});

test('invalid author rows and failed saves never partially change the existing workspace', async () => {
  const original = payload(), h = apiHarness(original);
  for (const authorList of ['not an array', [3], ['bad\0name'], Array(101).fill(''), ['a'.repeat(1001)], ['a'.repeat(600), 'b'.repeat(600)]]) {
    assert.equal((await request(h, { action: 'save', id: 'rp-one', title: 'Must not persist', authorList })).status, 422);
    assert.deepEqual(h.readWorkspace(), original);
  }
  const offline = apiHarness(original, { failWrites: true });
  assert.ok((await request(offline, { action: 'save', id: 'rp-one', authorList: ['New'] })).status >= 400);
  assert.deepEqual(offline.readWorkspace(), original);
});

test('legacy combined names remain usable and English family-name commas are not mistaken for author boundaries', async () => {
  const h = repContext.uiHarness(); h.select({ authors: '张三；Doe, Jane; Smith, John' });
  assert.deepEqual(Array.from(h.context.activeReplication().authorList), ['张三', 'Doe, Jane', 'Smith, John']);
  assert.match(h.node('replicationAuthorList').innerHTML, /aria-label="作者3"/);
  const api = apiHarness(payload());
  await request(api, { action: 'save', id: 'rp-one', authorList: ['A', 'B'] });
  await request(api, { action: 'save', id: 'rp-one', authors: 'Updated by legacy client' });
  assert.equal(api.readWorkspace().replications.items[0].authorList, undefined);
  assert.equal(api.readWorkspace().replications.items[0].authors, 'Updated by legacy client');
});

test('add, input and remove handlers autosave separate names and renumber without redrawing another field', () => {
  const h = repContext.uiHarness(); h.select({ authors: 'First' }); h.context.bindReplicationEvents();
  h.node('replicationAuthorAdd').handlers.click();
  assert.equal(h.context.activeReplication().authorList.length, 2);
  const input = { dataset: { replicationAuthorIndex: '1', replicationAuthorTask: 'rp-one' }, value: 'Second' };
  h.node('replicationNotes').value = '正在输入的草稿';
  h.node('panel-replications').handlers.input({ target: { closest: selector => selector === '[data-replication-author-index]' ? input : null } });
  assert.deepEqual(Array.from(h.slots['replication:rp-one'].payload.authorList), ['First', 'Second']);
  assert.equal(h.slots['replication:rp-one'].payload.authors, 'First；Second');
  h.context.changeReplicationAuthor('0', 'rp-one');
  assert.deepEqual(Array.from(h.context.activeReplication().authorList), ['Second']);
  assert.match(h.node('replicationAuthorList').innerHTML, /aria-label="作者1"/);
  assert.doesNotMatch(h.node('replicationAuthorList').innerHTML, /aria-label="作者2"/);
  assert.equal(h.node('replicationNotes').value, '正在输入的草稿');
  h.context.changeReplicationAuthor('0', 'rp-one');
  assert.deepEqual(Array.from(h.slots['replication:rp-one'].payload.authorList), ['']);
});

test('newer author drafts survive stale responses, while stale-task controls and signed-out edits are rejected', () => {
  const h = repContext.uiHarness(); h.select({ authors: 'First' }); h.context.changeReplicationAuthor();
  h.context.applyReplications({ items: [{ id: 'rp-one', authors: 'Old', authorList: ['Old'] }], trash: [] });
  assert.deepEqual(Array.from(h.context.activeReplication().authorList), ['First', '']);
  h.select({ id: 'rp-two', authors: 'Other' });
  h.context.changeReplicationAuthor('0', 'rp-one');
  assert.deepEqual(Array.from(h.context.activeReplication().authorList), ['Other']);
  h.context.account = null; h.context.changeReplicationAuthor(); h.context.renderReplications();
  assert.equal(h.node('replicationAuthorAdd').disabled, true);
  assert.equal(h.context.activeReplication().authorList.length, 1);
});

test('author inputs escape HTML, reports preserve author order and legacy report exports still work', () => {
  const h = repContext.uiHarness(); h.select({ authorList: ['<img src=x>', 'Second'], authors: 'outdated' });
  assert.match(h.node('replicationAuthorList').innerHTML, /&lt;img/); assert.doesNotMatch(h.node('replicationAuthorList').innerHTML, /<img/);
  assert.match(tools.replicationReport({ authorList: ['First', 'Second'], authors: 'outdated' }), /作者：First；Second/);
  assert.match(tools.replicationReport({ authors: 'Legacy author' }), /作者：Legacy author/);
});
