const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const staticApiSource = fs.readFileSync(path.join(__dirname, '..', 'web', 'static-api.js'), 'utf8');

function createApiHarness(payload) {
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
          const expectedRevision = filters.find(([key]) => key === 'updated_at');
          if (expectedRevision && workspaceRow.updated_at !== expectedRevision[1]) {
            return Promise.resolve({ data: null, error: null });
          }
          workspaceRow = Object.assign({}, workspaceRow, structuredClone(values));
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
      getSession: async () => ({ data: { session: { access_token: 'test-token', user: { id: 'test-user', email: 'test@example.com' } } } }),
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
    request(action) {
      return window.fetch('/api/references', {
        method: 'POST',
        body: JSON.stringify(action)
      });
    },
    readWorkspace() { return structuredClone(workspaceRow.payload); }
  };
}

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
      { id: 'active', fields: { authors: 'New author', year: '2022', source: 'Overwritten journal', locator: '10–20' } },
      { id: 'alias', fields: { authors: 'Must not overwrite alias' } }
    ]
  });
  const result = await response.json();
  const active = result.referenceLibrary.items.find(item => item.id === 'active');
  const alias = result.referenceLibrary.items.find(item => item.id === 'alias');
  assert.equal(response.status, 200);
  assert.equal(result.updatedCount, 1);
  assert.equal(result.filledFieldCount, 2);
  assert.equal(active.authors, 'New author');
  assert.equal(active.year, '2021');
  assert.equal(active.source, 'Existing journal');
  assert.equal(active.locator, '10–20');
  assert.equal(alias.authors, 'Keep this author');

  const noOpResponse = await harness.request({ action: 'batch-enrich', entries: [{ id: 'active', fields: { authors: 'Overwrite attempt' } }] });
  assert.equal(noOpResponse.status, 409);
});
