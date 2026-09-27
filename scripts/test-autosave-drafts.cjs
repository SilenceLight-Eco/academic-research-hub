const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'web', 'app.js'), 'utf8');
const start = source.indexOf('  function autoSaveDraftAccountKey()');
const end = source.indexOf('  function setGlobalSaveState(', start);
assert.notEqual(start, -1, 'autosave draft helpers exist');
assert.notEqual(end, -1, 'autosave draft helper section has an end marker');
const helperSource = source.slice(start, end);

function fakeIndexedDb() {
  const records = new Map();
  const store = {
    put(record) { records.set(record.id, structuredClone(record)); },
    get(id) {
      const request = {};
      queueMicrotask(() => {
        request.result = records.get(id);
        if (request.onsuccess) request.onsuccess();
        if (request._tx.oncomplete) request._tx.oncomplete();
      });
      return request;
    },
    getAll() {
      const request = {};
      queueMicrotask(() => {
        request.result = Array.from(records.values()).map((record) => structuredClone(record));
        if (request.onsuccess) request.onsuccess();
        if (request._tx.oncomplete) request._tx.oncomplete();
      });
      return request;
    },
    delete(id) { records.delete(id); }
  };
  const db = {
    objectStoreNames: { contains: () => true },
    createObjectStore() {},
    close() {},
    transaction() {
      const tx = { objectStore: () => store };
      const originalGet = store.get;
      const originalGetAll = store.getAll;
      tx.objectStore = () => ({
        put(record) {
          store.put(record);
          queueMicrotask(() => { if (tx.oncomplete) tx.oncomplete(); });
        },
        get(id) { const request = originalGet(id); request._tx = tx; return request; },
        getAll() { const request = originalGetAll(); request._tx = tx; return request; },
        delete(id) { store.delete(id); }
      });
      return tx;
    }
  };
  return {
    records,
    open() {
      const request = {};
      queueMicrotask(() => {
        request.result = db;
        if (request.onupgradeneeded) request.onupgradeneeded();
        if (request.onsuccess) request.onsuccess();
      });
      return request;
    }
  };
}

function makeContext(email) {
  const calls = [];
  const context = {
    window: { indexedDB: fakeIndexedDb() },
    account: email ? { email } : null,
    autoSaveDraftDbPromise: null,
    autoSaveDraftWriteChain: Promise.resolve(),
    autoSaveDraftRestoreAccount: '',
    autoSaveDraftRestoring: false,
    autoSaveSlots: {},
    autoSaveRunning: 0,
    AUTO_SAVE_RETRY_BASE: 5000,
    AUTO_SAVE_RETRY_MAX: 300000,
    activeWorkspaceConflict: false,
    navigator: { onLine: true },
    Object,
    JSON,
    Date,
    Promise,
    Error,
    setTimeout,
    clearTimeout,
    setGlobalSaveState() {},
    persistTrackerFeed() {},
    persistStudyProgress() {},
    persistAcademicRecord() {},
    persistDataCodeItem() {},
    persistReference() {},
    persistResearchProject() {},
    persistVariable() {},
    persistPrompt() {},
    persistNoteStudio() {},
    persistKnowledgeDoc() {},
    runAutoSave(...args) { calls.push(args); return Promise.resolve(); },
    calls
  };
  vm.createContext(context);
  vm.runInContext(helperSource, context);
  return context;
}

test('pending drafts are isolated by signed-in account', async () => {
  const context = makeContext('researcher@example.com');
  const slot = { revision: 1, payload: { id: 'v1', name: 'Treatment' }, dirty: true };
  await context.persistAutoSaveDraft('variable:v1', slot);

  assert.equal((await context.listAutoSaveDrafts('researcher@example.com')).length, 1);
  assert.equal((await context.listAutoSaveDrafts('another@example.com')).length, 0);
});

test('successful older save cannot remove a newer pending revision', async () => {
  const context = makeContext('researcher@example.com');
  const slot = { revision: 1, payload: { id: 'v1', name: 'Old' }, dirty: true };
  await context.persistAutoSaveDraft('variable:v1', slot);
  const oldRevisionAt = slot.draftRevisionTimes[1];
  slot.revision = 2;
  slot.payload = { id: 'v1', name: 'New' };
  await context.persistAutoSaveDraft('variable:v1', slot);

  await context.removeSyncedAutoSaveDraft('researcher@example.com', 'variable:v1', oldRevisionAt);
  const pending = await context.listAutoSaveDrafts('researcher@example.com');
  assert.equal(pending.length, 1);
  assert.equal(pending[0].payload.name, 'New');
});

test('a pending draft restores and starts its module persistence function', async () => {
  const context = makeContext('researcher@example.com');
  await context.persistAutoSaveDraft('variable:v1', {
    revision: 1,
    payload: { id: 'v1', name: 'Recovered variable' },
    dirty: true
  });
  await context.restoreAutoSaveDrafts();

  const slot = context.autoSaveSlots['variable:v1'];
  assert.equal(slot.payload.name, 'Recovered variable');
  assert.equal(slot.dirty, true);
  assert.equal(context.calls.length, 1);
  assert.equal(context.calls[0][0], 'variable:v1');
});
