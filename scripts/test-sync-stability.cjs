const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const networkSource = fs.readFileSync(path.join(__dirname, '../web/sync-network.js'), 'utf8');
const appSource = fs.readFileSync(path.join(__dirname, '../web/app.js'), 'utf8');
function harness() {
  const timers = new Map(); let nextTimer = 0;
  const context = vm.createContext({ window: { addEventListener() {} }, AbortController, Response, Promise, Error, Date,
    setTimeout(fn, delay) { const id = ++nextTimer; timers.set(id, { fn, delay }); return id; },
    clearTimeout(id) { timers.delete(id); }
  });
  vm.runInContext(networkSource, context);
  return { context, helpers: context.window, timers, expire(delay) { const task = [...timers.values()].find(timer => timer.delay === delay); assert.ok(task); task.fn(); } };
}
test('sync errors distinguish auth, permission, conflict, offline, network and ambiguous timeout', () => {
  const { helpers } = harness(), message = helpers.__academicSyncErrorMessage;
  for (const [error, expected] of [
    [{ errorStatus: 401 }, /登录凭证/], [{ errorCode: '42501' }, /权限/],
    [{ workspaceConflict: {} }, /冲突/], [{ message: 'Failed to fetch' }, /无法连接/],
    [{ message: 'AbortError: CLOUD_TIMEOUT' }, /结果待确认/], [{ message: 'JWT expired' }, /登录凭证/]
  ]) assert.match(message(error, false), expected);
  assert.match(message(new Error('anything'), true), /离线/);
  assert.ok(!message(new Error('Error https://server.invalid/?token=secret'), false).includes('secret'));
});
test('network deadline aborts the request, frees resources and allows a subsequent successful request', async () => {
  const h = harness(); let signal;
  const wrapped = h.helpers.__academicFetchWithTimeout((_url, options) => new Promise((_resolve, reject) => {
    signal = options.signal; signal.addEventListener('abort', () => reject(new Error('AbortError')));
  }));
  const pending = wrapped('https://project.invalid/rest/v1/user_workspaces');
  h.expire(25000);
  await assert.rejects(pending, /CLOUD_TIMEOUT/); assert.equal(signal.aborted, true); assert.equal(h.timers.size, 0);
  const success = h.helpers.__academicFetchWithTimeout(async () => new Response('{"saved":true}', { headers: { 'Content-Type': 'application/json' } }));
  assert.deepEqual(await (await success('https://project.invalid/rest/v1/user_workspaces')).json(), { saved: true });
  assert.equal(h.timers.size, 0);
});
test('the deadline covers a stalled JSON body and caller cancellation retains its own cause', async () => {
  const h = harness();
  const stalled = h.helpers.__academicFetchWithTimeout(async (_url, options) => ({ body: {}, arrayBuffer: () => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('AbortError')))) }));
  const pending = stalled('https://project.invalid/rest/v1/user_workspaces');
  await new Promise(resolve => setImmediate(resolve)); h.expire(25000); await assert.rejects(pending, /CLOUD_TIMEOUT/);
  const parent = new AbortController();
  const cancelled = h.helpers.__academicFetchWithTimeout((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('User cancelled')))));
  const request = cancelled('https://project.invalid/rest/v1/user_workspaces', { signal: parent.signal });
  parent.abort(); await assert.rejects(request, /User cancelled/); assert.equal(h.timers.size, 0);
});
test('session checks have a deadline while attachment requests receive a longer allowance', async () => {
  const h = harness();
  const session = h.helpers.__academicWaitForSession(new Promise(() => {}));
  h.expire(30000); await assert.rejects(session, /登录状态检查超时/);
  const storage = h.helpers.__academicFetchWithTimeout((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('AbortError')))));
  const upload = storage('https://project.invalid/storage/v1/object/files');
  h.expire(120000); await assert.rejects(upload, /CLOUD_TIMEOUT/);
});
function saveHarness() {
  const h = harness(), nodes = new Map(); let cloudSyncs = 0, removedDrafts = 0;
  function node(id) {
    if (!nodes.has(id)) nodes.set(id, { dataset: {}, disabled: false, hidden: false, textContent: '', setAttribute() {}, label: { textContent: '' } });
    return nodes.get(id);
  }
  Object.assign(h.context, {
    $: (selector, parent) => parent ? parent.label : node(selector),
    account: { id: 'owner' }, navigator: { onLine: true }, autoSaveSlots: {}, autoSaveRunning: 0,
    autoSaveChain: Promise.resolve(), activeWorkspaceConflict: null,
    AUTO_SAVE_RETRY_MAX: 300000, AUTO_SAVE_RETRY_BASE: 5000,
    autoSaveDraftAccountKey: () => 'owner', persistAutoSaveDraft() {},
    removeSyncedAutoSaveDraft() { removedDrafts++; },
    syncAndPullCloudData() { cloudSyncs++; h.context.setGlobalSaveState('云端同步正常', 'saved'); return Promise.resolve(); }
  });
  for (const name of ['setGlobalSaveState', 'showSyncFailure', 'retryCloudSync', 'saveStateAfterSuccess', 'retryAutoSave', 'hasPendingAutoSave', 'hasUnsavedChanges', 'runAutoSave', 'flushAllAutoSaves']) {
    const start = appSource.indexOf('  function ' + name + '(');
    vm.runInContext(appSource.slice(start, appSource.indexOf('\n  function ', start + 1)), h.context);
  }
  function slot(persist) {
    const item = { revision: 1, dirty: true, payload: { value: 'keep this edit' }, persist, draftRevisionTimes: { 1: 123 }, inFlight: 0 };
    h.context.autoSaveSlots.variable = item; return item;
  }
  return { ...h, node, slot, cloudSyncs: () => cloudSyncs, removedDrafts: () => removedDrafts };
}
test('failed saves retain dirty drafts and manual retry confirms cloud success before clearing pending status', async () => {
  const h = saveHarness(); let attempts = 0;
  const slot = h.slot(async () => { if (++attempts === 1) throw new Error('CLOUD_TIMEOUT'); });
  await h.context.runAutoSave('variable', 1, slot.payload, slot.persist, true);
  assert.equal(slot.dirty, true); assert.equal(h.removedDrafts(), 0); assert.equal(h.context.autoSaveRunning, 0);
  assert.equal(h.node('#syncRetry').hidden, false); assert.match(h.node('#syncSaveDetails').textContent, /待保存 1 项/);
  assert.match(h.node('#globalSaveState').label.textContent, /结果待确认/);
  await h.context.retryCloudSync();
  assert.equal(slot.dirty, false); assert.equal(attempts, 2); assert.equal(h.cloudSyncs(), 1);
  assert.equal(h.node('#syncRetry').disabled, false); assert.equal(h.node('#syncRetry').hidden, true);
  assert.match(h.node('#syncSaveDetails').textContent, /最近同步/);
});
test('persistent failure never claims success and late account changes do not trigger another account sync', async () => {
  const h = saveHarness(); const slot = h.slot(async () => { throw new Error('permission denied'); });
  await h.context.retryCloudSync();
  assert.equal(slot.dirty, true); assert.equal(h.cloudSyncs(), 0); assert.equal(h.node('#globalSaveState').dataset.state, 'error');
  assert.equal(h.node('#syncRetry').disabled, false);
  let release;
  slot.persist = () => new Promise(resolve => { release = resolve; });
  const retry = h.context.retryCloudSync(); await new Promise(resolve => setImmediate(resolve));
  h.context.account = { id: 'another-account' }; release(); await retry;
  assert.equal(h.cloudSyncs(), 0);
  h.context.setGlobalSaveState('登录状态检查中', 'saving');
  assert.ok(!h.node('#syncSaveDetails').textContent.includes('最近同步'));
});
