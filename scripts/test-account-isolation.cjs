const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../web/static-api.js'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, '../web/app.js'), 'utf8');
const CARDS = 'research-hub-cards-v1', FIELDS = 'research-hub-fields-v1';
const OWNER = 'academic-workbench-cache-owner-v1';
const papers = title => ({ [CARDS]: JSON.stringify({ research: { added: { p1: { _key: 'p1', title } } } }), [FIELDS]: JSON.stringify({ p1: { title } }) });

function harness({ user = 'A', rows = {}, storage = {} } = {}) {
  let currentUser = user, waitRead;
  const values = new Map(Object.entries(storage)), events = [], callbacks = [], timers = new Map(), writes = [], reads = [];
  const records = new Map(Object.entries(structuredClone(rows)).map(([id, payload]) => [id, { payload, updated_at: '2026-11-01T00:00:00Z' }]));
  class Storage {
    getItem(key) { return values.get(key) ?? null; }
    setItem(key, value) { values.set(key, String(value)); }
    removeItem(key) { values.delete(key); }
  }
  const localStorage = new Storage();
  const session = () => currentUser ? { user: { id: currentUser, email: currentUser + '@example.test' } } : null;
  const emit = event => callbacks.forEach(callback => callback(event, session()));
  const client = {
    auth: {
      getSession: async () => ({ data: { session: session() } }),
      onAuthStateChange: callback => callbacks.push(callback),
      signOut: async () => { currentUser = null; emit('SIGNED_OUT'); return {}; },
      signInWithPassword: async ({ email }) => { currentUser = email.split('@')[0]; emit('SIGNED_IN'); return { data: { session: session(), user: session().user } }; },
      signUp: async () => ({ data: { session: null, user: { id: 'new-user' } } })
    },
    from(table) {
      function query(operation, data) {
        const filters = new Map();
        const q = {
          select() { return q; }, eq(key, value) { filters.set(key, value); return q; }, is(key, value) { filters.set(key, value); return q; },
          async maybeSingle() {
            assert.equal(table, 'user_workspaces');
            const id = data?.user_id || filters.get('user_id');
            assert.equal(id, currentUser, 'every query must target the signed-in account');
            if (operation === 'select') {
              const row = structuredClone(records.get(id) || null); reads.push(id);
              if (waitRead) { const pending = waitRead; waitRead = null; await pending; }
              return { data: row };
            }
            const existing = records.get(id);
            if (operation === 'update' && filters.has('updated_at') && existing?.updated_at !== filters.get('updated_at')) return { data: null };
            records.set(id, { ...existing, ...structuredClone(data) }); writes.push({ id, payload: structuredClone(data.payload) });
            return { data: { updated_at: data.updated_at } };
          }, single() { return q.maybeSingle(); }
        };
        return q;
      }
      return { select: () => query('select'), update: data => query('update', data), insert: data => query('insert', data), upsert: data => query('upsert', data) };
    }
  };
  const window = { fetch: async () => new Response('{}'), supabase: { createClient: () => client },
    dispatchEvent: event => events.push(event.type), addEventListener() {} };
  const context = { window, Storage, localStorage, Response, Request, Headers, URL, console,
    CustomEvent: class { constructor(type) { this.type = type; } }, location: { href: 'https://example.test/' },
    setTimeout: fn => { const id = timers.size + 1; timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id) };
  vm.runInNewContext(source, context);
  return { values, events, records, writes, reads, localStorage,
    request: async (url, body) => (await window.fetch(url, body ? { method: 'POST', body: JSON.stringify(body) } : undefined)).json(),
    switchTo(id) { currentUser = id; emit(id ? 'SIGNED_IN' : 'SIGNED_OUT'); },
    refreshToken() { emit('TOKEN_REFRESHED'); },
    delayRead(promise) { waitRead = promise; },
    async flush() { const tasks = [...timers.values()]; timers.clear(); await Promise.all(tasks.map(fn => fn())); await new Promise(resolve => setImmediate(resolve)); }
  };
}

test('logout then new-account login never displays or uploads the previous account pipeline', async () => {
  const original = { researchHub: papers('A private paper'), todos: [{ id: 1, title: 'A todo' }] };
  const h = harness({ rows: { A: original }, storage: { [OWNER]: 'A', ...papers('A local edit') } });
  await h.request('/api/sync');
  assert.match(h.values.get(CARDS), /A private paper/);
  await h.request('/api/auth/logout', {});
  assert.equal(h.values.get(CARDS), undefined); assert.equal(h.values.get(FIELDS), undefined);
  await h.request('/api/auth/login', { email: 'B@example.test', password: 'test-only' });
  const loaded = await h.request('/api/sync'); assert.deepEqual(loaded.data.researchHub, {});
  await h.request('/api/sync', { data: { todos: [], journal: [], researchHub: {} } });
  assert.doesNotMatch(JSON.stringify(h.records.get('B').payload), /A private paper|A local edit|A todo/);
  assert.deepEqual(h.records.get('A').payload, original);
  assert.ok([...h.values.keys()].some(key => key.startsWith('academic-workbench-isolated-cache-v1:A:')));
});

test('old unowned local data is preserved separately, never adopted by an empty new account', async () => {
  const h = harness({ user: 'B', storage: papers('Unclaimed private draft') });
  await h.request('/api/sync');
  await h.request('/api/variable-library', { action: 'create', role: '控制变量' });
  assert.doesNotMatch(JSON.stringify(h.records.get('B')), /Unclaimed private draft/);
  const recovery = [...h.values].find(([key]) => key.startsWith('academic-workbench-isolated-cache-v1:unclaimed:'));
  assert.match(recovery[1], /Unclaimed private draft/);
});

test('missing keys in an authoritative workspace clear obsolete browser keys', async () => {
  const h = harness({ rows: { A: { researchHub: {} } }, storage: { [OWNER]: 'A', ...papers('Old stale cache') } });
  await h.request('/api/sync');
  assert.equal(h.values.get(CARDS), undefined); assert.equal(h.values.get(FIELDS), undefined);
  await h.request('/api/sync', { data: { researchHub: {} } });
  assert.doesNotMatch(JSON.stringify(h.records.get('A')), /Old stale cache/);
});

test('returning to the original account restores only its cloud papers; token refresh does not reset or reload', async () => {
  const h = harness({ rows: { A: { researchHub: papers('Only A') }, B: { researchHub: papers('Only B') } } });
  await h.request('/api/sync'); h.switchTo('B'); await h.request('/api/sync');
  assert.match(h.values.get(CARDS), /Only B/); assert.doesNotMatch(h.values.get(CARDS), /Only A/);
  h.switchTo('A'); await h.request('/api/sync'); assert.match(h.values.get(CARDS), /Only A/);
  const events = h.events.length;
  h.localStorage.setItem(FIELDS, JSON.stringify({ p1: { title: 'New A edit' } }));
  h.refreshToken(); assert.equal(h.events.length, events); assert.match(h.values.get(FIELDS), /New A edit/);
  await h.flush(); assert.match(h.records.get('A').payload.researchHub[FIELDS], /New A edit/);
});

test('a delayed cloud read from a previous session cannot restore its papers after switching accounts', async () => {
  const h = harness({ rows: { A: { researchHub: papers('Secret A') } } });
  await h.request('/api/auth/me');
  let release; h.delayRead(new Promise(resolve => { release = resolve; }));
  const loading = h.request('/api/sync');
  await new Promise(resolve => setImmediate(resolve)); h.switchTo('B'); release();
  assert.match((await loading).error, /账号已切换/);
  const loaded = await h.request('/api/sync'); assert.deepEqual(loaded.data.researchHub, {});
  assert.equal(h.values.get(CARDS), undefined);
});

test('unconfirmed registration does not claim a signed-in user or change the existing account', async () => {
  const h = harness({ rows: { A: { researchHub: papers('Keep A') } } }); await h.request('/api/sync');
  const result = await h.request('/api/auth/register', { email: 'new@example.test', password: 'test-only' });
  assert.equal(result.requiresConfirmation, true); assert.equal(result.user, null); assert.match(h.values.get(CARDS), /Keep A/);
});

test('app snapshot application clears absent keys and reloads a previously rendered pipeline', () => {
  const values = new Map(Object.entries(papers('Old iframe paper'))); let reloads = 0;
  const frame = { get src() { return 'pipeline.html'; }, set src(value) { reloads++; } };
  const context = { researchHubSnapshotApplied: false, researchHubKeys: [CARDS, FIELDS], localStorage: { getItem: key => values.get(key) ?? null, removeItem: key => values.delete(key), setItem: (key, value) => values.set(key, value) },
    trackerDisplayPreferencesKey: 'display', trackerCategoryCatalogKey: 'categories', trackerCategoryOrderKey: 'order', trackerCategoryColorsKey: 'colors',
    $: () => frame, state: { panel: 'research-hub' } };
  const start = app.indexOf('  function applyResearchHubSnapshot(');
  vm.runInNewContext(app.slice(start, app.indexOf('  var syncDataInFlight', start)), context);
  context.applyResearchHubSnapshot({}); assert.equal(values.size, 0); assert.equal(reloads, 1);
  context.applyResearchHubSnapshot({}); assert.equal(reloads, 1, 'ordinary cloud checks do not reload the pipeline');
});
