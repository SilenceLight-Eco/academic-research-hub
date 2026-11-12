const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const staticApiSource = fs.readFileSync(path.join(__dirname, '../web/static-api.js'), 'utf8');
const harnessSource = fs.readFileSync(path.join(__dirname, 'test-reference-operations.cjs'), 'utf8');
const apiContext = vm.createContext({ staticApiSource, vm, structuredClone, Response, Request, Headers, URL, setTimeout, clearTimeout, Date, Math, JSON, Object, Array, String, Number, Boolean, Map, Set, Promise, Error, RegExp, console });
vm.runInContext(harnessSource.slice(harnessSource.indexOf('function createApiHarness('), harnessSource.indexOf('\ntest(')), apiContext);
const apiHarness = apiContext.createApiHarness;
async function request(h, body) { const response = await h.request(body, '/api/replications'); return { status: response.status, data: await response.json() }; }
async function create(h) { const result = await request(h, { action: 'create' }); assert.equal(result.status, 200); return result.data.createdId; }

test('legacy workspaces load an empty replication library without writes and guest access is rejected', async () => {
  const h = apiHarness({ todos: [] });
  assert.deepEqual((await (await h.get('/api/replications')).json()).replications, { items: [], trash: [] });
  assert.equal(h.writeCount(), 0);
  const guest = apiHarness({}, { signedOut: true });
  assert.equal((await guest.get('/api/replications')).status, 401);
  assert.equal((await request(guest, { action: 'create' })).status, 401);
  assert.equal(guest.writeCount(), 0);
});

test('replication create/save/reload preserves complete content, other modules and immutable IDs', async () => {
  const h = apiHarness({ peerReviews: { items: [{ id: 'keep' }] } });
  const id = await create(h), anotherId = await create(h); assert.notEqual(id, anotherId);
  const payload = { action: 'save', id, title: '复现论文', authors: 'A; B', doi: '10.1234/example', status: '复现中', environment: 'Stata 19', runOrder: '1. 清理\n2. 回归\n\n', results: '表 1\n\n结果', notes: ' 保留空格\n\n', unexpected: 'ignore', created: 'fake' };
  assert.equal((await request(h, payload)).status, 200);
  const loaded = apiHarness(h.readWorkspace());
  const library = (await (await loaded.get('/api/replications')).json()).replications;
  const item = library.items.find(item => item.id === id);
  for (const field of ['title', 'authors', 'doi', 'status', 'environment', 'runOrder', 'results', 'notes']) assert.equal(item[field], payload[field]);
  assert.equal(item.unexpected, undefined); assert.notEqual(item.created, 'fake');
  assert.equal(h.readWorkspace().peerReviews.items[0].id, 'keep');
  await request(h, { action: 'save', id, notes: 'Changed' });
  assert.equal(h.readWorkspace().replications.items.find(item => item.id === id).environment, 'Stata 19');
});

test('invalid and failed writes never partially change persisted replication content', async () => {
  const h = apiHarness({}); const id = await create(h), before = h.readWorkspace();
  for (const body of [{ action: 'unknown' }, { action: 'save', id: 'missing' }, { action: 'save', id, title: 'Do not persist', status: 'invalid' }, { action: 'save', id, notes: 'x'.repeat(100001) }, { action: 'save', id, authors: [] }]) {
    assert.ok((await request(h, body)).status >= 400); assert.deepEqual(h.readWorkspace(), before);
  }
  const offline = apiHarness(before, { failWrites: true });
  assert.ok((await request(offline, { action: 'save', id, title: 'Offline' })).status >= 400);
  assert.deepEqual(offline.readWorkspace(), before);
});

test('trash and restore retain task IDs used by cloud materials and stale saves cannot recreate deleted tasks', async () => {
  const h = apiHarness({}); const id = await create(h);
  await request(h, { action: 'save', id, notes: 'Keep my materials' });
  const removed = await request(h, { action: 'trash', id });
  assert.equal(removed.data.replications.items.length, 0);
  assert.equal((await request(h, { action: 'save', id, title: 'Stale' })).status, 404);
  const restored = await request(h, { action: 'restore', id: removed.data.replications.trash[0].id });
  assert.equal(restored.data.replications.items[0].id, id);
  assert.equal(restored.data.replications.items[0].notes, 'Keep my materials');
  assert.equal(restored.data.replications.trash.length, 0);
});

const app = fs.readFileSync(path.join(__dirname, '../web/app.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../web/workbench.html'), 'utf8');
function uiHarness(options = {}) {
  const nodes = new Map(), slots = {}, calls = [], toasts = [], files = [];
  const state = { panel: 'replications', replications: { items: [], trash: [] }, replicationId: null, replicationTrashOpen: false };
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { value: '', innerHTML: '', textContent: '', handlers: {}, addEventListener(type, fn) { this.handlers[type] = fn; } });
    return nodes.get(id);
  };
  const context = vm.createContext({ state, account: { id: 'user' }, autoSaveSlots: slots,
    window: { __academicOpenAttachments: (...args) => { files.push(args); return true; } },
    $: selector => node(selector.slice(1)), $$: () => [],
    escapeHtml: value => String(value).replace(/</g, '&lt;').replace(/"/g, '&quot;'), escapeAttribute: value => String(value).replace(/"/g, '&quot;'),
    toast: text => toasts.push(text), confirm: () => true,
    api: async (endpoint, init) => { const payload = init && JSON.parse(init.body); calls.push({ endpoint, payload }); return options.api ? options.api(payload, state) : { ok: true, replications: structuredClone(state.replications) }; },
    queueAutoSave: (key, payload, persist) => { slots[key] = { dirty: true, payload, persist }; },
    afterCurrentEditorSaved: async (_panel, callback) => {
      try { const slot = slots['replication:' + state.replicationId]; if (slot && slot.dirty) { await slot.persist(slot.payload); slot.dirty = false; } return await callback(); }
      catch (error) { toasts.push(error.message); }
    }
  });
  const start = app.indexOf('  // ===== 论文复现 ====='), end = app.indexOf('  // ===== 数据与代码：', start);
  vm.runInContext(app.slice(start, end), context);
  function select(extras = {}) {
    const item = { id: 'rp-one', title: 'Test', authors: '', doi: '', status: '未开始', environment: '', runOrder: '', results: '', notes: '', ...extras };
    state.replications.items.push(item); state.replicationId = item.id; context.renderReplications(); return item;
  }
  return { context, state, node, slots, calls, toasts, files, select };
}

test('normal input handlers queue all fields without replacing the active form; search covers concrete content', () => {
  const h = uiHarness(); h.select(); h.context.bindReplicationEvents();
  h.node('replicationNotes').value = '具体报错说明\n\n';
  h.node('replicationNotes').handlers.input();
  assert.equal(h.slots['replication:rp-one'].payload.notes, '具体报错说明\n\n');
  h.state.replicationQuery = '报错'; h.context.renderReplicationList(); assert.ok(h.node('replicationList').innerHTML.includes('Test'));
  assert.equal(h.node('replicationNotes').value, '具体报错说明\n\n');
});

test('manual save succeeds only after cloud confirmation; failed saves preserve dirty edits and block file opening', async () => {
  const h = uiHarness({ api: async () => ({ ok: false, error: 'Offline' }) }); h.select();
  h.node('replicationResults').value = 'Unsaved results';
  assert.equal(await h.context.saveReplication(), false);
  assert.equal(h.slots['replication:rp-one'].dirty, true);
  assert.equal(h.node('replicationResults').value, 'Unsaved results');
  assert.equal(await h.context.openReplicationFiles('paper'), false); assert.equal(h.files.length, 0);
  assert.ok(h.toasts.every(text => !text.includes('已保存')));
});

test('PDF, supplemental and code buttons open separate private attachment contexts after saving', async () => {
  const h = uiHarness(); h.select(); h.context.bindReplicationEvents();
  for (const kind of ['paper', 'supplement', 'code']) assert.equal(await h.context.openReplicationFiles(kind), true);
  assert.deepEqual(h.files.map(args => args.slice(0, 2)), [['paper', 'replication_rp-one_paper'], ['paper', 'replication_rp-one_supplement'], ['paper', 'replication_rp-one_code']]);
  assert.equal(await h.context.openReplicationFiles('unknown'), false);
  assert.throws(() => h.context.replicationFileContext('../bad', 'paper'));
  for (const kind of ['paper', 'supplement', 'code']) assert.ok(html.includes('data-replication-file="' + kind + '"'));
  assert.ok(h.node('replicationFiles').handlers.click);
});

test('late loads and saves from a different account cannot repopulate the module or open files', async () => {
  let resolve;
  const h = uiHarness({ api: () => new Promise(done => { resolve = done; }) }); h.select();
  const pending = h.context.openReplicationFiles('code');
  h.context.account = { id: 'new-user' }; h.state.replications = { items: [], trash: [] }; h.state.replicationId = null;
  resolve({ ok: true, replications: { items: [{ id: 'old', title: 'Private' }] } });
  assert.equal(await pending, false); assert.equal(h.files.length, 0); assert.equal(h.state.replications.items.length, 0);
});

test('switching tasks flushes the selected draft and incoming data preserves newer unsaved changes', async () => {
  const h = uiHarness(); h.select(); h.context.bindReplicationEvents();
  h.state.replications.items.push({ id: 'rp-two', title: 'Second', status: '未开始' });
  h.node('replicationNotes').value = 'Latest draft'; h.context.queueReplicationAutoSave();
  h.context.applyReplications({ items: [{ id: 'rp-one', title: 'Old', notes: 'Old' }, h.state.replications.items[1]], trash: [] });
  assert.equal(h.context.activeReplication().notes, 'Latest draft');
  h.node('replicationList').handlers.click({ target: { closest: selector => selector === '[data-replication-open]' ? { dataset: { replicationOpen: 'rp-two' } } : null } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.calls[0].payload.notes, 'Latest draft'); assert.equal(h.state.replicationId, 'rp-two');
});

test('navigation, switch autosave, draft recovery, backup and unified search include paper replication', () => {
  for (const text of ["'replications': '论文复现'", "return persistReplication", "return 'replication:' + state.replicationId", "if (panel === 'replications') loadReplications()", "addLine('论文复现', ['replications']", "['replications', '/api/replications', 'replications']"]) assert.ok(app.includes(text), text);
  assert.ok(html.includes('data-panel="replications"')); assert.ok(html.includes('id="panel-replications"'));
});

test('a delayed load cannot overwrite a newer confirmed save', async () => {
  let resolveLoad;
  const h = uiHarness({ api: async payload => {
    if (!payload) return new Promise(resolve => { resolveLoad = resolve; });
    return { ok: true, replications: { items: [{ ...payload }], trash: [] } };
  } });
  h.select();
  const loading = h.context.loadReplications();
  await h.context.persistReplication({ action: 'save', id: 'rp-one', title: 'New saved title', status: '复现中' });
  resolveLoad({ ok: true, replications: { items: [{ id: 'rp-one', title: 'Old title' }], trash: [] } });
  await loading;
  assert.equal(h.context.activeReplication().title, 'New saved title'); assert.equal(h.state.replicationLoading, false);
});
