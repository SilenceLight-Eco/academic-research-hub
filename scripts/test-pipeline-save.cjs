const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../web/pipeline-save.js'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, '../web/app.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../web/paper-pipeline-v2.html'), 'utf8');
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function harness(options = {}) {
  const nodes = new Map(), handlers = {}, windowHandlers = {}, writes = new Map(), timers = [], commits = [];
  let fails = false;
  class Storage {
    setItem(key, value) { if (fails) throw new Error('本机存储空间不足'); writes.set(key, String(value)); }
    getItem(key) { return writes.get(key) ?? null; }
    removeItem(key) { writes.delete(key); }
  }
  const element = () => ({ textContent: '', disabled: false, dataset: {}, children: [], handlers: {},
    setAttribute() {}, addEventListener(type, fn) { this.handlers[type] = fn; },
    append(...items) { this.children.push(...items); }, appendChild(item) { this.children.push(item); } });
  const host = element(); let editors = [];
  const document = { activeElement: null, querySelector: () => host, querySelectorAll: () => editors,
    getElementById: id => host.children.flatMap(child => child.children).find(child => child.id === id) || null,
    createElement: element, addEventListener(type, fn) { handlers[type] = fn; } };
  const localStorage = new Storage();
  const window = { __academicPipelineCloudSave: options.save || (async () => ({ scope: 'cloud' })), addEventListener(type, fn) { windowHandlers[type] = fn; } };
  const context = vm.createContext({ window, document, Storage, localStorage, Map, Date, Promise, Error, Array,
    findPaperByKey: key => ({ _key: key }), commitEditField: (_span, input, paper, field) => { commits.push({ paper: paper._key, field, value: input.value }); localStorage.setItem('research-hub-fields-v1', JSON.stringify({ [paper._key]: { [field]: input.value } })); editors = []; },
    setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout() {}
  });
  vm.runInContext(source, context); handlers.DOMContentLoaded();
  return { context, localStorage, window, document, host, commits, writes, handlers, windowHandlers,
    node: id => document.getElementById(id), fail: value => { fails = value; },
    edit: (field, value) => { const span = { dataset: { editId: 'p1', editField: field } }; editors = [{ value, closest: () => span }]; },
    save: () => document.getElementById('pipelineSaveNow').handlers.click() };
}
test('persistent top-right save control reports saving then confirmed cloud success', async () => {
  const pending = deferred(); const h = harness({ save: () => pending.promise });
  assert.equal(h.host.children[0].className, 'pipeline-save-controls');
  const request = h.save(); assert.equal(h.node('pipelineSaveNow').disabled, true); assert.match(h.node('pipelineSaveStatus').textContent, /正在保存/);
  pending.resolve({ scope: 'cloud' }); await request;
  assert.equal(h.node('pipelineSaveNow').disabled, false); assert.match(h.node('pipelineSaveStatus').textContent, /已保存到云端/);
});
test('manual save commits unfinished inline editing before cloud synchronization and prevents mousedown blur', async () => {
  let saved;
  const h = harness({ save: async () => { saved = JSON.parse(h.writes.get('research-hub-fields-v1')); return { scope: 'cloud' }; } });
  h.edit('title', 'New title'); let prevented = false;
  h.node('pipelineSaveNow').handlers.mousedown({ preventDefault: () => { prevented = true; } });
  await h.save(); assert.equal(prevented, true); assert.equal(saved.p1.title, 'New title'); assert.equal(h.commits.length, 1);
});
test('change-on-blur fields are committed, and repeated saves while busy do not duplicate requests', async () => {
  const pending = deferred(); let calls = 0, blurred = 0;
  const h = harness({ save: () => { calls++; return pending.promise; } });
  h.document.activeElement = { blur: () => { blurred++; h.localStorage.setItem('research-hub-stages-v1', '[]'); } };
  const request = h.save(); await h.save(); assert.equal(calls, 1); assert.equal(blurred, 1);
  pending.resolve({ scope: 'cloud' }); await request;
});
test('local-only save and failed cloud writes never claim cloud success', async () => {
  const local = harness({ save: async () => ({ scope: 'local' }) }); await local.save();
  assert.match(local.node('pipelineSaveStatus').textContent, /已保存本机（未登录）/);
  const failed = harness({ save: async () => { throw new Error('网络断开'); } }); await failed.save();
  assert.match(failed.node('pipelineSaveStatus').textContent, /已保存本机；网络断开/);
  assert.equal(failed.node('pipelineSaveStatus').dataset.state, 'error');
});
test('failed storage writes stay readable and can be retried without losing later changes', async () => {
  const h = harness(); h.fail(true);
  assert.throws(() => h.localStorage.setItem('research-hub-fields-v1', '{"title":"First"}'));
  const latest = JSON.parse(h.localStorage.getItem('research-hub-fields-v1')); latest.title = 'Second'; latest.notes = 'Keep';
  assert.throws(() => h.localStorage.setItem('research-hub-fields-v1', JSON.stringify(latest)));
  await h.save(); assert.match(h.node('pipelineSaveStatus').textContent, /保存失败.*存储空间不足/);
  h.fail(false); await h.save(); assert.deepEqual(JSON.parse(h.writes.get('research-hub-fields-v1')), { title: 'Second', notes: 'Keep' });
  assert.equal(h.node('pipelineSaveStatus').dataset.state, 'saved');
});
test('new edits during saving remain marked as pending; missing synchronization component is not success', async () => {
  const pending = deferred(); const h = harness({ save: () => pending.promise }); const request = h.save();
  h.handlers.input({ target: { closest: () => true } }); pending.resolve({ scope: 'cloud' }); await request;
  assert.match(h.node('pipelineSaveStatus').textContent, /仍有新修改/); assert.equal(h.node('pipelineSaveStatus').dataset.state, 'pending');
  h.window.__academicPipelineCloudSave = undefined; await h.save(); assert.match(h.node('pipelineSaveStatus').textContent, /云端组件尚未就绪/);
});
test('pending storage failures warn before exit, while successful retry clears the warning', async () => {
  const h = harness(); h.fail(true); assert.throws(() => h.localStorage.setItem('research-hub-cards-v1', '{}'));
  let warned = 0; h.windowHandlers.beforeunload({ preventDefault: () => warned++ }); assert.equal(warned, 1);
  h.fail(false); await h.save(); h.windowHandlers.beforeunload({ preventDefault: () => warned++ }); assert.equal(warned, 1);
});

function parentHarness() {
  const frame = { contentWindow: {} }, calls = [], statuses = [];
  const context = vm.createContext({ window: {}, account: { email: 'test@example.test' }, activeWorkspaceConflict: null, navigator: { onLine: true }, state: { panel: 'research-hub' },
    $: () => frame, autoSaveDraftAccountKey: () => context.account?.email || 'local',
    researchHubSnapshot: () => ({ 'research-hub-fields-v1': '{"p1":{"title":"Saved"}}' }),
    api: async (url, options) => { calls.push({ url, body: JSON.parse(options.body) }); return { ok: true }; },
    setGlobalSaveState: message => statuses.push(message), renderTodayBoard() {}, Promise, Error
  });
  const start = app.indexOf('  // Only the same-origin embedded pipeline');
  vm.runInContext(app.slice(start, app.indexOf('  function applySyncData(', start)), context);
  return { context, frame, calls, statuses, save: () => context.window.__academicSavePipeline(frame.contentWindow) };
}
test('embedded save uses the workbench serialized API, writes only pipeline snapshot and validates frame source', async () => {
  const h = parentHarness(); assert.equal((await h.save()).scope, 'cloud');
  assert.equal(h.calls[0].url, '/api/sync'); assert.deepEqual(Object.keys(h.calls[0].body.data), ['researchHub']);
  await assert.rejects(h.context.window.__academicSavePipeline({}), /保存来源无效/);
  assert.equal(h.calls.length, 1);
});
test('parent distinguishes signed-out/offline/conflict states and propagates cloud failures', async () => {
  const h = parentHarness(); h.context.account = null; assert.equal((await h.save()).scope, 'local'); assert.equal(h.calls.length, 0);
  h.context.account = { email: 'test@example.test' }; h.context.navigator.onLine = false; await assert.rejects(h.save(), /当前离线/);
  h.context.navigator.onLine = true; h.context.activeWorkspaceConflict = {}; await assert.rejects(h.save(), /同步冲突/);
  h.context.activeWorkspaceConflict = null; h.context.api = async () => ({ ok: false, error: 'Denied' }); await assert.rejects(h.save(), /Denied/);
});
test('account change cannot report a save to the old account as current success', async () => {
  const h = parentHarness(); const pending = deferred(); h.context.api = () => pending.promise;
  const saving = h.save(); h.context.account = { email: 'other@example.test' }; pending.resolve({ ok: true });
  await assert.rejects(saving, /账号已切换/); assert.equal(h.statuses.length, 0);
});
test('module is loaded before cloud adapter and shared save is present across pipeline pages', () => {
  assert.match(html, /pipeline-save\.js\?v=20261020-05/);
  assert.ok(html.indexOf('pipeline-save.js') < html.indexOf('/* Public client key only.'));
  assert.match(html, /pipelineCommitted === "1"/);
});

function cloudHarness({ embedded = true, user = { id: 'user-1' }, writeError = null, parentSave } = {}) {
  const calls = [], handlers = {}, timers = [];
  class Storage { constructor() { this.items = new Map(); } setItem(key, value) { this.items.set(key, String(value)); } getItem(key) { return this.items.get(key) ?? null; } removeItem(key) { this.items.delete(key); } }
  const localStorage = new Storage();
  const node = () => ({ textContent: '', addEventListener() {}, prepend() {}, appendChild() {} });
  const document = { createElement: node, head: node(), getElementById: () => null, querySelector: () => node(), addEventListener: (type, callback) => { handlers[type] = callback; } };
  const client = {
    from: table => ({ select: () => ({ eq: (_field, id) => ({ maybeSingle: async () => { calls.push({ type: 'read', table, id }); return { data: { payload: { untouched: 'Keep other modules' } } }; } }) }),
      upsert: async row => { calls.push({ type: 'write', row }); return { error: writeError }; } }),
    auth: { getSession: async () => ({ data: { session: user ? { user } : null } }), onAuthStateChange() {} }
  };
  const window = { supabase: { createClient: () => { calls.push({ type: 'create-client' }); return client; } }, addEventListener() {}, __academicPipelineFlushLocalWrites() {} };
  window.parent = embedded ? { __academicSavePipeline: parentSave || (async source => { calls.push({ type: 'parent', source }); return { scope: 'cloud' }; }) } : window;
  const context = vm.createContext({ window, document, Storage, localStorage, Promise, Date, String, console, setTimeout: callback => { timers.push(callback); return timers.length; }, clearTimeout() {} });
  const start = html.lastIndexOf('<script>') + '<script>'.length;
  vm.runInContext(html.slice(start, html.lastIndexOf('</script>')), context);
  return { context, window, calls, handlers, timers, localStorage, save: () => window.__academicPipelineCloudSave() };
}
test('embedded cloud adapter never creates a second Supabase writer or separate login', async () => {
  const h = cloudHarness(); assert.equal((await h.save()).scope, 'cloud');
  assert.deepEqual(h.calls.map(call => call.type), ['parent']);
  assert.equal(h.calls[0].source, h.window);
});
test('initial theme hydration is not treated as a new edit; later changed data still autosaves', async () => {
  const h = cloudHarness(); h.localStorage.setItem('research-hub-theme', 'default'); assert.equal(h.timers.length, 0);
  h.handlers.DOMContentLoaded(); h.localStorage.setItem('research-hub-theme', 'default'); assert.equal(h.timers.length, 0);
  h.localStorage.setItem('research-hub-fields-v1', '{"p1":{"title":"Saved"}}'); assert.equal(h.timers.length, 1);
  await h.timers[0](); assert.equal(h.calls[0].type, 'parent');
});
test('cloud adapter propagates errors and serializes overlapping saves', async () => {
  const pending = deferred(); let calls = 0;
  const h = cloudHarness({ parentSave: () => { calls++; return calls === 1 ? pending.promise : Promise.resolve({ scope: 'cloud' }); } });
  const first = h.save(), second = h.save(); await Promise.resolve(); await Promise.resolve(); assert.equal(calls, 1);
  pending.resolve({ scope: 'cloud' }); await first; await second; assert.equal(calls, 2);
  h.window.parent.__academicSavePipeline = async () => { throw new Error('Denied'); }; await assert.rejects(h.save(), /Denied/);
});
test('standalone mode preserves other payload fields and throws failed upserts instead of claiming success', async () => {
  const h = cloudHarness({ embedded: false }); h.localStorage.setItem('research-hub-cards-v1', '{"submitted":{}}');
  const revisionFields = JSON.stringify({ paper1: { submissionRevisionRounds: [{ id: 'rrevision123', items: [{ comment: '审稿意见', response: '修订回复', status: 'done' }] }] } });
  h.localStorage.setItem('research-hub-fields-v1', revisionFields);
  assert.equal((await h.save()).scope, 'cloud');
  const write = h.calls.find(call => call.type === 'write'); assert.equal(write.row.payload.untouched, 'Keep other modules');
  assert.equal(write.row.payload.researchHub['research-hub-cards-v1'], '{"submitted":{}}');
  assert.equal(write.row.payload.researchHub['research-hub-fields-v1'], revisionFields);
  const failed = cloudHarness({ embedded: false, writeError: new Error('Storage denied') }); await assert.rejects(failed.save(), /Storage denied/);
  const guest = cloudHarness({ embedded: false, user: null }); assert.equal((await guest.save()).scope, 'local');
  assert.ok(!guest.calls.some(call => call.type === 'write'));
});
