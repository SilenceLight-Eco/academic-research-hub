const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const staticApiSource = fs.readFileSync(path.join(__dirname, '..', 'web', 'static-api.js'), 'utf8');

function createApiHarness(payload, options = {}) {
  let writes = 0;
  let workspaceRow = {
    payload: structuredClone(payload),
    updated_at: '2026-09-26T10:00:00.000Z'
  };

  function queryBuilder(table, operation, values) {
    const filters = [];
    const builder = {
      select() { return builder; },
      eq(key, value) { filters.push([key, value]); return builder; },
      is(key, value) { filters.push([key, value]); return builder; },
      maybeSingle() {
        if (table !== 'user_workspaces') return Promise.resolve({ data: null, error: null });
        if (operation === 'select') return Promise.resolve({ data: structuredClone(workspaceRow), error: null });
        if (operation === 'update') {
          if (options.failWrites) return Promise.resolve({ data: null, error: { message: 'Cloud write failed', code: '42501' } });
          const expectedRevision = filters.find(([key]) => key === 'updated_at');
          if (expectedRevision && workspaceRow.updated_at !== expectedRevision[1]) {
            return Promise.resolve({ data: null, error: null });
          }
          workspaceRow = Object.assign({}, workspaceRow, structuredClone(values));
          writes++;
          return Promise.resolve({ data: { updated_at: workspaceRow.updated_at }, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
      single() { return builder.maybeSingle(); }
    };
    return builder;
  }

  const client = {
    auth: {
      getSession: async () => ({ data: { session: options.signedOut ? null : { access_token: 'test-token', user: { id: 'test-user', email: 'test@example.com' } } } }),
      onAuthStateChange() {}
    },
    from(table) {
      return {
        select: () => queryBuilder(table, 'select'),
        update: values => queryBuilder(table, 'update', values),
        insert: values => queryBuilder(table, 'insert', values),
        upsert: values => queryBuilder(table, 'upsert', values)
      };
    }
  };

  class Storage {
    constructor() { this.values = Object.create(null); }
    getItem(key) { return Object.prototype.hasOwnProperty.call(this.values, key) ? this.values[key] : null; }
    setItem(key, value) { this.values[key] = String(value); }
    removeItem(key) { delete this.values[key]; }
  }

  const localStorage = new Storage();
  const window = {
    fetch: async () => new Response('{}'),
    supabase: { createClient: () => client },
    dispatchEvent() {},
    addEventListener() {}
  };
  window.__nativeFetch = window.fetch.bind(window);
  const context = {
    window,
    localStorage,
    Storage,
    document: { createElement() { return {}; }, head: { appendChild() {} } },
    location: { href: 'https://example.test/' },
    CustomEvent: class CustomEvent {},
    Response,
    Request,
    Headers,
    URL,
    setTimeout,
    clearTimeout,
    Date,
    Math,
    JSON,
    Object,
    Array,
    String,
    Number,
    Boolean,
    Map,
    Set,
    Promise,
    Error,
    RegExp,
    console
  };
  vm.runInNewContext(staticApiSource, context);

  return {
    request(action, endpoint = '/api/references') {
      return window.fetch(endpoint, {
        method: 'POST',
        body: JSON.stringify(action)
      });
    },
    setLocalItem(key, value) { localStorage.setItem(key, value); },
    readWorkspace() { return structuredClone(workspaceRow.payload); },
    writeCount() { return writes; }
  };
}

test('browser preference edits are written to the cloud workspace', async () => {
  const harness = createApiHarness({ todos: [], browser: {} });
  harness.setLocalItem('academic-workbench-theme', 'dark');
  await new Promise(resolve => setTimeout(resolve, 850));
  assert.equal(harness.readWorkspace().browser['academic-workbench-theme'], 'dark');
});

const tracked = (id, extras = {}) => ({ trackerArticleId: id, title: 'Research paper with a sufficiently long title ' + id,
  authors: 'Author A；Author B', doi: '10.test/' + id, year: '2026', source: 'Test Journal',
  abstract: 'Publisher abstract', abstractSource: 'Publisher', keywords: 'policy，innovation', keywordsSource: 'Publisher author keywords', ...extras });

test('tracked references save complete metadata once and survive a fresh workspace load', async () => {
  const h = createApiHarness({ referenceLibrary: { items: [], trash: [], folders: [{ id: 'existing-folder', name: 'Keep' }] } });
  const response = await h.request({ action: 'import-tracked', items: [tracked('one'), tracked('two')] });
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(result.importResults.map(item => item.status), ['added', 'added']);
  assert.equal(h.writeCount(), 1);
  assert.equal(new Set(result.referenceLibrary.items.map(item => item.id)).size, 2);
  const reference = result.referenceLibrary.items[0];
  for (const key of ['title','authors','year','source','doi','abstract','abstractSource','keywords','keywordsSource']) assert.equal(reference[key], tracked('one')[key]);
  assert.equal(reference.notes, ''); assert.equal(reference.tags, ''); assert.equal(reference.folderId, '');
  const reloaded = createApiHarness(h.readWorkspace());
  const retry = await reloaded.request({ action: 'import-tracked', items: [tracked('one'), tracked('two')] });
  assert.deepEqual((await retry.json()).importResults.map(item => item.status), ['duplicate', 'duplicate']);
  assert.equal(reloaded.writeCount(), 0);
  assert.deepEqual(reloaded.readWorkspace().referenceLibrary, h.readWorkspace().referenceLibrary);
});

test('dedup normalizes DOI, catches duplicates inside a batch and preserves existing edits', async () => {
  const original = { id: 'keep', doi: 'https://doi.org/10.TEST/one', title: 'Edited title', notes: 'My note', folderId: 'folder' };
  const h = createApiHarness({ referenceLibrary: { items: [original], trash: [] } });
  const result = await (await h.request({ action: 'import-tracked', items: [tracked('one'), tracked('two'), tracked('alias', { doi: 'DOI:10.TEST/two' })] })).json();
  assert.deepEqual(result.importResults.map(item => item.status), ['duplicate', 'added', 'duplicate']);
  assert.deepEqual(result.referenceLibrary.items.find(item => item.id === 'keep'), original);
  assert.equal(result.referenceLibrary.items.length, 2);
});

test('no-DOI matches require long title and authors; distinct DOIs and trash are not merged', async () => {
  const h = createApiHarness({ referenceLibrary: { items: [tracked('old', { id: 'reference-old', doi: '', title: 'A long reference title about innovation and policy' })], trash: [{ item: tracked('trashed') }] } });
  const result = await (await h.request({ action: 'import-tracked', items: [
    tracked('match', { doi: '', title: 'A LONG reference title about innovation and policy!' }),
    tracked('different-author', { doi: '', title: 'A long reference title about innovation and policy', authors: 'Someone else' }),
    tracked('short-a', { doi: '', title: 'Short' }), tracked('short-b', { doi: '', title: 'Short' }),
    tracked('doi-a', { title: 'The exact same long title with a distinct DOI' }),
    tracked('doi-b', { title: 'The exact same long title with a distinct DOI' }), tracked('trashed')
  ] })).json();
  assert.deepEqual(result.importResults.map(item => item.status), ['duplicate','added','added','added','added','added','added']);
  assert.equal(result.referenceLibrary.items.length, 7);
});

test('malformed entries fail individually without placeholders and oversized batches are rejected', async () => {
  const h = createApiHarness({ referenceLibrary: { items: [], trash: [] } });
  const result = await (await h.request({ action: 'import-tracked', items: [tracked('good'), tracked('bad', { title: '' })] })).json();
  assert.deepEqual(result.importResults.map(item => item.status), ['added','failed']);
  assert.equal(h.readWorkspace().referenceLibrary.items.length, 1);
  for (const items of [[], Array.from({ length: 201 }, (_,i) => tracked(String(i)))]) assert.equal((await h.request({ action: 'import-tracked', items })).status, 400);
  assert.equal(h.writeCount(), 1);
});

test('failed cloud writes never claim success; retry persists once and does not change reading state', async () => {
  const options = { failWrites: true };
  const h = createApiHarness({ referenceLibrary: { items: [], trash: [] }, reading: { article: { is_read: false } } }, options);
  const failed = await h.request({ action: 'import-tracked', items: [tracked('one')] });
  assert.notEqual(failed.status, 200); assert.notEqual((await failed.json()).ok, true);
  assert.equal(h.readWorkspace().referenceLibrary.items.length, 0);
  options.failWrites = false;
  const retried = await (await h.request({ action: 'import-tracked', items: [tracked('one')] })).json();
  assert.equal(retried.importResults[0].status, 'added');
  assert.equal(h.writeCount(), 1); assert.equal(h.readWorkspace().reading.article.is_read, false);
});

test('signed-out users cannot import into a workspace', async () => {
  const h = createApiHarness({ referenceLibrary: { items: [], trash: [] } }, { signedOut: true });
  assert.equal((await h.request({ action: 'import-tracked', items: [tracked('one')] })).status, 401);
  assert.equal(h.writeCount(), 0);
});

test('variable library saves, duplicates, and restores linked reference IDs', async () => {
  const harness = createApiHarness({
    variableLibrary: {
      items: [{ id: 'variable-1', name: '核心解释变量', role: ['核心解释变量'], measureReferences: [] }],
      trash: []
    }
  });
  const linkedEntry = {
    role: ['核心解释变量'], source: '文献库', measures: ['见参考文献'], measure: '见参考文献',
    instrumentVariables: ['距离最近港口', 'shift-share 工具变量'], instrumentVariable: '距离最近港口',
    papers: ['Author A (2024). Linked paper title'], paper: 'Author A (2024). Linked paper title',
    paperReferenceIds: ['reference-42']
  };
  const saveResponse = await harness.request({
    action: 'save', id: 'variable-1', name: '核心解释变量', role: ['核心解释变量'],
    measureReferences: [linkedEntry]
  }, '/api/variable-library');
  const saved = await saveResponse.json();
  assert.equal(saveResponse.status, 200);
  assert.deepEqual(Array.from(saved.variableLibrary.items[0].measureReferences[0].paperReferenceIds), ['reference-42']);
  assert.deepEqual(Array.from(saved.variableLibrary.items[0].measureReferences[0].instrumentVariables), ['距离最近港口', 'shift-share 工具变量']);

  const duplicateResponse = await harness.request({
    action: 'duplicate', id: 'variable-1',
    currentVariable: { id: 'variable-1', name: '核心解释变量', role: ['核心解释变量'], measureReferences: [linkedEntry] }
  }, '/api/variable-library');
  const duplicated = await duplicateResponse.json();
  assert.equal(duplicateResponse.status, 200);
  assert.deepEqual(Array.from(duplicated.variableLibrary.items[0].measureReferences[0].paperReferenceIds), ['reference-42']);
  assert.deepEqual(Array.from(duplicated.variableLibrary.items[0].measureReferences[0].instrumentVariables), ['距离最近港口', 'shift-share 工具变量']);

  const importResponse = await harness.request({
    action: 'import', items: [{ name: '导入变量', role: '控制变量', measureReferences: [{ papers: ['legacy citation'], instrumentVariables: ['以邻为壑'] }] }]
  }, '/api/variable-library');
  const imported = await importResponse.json();
  const importedVariable = imported.variableLibrary.items.find(item => item.name === '导入变量');
  assert.equal(importResponse.status, 200);
  assert.deepEqual(Array.from(importedVariable.measureReferences[0].paperReferenceIds), ['']);
  assert.equal(importedVariable.measureReferences[0].papers[0], 'legacy citation');
  assert.equal(importedVariable.measureReferences[0].instrumentVariables[0], '以邻为壑');
});

test('duplicate merge preserves the original record and supports restoring it', async () => {
  const harness = createApiHarness({
    referenceLibrary: {
      items: [
        { id: 'primary', title: 'Same Article', authors: '', year: '2020', tags: 'policy', notes: 'Primary note', projectId: 'project-A' },
        { id: 'duplicate', title: 'Same Article', authors: 'A. Author', year: '2020', tags: 'policy; climate', notes: 'Duplicate note', projectId: 'project-B' }
      ],
      trash: []
    }
  });

  const mergeResponse = await harness.request({ action: 'merge-duplicates', primaryId: 'primary', duplicateIds: ['duplicate'] });
  const merged = await mergeResponse.json();
  assert.equal(mergeResponse.status, 200);
  assert.equal(merged.mergedCount, 1);
  const primary = merged.referenceLibrary.items.find(item => item.id === 'primary');
  const alias = merged.referenceLibrary.items.find(item => item.id === 'duplicate');
  assert.equal(primary.authors, 'A. Author');
  assert.equal(primary.projectId, 'project-A');
  assert.match(primary.notes, /Duplicate note/);
  assert.equal(primary.tags, 'policy；climate');
  assert.equal(alias.mergedInto, 'primary');
  assert.equal(alias.projectId, 'project-B');
  assert.equal(alias.notes, 'Duplicate note');

  const repeatedMerge = await harness.request({ action: 'merge-duplicates', primaryId: 'primary', duplicateIds: ['duplicate'] });
  assert.equal(repeatedMerge.status, 409);

  const restoreResponse = await harness.request({ action: 'unmerge', id: 'duplicate' });
  const restored = await restoreResponse.json();
  const restoredAlias = restored.referenceLibrary.items.find(item => item.id === 'duplicate');
  assert.equal(restoreResponse.status, 200);
  assert.equal(Object.hasOwn(restoredAlias, 'mergedInto'), false);
  assert.equal(restoredAlias.notes, 'Duplicate note');
  assert.equal(harness.readWorkspace().referenceLibrary.items.length, 2);
});

test('batch DOI enrichment only fills approved blank fields and skips aliases', async () => {
  const harness = createApiHarness({
    referenceLibrary: {
      items: [
        { id: 'active', title: 'Existing title', authors: '', year: '2021', source: 'Existing journal', locator: '', url: '', doi: '10.example/active' },
        { id: 'alias', title: 'Merged title', authors: 'Keep this author', year: '2020', doi: '10.example/alias', mergedInto: 'active' }
      ],
      trash: []
    }
  });

  const response = await harness.request({
    action: 'batch-enrich',
    entries: [
      { id: 'active', fields: {
        authors: 'New author', year: '2022', source: 'Overwritten journal', locator: '10–20',
        abstract: 'An abstract from Semantic Scholar.', abstractSource: 'Semantic Scholar',
        keywords: 'climate policy；innovation', keywordsSource: 'OpenAlex (algorithmic topics)'
      } },
      { id: 'alias', fields: { authors: 'Must not overwrite alias' } }
    ]
  });
  const result = await response.json();
  const active = result.referenceLibrary.items.find(item => item.id === 'active');
  const alias = result.referenceLibrary.items.find(item => item.id === 'alias');
  assert.equal(response.status, 200);
  assert.equal(result.updatedCount, 1);
  assert.equal(result.filledFieldCount, 6);
  assert.equal(active.authors, 'New author');
  assert.equal(active.year, '2021');
  assert.equal(active.source, 'Existing journal');
  assert.equal(active.locator, '10–20');
  assert.equal(active.abstract, 'An abstract from Semantic Scholar.');
  assert.equal(active.abstractSource, 'Semantic Scholar');
  assert.equal(active.keywords, 'climate policy；innovation');
  assert.equal(active.keywordsSource, 'OpenAlex (algorithmic topics)');
  assert.equal(alias.authors, 'Keep this author');

  const noOpResponse = await harness.request({ action: 'batch-enrich', entries: [{ id: 'active', fields: { authors: 'Overwrite attempt' } }] });
  assert.equal(noOpResponse.status, 409);
});

test('reference folders persist, rename safely, and preserve references when deleted', async () => {
  const harness = createApiHarness({
    referenceLibrary: {
      items: [
        { id: 'paper-a', title: 'Paper A', authors: 'Author A', year: '2023', notes: 'Keep this record' },
        { id: 'paper-b', title: 'Paper B', authors: 'Author B', year: '2024' }
      ],
      trash: []
    }
  });

  const createResponse = await harness.request({ action: 'folder-create', name: '识别策略' });
  const created = await createResponse.json();
  const folderId = created.folderId;
  assert.equal(createResponse.status, 200);
  assert.ok(folderId);
  assert.equal(created.referenceLibrary.folders[0].name, '识别策略');

  await new Promise(resolve => setTimeout(resolve, 2));
  const secondFolderResponse = await harness.request({ action: 'folder-create', name: '数据与方法' });
  const secondFolder = await secondFolderResponse.json();
  const secondFolderId = secondFolder.folderId;
  assert.equal(secondFolderResponse.status, 200);
  assert.ok(secondFolderId);

  const reorderResponse = await harness.request({ action: 'folder-reorder', ids: [secondFolderId, folderId] });
  const reordered = await reorderResponse.json();
  assert.equal(reorderResponse.status, 200);
  assert.deepEqual(reordered.referenceLibrary.folders.map(folder => String(folder.id)), [String(secondFolderId), String(folderId)]);
  const invalidReorderResponse = await harness.request({ action: 'folder-reorder', ids: [secondFolderId, secondFolderId] });
  assert.equal(invalidReorderResponse.status, 409);
  assert.deepEqual(harness.readWorkspace().referenceLibrary.folders.map(folder => String(folder.id)), [String(secondFolderId), String(folderId)]);

  const assignResponse = await harness.request({
    action: 'save', id: 'paper-a', folderId,
    title: 'Paper A', authors: 'Author A', year: '2023', type: '期刊论文',
    source: '', locator: '', doi: '', url: '', abstract: '', keywords: '',
    abstractSource: '', keywordsSource: '', tags: '', projectId: '', knowledgeDocId: '', notes: 'Keep this record'
  });
  const assigned = await assignResponse.json();
  assert.equal(assignResponse.status, 200);
  assert.equal(assigned.referenceLibrary.items.find(item => item.id === 'paper-a').folderId, String(folderId));

  const bulkMoveResponse = await harness.request({ action: 'bulk-move', ids: ['paper-a', 'paper-b'], folderId });
  const bulkMoved = await bulkMoveResponse.json();
  assert.equal(bulkMoveResponse.status, 200);
  assert.equal(bulkMoved.selectedCount, 2);
  assert.equal(bulkMoved.movedCount, 1);
  assert.equal(bulkMoved.referenceLibrary.items.find(item => item.id === 'paper-a').folderId, String(folderId));
  assert.equal(bulkMoved.referenceLibrary.items.find(item => item.id === 'paper-b').folderId, String(folderId));
  assert.equal(bulkMoved.referenceLibrary.items.find(item => item.id === 'paper-a').notes, 'Keep this record');

  const invalidBulkMove = await harness.request({ action: 'bulk-move', ids: ['paper-a', 'missing-paper'], folderId });
  assert.equal(invalidBulkMove.status, 409);
  assert.equal(harness.readWorkspace().referenceLibrary.items.find(item => item.id === 'paper-a').folderId, String(folderId));

  const renameResponse = await harness.request({ action: 'folder-rename', id: folderId, name: '因果识别' });
  const renamed = await renameResponse.json();
  assert.equal(renameResponse.status, 200);
  assert.equal(renamed.referenceLibrary.folders.find(folder => String(folder.id) === String(folderId)).name, '因果识别');
  assert.equal(renamed.referenceLibrary.items.find(item => item.id === 'paper-a').folderId, String(folderId));

  const deleteResponse = await harness.request({ action: 'folder-delete', id: folderId });
  const deleted = await deleteResponse.json();
  assert.equal(deleteResponse.status, 200);
  assert.equal(deleted.referenceLibrary.folders.length, 1);
  assert.equal(deleted.referenceLibrary.folders[0].name, '数据与方法');
  assert.equal(deleted.referenceLibrary.items.find(item => item.id === 'paper-a').folderId, '');
  assert.equal(deleted.referenceLibrary.items.find(item => item.id === 'paper-b').folderId, '');
  assert.equal(deleted.referenceLibrary.items.find(item => item.id === 'paper-a').notes, 'Keep this record');

  const persisted = harness.readWorkspace().referenceLibrary;
  assert.equal(persisted.folders.length, 1);
  assert.equal(persisted.items.length, 2);
});
