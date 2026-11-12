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
  assert.deepEqual((await (await h.get('/api/replications')).json()).replications, { items: [], trash: [], folders: [] });
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
    if (!nodes.has(id)) nodes.set(id, { value: '', innerHTML: '', textContent: '', handlers: {}, focus() {}, addEventListener(type, fn) { this.handlers[type] = fn; } });
    return nodes.get(id);
  };
  const context = vm.createContext({ state, account: { id: 'user' }, autoSaveSlots: slots,
    window: { __academicOpenAttachments: (...args) => { files.push(args); return true; } },
    $: selector => node(selector.slice(1)), $$: () => [],
    escapeHtml: value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'), escapeAttribute: value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'),
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

test('folders persist across reload and tasks can be created in or moved between folders', async () => {
  const h = apiHarness({ replications: { items: [{ id: 'legacy', title: 'Legacy', status: '未开始' }], trash: [] } });
  const first = await request(h, { action: 'create-folder', name: '实证经济学' });
  const folderId = first.data.createdFolderId; assert.ok(folderId);
  const created = await request(h, { action: 'create', folderId });
  const id = created.data.createdId;
  assert.equal(created.data.replications.items.find(item => item.id === id).folderId, folderId);
  await request(h, { action: 'save', id: 'legacy', folderId });
  const renamed = await request(h, { action: 'rename-folder', folderId, name: '计量方法' });
  assert.equal(renamed.data.replications.folders[0].name, '计量方法');
  assert.equal(renamed.data.replications.items.find(item => item.id === 'legacy').folderId, folderId);
  const reloaded = (await (await apiHarness(h.readWorkspace()).get('/api/replications')).json()).replications;
  assert.equal(reloaded.folders[0].id, folderId); assert.equal(reloaded.items.length, 2);
  await request(h, { action: 'save', id, folderId: '' });
  assert.equal(h.readWorkspace().replications.items.find(item => item.id === id).folderId, '');
});

test('deleting one folder moves active and trashed tasks to unfiled while preserving IDs, content and other folders', async () => {
  const h = apiHarness({});
  const folderId = (await request(h, { action: 'create-folder', name: 'To remove' })).data.createdFolderId;
  const other = (await request(h, { action: 'create-folder', name: 'Keep' })).data.createdFolderId;
  const id = (await request(h, { action: 'create', folderId })).data.createdId;
  const trashedId = (await request(h, { action: 'create', folderId })).data.createdId;
  await request(h, { action: 'save', id, notes: 'Preserve content' });
  await request(h, { action: 'trash', id: trashedId });
  const result = await request(h, { action: 'delete-folder', folderId });
  assert.equal(result.status, 200);
  const library = result.data.replications;
  assert.deepEqual(library.folders.map(folder => folder.id), [other]);
  assert.equal(library.items[0].id, id); assert.equal(library.items[0].notes, 'Preserve content'); assert.equal(library.items[0].folderId, '');
  assert.equal(library.trash[0].item.id, trashedId); assert.equal(library.trash[0].item.folderId, '');
  const restored = await request(h, { action: 'restore', id: library.trash[0].id });
  assert.equal(restored.data.replications.items.find(item => item.id === trashedId).folderId, '');
});

test('invalid folder changes and failed cloud writes leave the folder catalog and tasks unchanged', async () => {
  const h = apiHarness({});
  const folderId = (await request(h, { action: 'create-folder', name: 'First' })).data.createdFolderId;
  const id = await create(h), before = h.readWorkspace();
  for (const body of [
    { action: 'create-folder', name: '' }, { action: 'create-folder', name: '未分类' },
    { action: 'create-folder', name: 'First', folderId }, { action: 'create-folder', name: 'first' },
    { action: 'rename-folder', folderId: 'missing', name: 'New' }, { action: 'delete-folder', folderId: 'missing' },
    { action: 'create-folder', name: 'x'.repeat(81) }, { action: 'save', id, folderId: 'missing' }, { action: 'create', folderId: 'missing' }
  ]) {
    assert.ok((await request(h, body)).status >= 400); assert.deepEqual(h.readWorkspace(), before);
  }
  const failing = apiHarness(before, { failWrites: true });
  assert.ok((await request(failing, { action: 'delete-folder', folderId })).status >= 400); assert.deepEqual(failing.readWorkspace(), before);
});

test('empty folders and legacy unfiled tasks render under collapsible groups with escaped names', () => {
  const h = uiHarness(); h.select();
  h.state.replications.folders = [{ id: 'f1', name: '<b>Folder' }, { id: 'empty', name: 'Empty' }];
  h.state.replications.items.push({ id: 'rp-two', title: 'Classified', folderId: 'f1' });
  h.context.renderReplications();
  const markup = h.node('replicationList').innerHTML;
  assert.ok(markup.includes('data-replication-folder="f1"')); assert.ok(markup.includes('data-replication-folder="empty"'));
  assert.ok(markup.includes('Empty (0)')); assert.ok(markup.includes('&lt;b>Folder')); assert.ok(!markup.includes('<b>Folder'));
  assert.equal((markup.match(/data-replication-open="rp-one"/g) || []).length, 1);
  assert.equal((markup.match(/data-replication-open="rp-two"/g) || []).length, 1);
  assert.ok(h.node('replicationFolder').innerHTML.includes('value="f1"'));
});

test('folder collapse is native, survives editor redraws, and selecting a folder does not redraw its summary', () => {
  const h = uiHarness(); h.select({ folderId: 'f1' }); h.state.replications.folders = [{ id: 'f1', name: 'One' }]; h.context.bindReplicationEvents(); h.context.renderReplications();
  assert.ok(h.node('replicationList').innerHTML.includes('data-replication-folder="f1" open'));
  const summary = { closest: () => ({ dataset: { replicationFolder: 'f1' } }) };
  const markup = h.node('replicationList').innerHTML;
  h.node('replicationList').handlers.click({ target: { closest: selector => selector === 'summary' ? summary : null } });
  assert.equal(h.state.replicationFolderId, 'f1'); assert.equal(h.node('replicationList').innerHTML, markup);
  h.node('replicationList').handlers.toggle({ target: { matches: () => true, isConnected: true, dataset: { replicationFolder: 'f1' }, open: false } });
  h.context.renderReplications();
  assert.ok(!h.node('replicationList').innerHTML.includes('data-replication-folder="f1" open'));
});

test('folder create and rename forms are inline, retain input on failure, and new tasks inherit the selected folder', async () => {
  const h = uiHarness(); h.state.replications.folders = [{ id: 'f1', name: 'One' }]; h.context.bindReplicationEvents();
  h.node('replicationFolderNew').handlers.click(); assert.equal(h.node('replicationFolderForm').hidden, false);
  h.context.editReplicationFolder('f1'); assert.equal(h.node('replicationFolderName').value, 'One'); assert.equal(h.node('replicationFolderSubmit').textContent, '保存名称');
  h.state.replicationFolderId = 'f1'; await h.context.mutateReplication('create');
  assert.equal(h.calls[0].payload.folderId, 'f1');
  const failing = uiHarness({ api: async () => ({ ok: false, error: 'Offline' }) });
  failing.context.editReplicationFolder(''); failing.node('replicationFolderName').value = 'Retain';
  assert.equal(await failing.context.saveReplicationFolder('create-folder', ''), false);
  assert.equal(failing.node('replicationFolderName').value, 'Retain'); assert.equal(failing.node('replicationFolderForm').hidden, false);
});

test('moving a task queues its folder with the ordinary autosave payload and leaves attachment IDs stable', () => {
  const h = uiHarness(); h.select(); h.state.replications.folders = [{ id: 'f1', name: 'One' }]; h.context.renderReplications(); h.context.bindReplicationEvents();
  const attachment = h.context.replicationFileContext('rp-one', 'code');
  h.node('replicationFolder').value = 'f1'; h.node('replicationFolder').handlers.change();
  assert.equal(h.slots['replication:rp-one'].payload.folderId, 'f1'); assert.equal(h.context.activeReplication().folderId, 'f1');
  assert.equal(h.state.replicationFolderCollapsed.f1, false);
  assert.equal(h.context.replicationFileContext('rp-one', 'code'), attachment);
});

test('creating a folder clears the search so the new empty folder is immediately visible', async () => {
  const h = uiHarness({ api: async () => ({ ok: true, createdFolderId: 'new', replications: { items: [], trash: [], folders: [{ id: 'new', name: 'Created' }] } }) });
  h.state.replicationQuery = 'Old search'; h.context.editReplicationFolder(''); h.node('replicationFolderName').value = 'Created';
  assert.equal(await h.context.saveReplicationFolder('create-folder', ''), true);
  assert.equal(h.state.replicationQuery, ''); assert.ok(h.node('replicationList').innerHTML.includes('Created (0)'));
  assert.equal(h.node('replicationFolderForm').hidden, true);
});
