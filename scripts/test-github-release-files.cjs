const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, file), 'utf8');
const source = read('../web/github-release-files.js'), app = read('../web/app.js'), html = read('../web/workbench.html');
function helper(options = {}) {
  const context = vm.createContext({ window: {}, URL, AbortController, setTimeout, clearTimeout, ...options });
  vm.runInContext(source, context); return context.window.__academicGitHubReleases;
}
const github = helper();
const reference = { id: 'gh-one', kind: 'data', repo: 'sample/research', tag: 'materials', assetId: 42, name: 'data.csv', size: 80000000, url: 'https://github.com/sample/research/releases/download/materials/data.csv', addedAt: '2026-11-28T00:00:00.000Z' };
const asset = (index = 42) => ({ id: index, state: 'uploaded', name: 'data-' + index + '.csv', size: 80000000, browser_download_url: 'https://github.com/sample/research/releases/download/materials/data-' + index + '.csv' });

test('only canonical GitHub release asset URLs are accepted; Unicode names and slash tags round-trip without tokens', () => {
  const parsed = github.parseAssetUrl('https://github.com/Sample/Research/releases/download/v1%2Fdata/%E6%95%B0%E6%8D%AE.csv');
  assert.equal(parsed.repo, 'sample/research'); assert.equal(parsed.tag, 'v1/data'); assert.equal(parsed.name, '数据.csv');
  assert.equal(parsed.url, 'https://github.com/sample/research/releases/download/v1%2Fdata/%E6%95%B0%E6%8D%AE.csv');
  for (const value of ['javascript:alert(1)', 'https://github.com.evil.test/a/b/releases/download/x/f', 'https://user:secret@github.com/a/b/releases/download/x/f', 'http://github.com/a/b/releases/download/x/f', 'https://github.com/a/b/releases/tag/x', reference.url + '?token=secret', reference.url + '#secret', 'https://github.com/a/b/releases/download/x/%2Fbad']) assert.throws(() => github.parseAssetUrl(value));
});

test('reference validation enforces scope, sizes, unique IDs and per-category links without trusting supplied repository metadata', () => {
  const clean = github.validateFiles([{ ...reference, repo: 'forged/elsewhere', tag: 'forged' }]);
  assert.equal(clean[0].repo, 'sample/research'); assert.equal(clean[0].tag, 'materials');
  for (const files of [[reference, reference], [{ ...reference, kind: 'other' }], [{ ...reference, size: 2 * 1024 ** 3 }], [{ ...reference, assetId: -1 }], [{ ...reference, addedAt: 'bad' }], [{ ...reference, name: '<name>\0bad' }], Array(201).fill(reference)]) assert.throws(() => github.validateFiles(files));
  assert.equal(github.validateFiles([{ ...reference, size: null, assetId: null }]).length, 1);
  assert.equal(github.validateFiles([reference, { ...reference, id: 'other', kind: 'code' }]).length, 2);
});

test('release reads use credential-free GET requests, paginate assets and reject a different repository or unpublished release', async () => {
  const calls = [];
  const result = await github.readRelease('sample/research', 'materials', async (url, init) => {
    calls.push({ url, init });
    return { ok: true, json: async () => calls.length === 1 ? { id: 7, tag_name: 'materials', draft: false } : calls.length === 2 ? Array.from({ length: 100 }, (_, i) => asset(i + 1)) : [asset(101), { ...asset(102), state: 'starter' }] };
  });
  assert.equal(result.assets.length, 101); assert.equal(result.truncated, false); assert.match(calls[2].url, /page=2$/);
  for (const call of calls) { assert.equal(call.init.credentials, 'omit'); assert.equal(call.init.headers.Authorization, undefined); assert.ok(call.url.startsWith('https://api.github.com/repos/sample/research/')); }
  await assert.rejects(github.readRelease('sample/research', 'materials', async () => ({ ok: true, json: async () => ({ id: 7, tag_name: 'materials', draft: true }) })), /尚未公开/);
  let count = 0;
  await assert.rejects(github.readRelease('sample/research', 'materials', async () => ({ ok: true, json: async () => ++count === 1 ? { id: 7, tag_name: 'materials' } : [{ ...asset(), browser_download_url: 'https://github.com/other/repo/releases/download/materials/a.csv' }] })), /来源/);
});

test('rate limits, missing releases and network timeouts offer an actionable link fallback rather than an empty successful list', async () => {
  for (const status of [403, 404, 429]) await assert.rejects(github.readRelease('sample/research', 'materials', async () => ({ ok: false, status })), /粘贴/);
  const fast = helper({ setTimeout: callback => setTimeout(callback, 1) });
  await assert.rejects(fast.readRelease('sample/research', 'materials', async (_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(Error('abort'), { name: 'AbortError' }))))), /超时/);
});

const staticApiSource = read('../web/static-api.js'), apiTests = read('test-reference-operations.cjs');
const apiContext = vm.createContext({ staticApiSource, vm, structuredClone, Response, Request, Headers, URL, setTimeout, clearTimeout, Date, Math, JSON, Object, Array, String, Number, Boolean, Map, Set, Promise, Error, RegExp, console });
vm.runInContext(apiTests.slice(apiTests.indexOf('function createApiHarness('), apiTests.indexOf('\ntest(')), apiContext);
const payload = () => ({ replications: { items: [{ id: 'rp-one', title: 'Test', status: '未开始' }], trash: [], folders: [] }, todos: [{ id: 'keep' }] });
const api = (value, options = {}) => apiContext.createApiHarness(value, { githubReleases: github, ...options });
const request = (h, body) => h.request(body, '/api/replications');

test('GitHub references persist in the account workspace, reload and trash restore without touching Supabase storage', async () => {
  const h = api(payload()); assert.equal((await request(h, { action: 'save', id: 'rp-one', githubFiles: [reference] })).status, 200);
  await request(h, { action: 'save', id: 'rp-one', notes: 'keep' });
  const loaded = api(h.readWorkspace());
  assert.deepEqual((await (await loaded.get('/api/replications')).json()).replications.items[0].githubFiles, [reference]);
  await request(h, { action: 'trash', id: 'rp-one' }); await request(h, { action: 'restore', id: h.readWorkspace().replications.trash[0].id });
  assert.equal(h.readWorkspace().replications.items[0].githubFiles[0].size, 80000000); assert.equal(h.readWorkspace().todos[0].id, 'keep');
});

test('invalid references, unauthenticated edits and failed writes never partially change saved task content', async () => {
  const original = payload(), h = api(original);
  assert.equal((await request(h, { action: 'save', id: 'rp-one', title: 'must not persist', githubFiles: [{ ...reference, url: 'https://evil.test/file' }] })).status, 422);
  assert.deepEqual(h.readWorkspace(), original);
  const offline = api(original, { failWrites: true }); assert.ok((await request(offline, { action: 'save', id: 'rp-one', githubFiles: [reference] })).status >= 400); assert.deepEqual(offline.readWorkspace(), original);
  const guest = api(original, { signedOut: true }); assert.equal((await request(guest, { action: 'save', id: 'rp-one', githubFiles: [reference] })).status, 401);
});

const uiTests = read('test-replications.cjs'), uiContext = vm.createContext({ app, html, vm, structuredClone });
vm.runInContext(uiTests.slice(uiTests.indexOf('function uiHarness('), uiTests.indexOf('\ntest(', uiTests.indexOf('function uiHarness('))), uiContext);
function ui(readRelease = github.readRelease) { const h = uiContext.uiHarness(); h.context.window.__academicGitHubReleases = { ...github, readRelease }; h.select(); h.context.bindReplicationEvents(); return h; }
const button = (action, kind = 'data', extra = {}) => ({ dataset: { replicationGithubAction: action, replicationGithubKind: kind, ...extra } });
const tick = () => new Promise(resolve => setImmediate(resolve));

test('all five categories support the manual URL workflow, autosave and duplicate prevention without uploading file bytes', async () => {
  const h = ui();
  for (const kind of ['paper', 'supplement', 'data', 'code', 'result']) {
    await h.context.replicationGitHubAction(button('toggle', kind));
    const view = h.context.replicationGitHubView(kind); view.manual = reference.url;
    await h.context.replicationGitHubAction(button('manual', kind));
    assert.match(h.node('replicationGitHubFiles_' + kind).innerHTML, /移除关联/);
    assert.ok(html.includes('id="replicationGitHubFiles_' + kind + '"'));
    view.manual = reference.url; await h.context.replicationGitHubAction(button('manual', kind));
    assert.match(view.status, /已经关联/);
  }
  assert.equal(h.context.activeReplication().githubFiles.length, 5); assert.equal(h.slots['replication:rp-one'].payload.githubFiles.length, 5);
  h.context.applyReplications({ items: [{ id: 'rp-one', githubFiles: [] }], trash: [] });
  assert.equal(h.context.activeReplication().githubFiles.length, 5);
  h.state.replicationQuery = 'data.csv'; h.context.renderReplicationList(); assert.match(h.node('replicationList').innerHTML, /Test/);
});

test('ordinary read and select controls attach only selected assets and preserve unrelated text drafts', async () => {
  const h = ui(async () => ({ assets: [asset(1), asset(2)].map(a => ({ ...github.parseAssetUrl(a.browser_download_url), assetId: a.id, size: a.size })), truncated: false }));
  await h.context.replicationGitHubAction(button('toggle')); await h.context.replicationGitHubAction(button('read'));
  const view = h.context.replicationGitHubView('data'), target = { dataset: { replicationGithubKind: 'data', replicationGithubSelect: view.assets[1].url }, checked: true };
  h.node('panel-replications').handlers.change({ target: { closest: selector => selector.includes('data-replication-github-select') ? target : null } });
  h.node('replicationNotes').value = 'still typing';
  await h.context.replicationGitHubAction(button('attach'));
  assert.equal(h.context.activeReplication().githubFiles.length, 1); assert.equal(h.context.activeReplication().githubFiles[0].assetId, 2);
  assert.equal(h.node('replicationNotes').value, 'still typing');
});

test('task/account changes discard late reads without associating files to a new task', async () => {
  let finish;
  const h = ui(() => new Promise(resolve => { finish = resolve; }));
  const pending = h.context.replicationGitHubAction(button('read')); await tick();
  h.select({ id: 'rp-two' }); finish({ assets: [], truncated: false }); await pending;
  assert.equal(h.context.replicationGitHubView('data').assets.length, 0); assert.equal(h.context.activeReplication().githubFiles, undefined);
  let finishOther;
  h.context.window.__academicGitHubReleases.readRelease = () => new Promise(resolve => { finishOther = resolve; });
  const other = h.context.replicationGitHubAction(button('read')); await tick();
  h.context.account = { id: 'new-user' }; h.state.replications = { items: [], trash: [] }; h.state.replicationId = null;
  finishOther({ assets: [{ ...reference }], truncated: false }); await other;
  assert.equal(h.node('replicationGitHubFiles_data').innerHTML.includes('data.csv'), false);
});

test('source editing invalidates old candidates and changing accounts resets the source and selection view', async () => {
  const h = ui(async () => ({ assets: [{ ...reference }], truncated: false }));
  await h.context.replicationGitHubAction(button('toggle')); await h.context.replicationGitHubAction(button('read'));
  const view = h.context.replicationGitHubView('data'); view.selected = [reference.url];
  const input = { dataset: { replicationGithubKind: 'data', replicationGithubField: 'repo' }, value: 'other/materials' };
  h.node('panel-replications').handlers.input({ target: { closest: selector => selector === '[data-replication-github-field]' ? input : null } });
  assert.equal(view.repo, 'other/materials'); assert.equal(view.assets.length, 0); assert.equal(view.selected.length, 0);
  await h.context.replicationGitHubAction(button('attach')); assert.equal(h.context.activeReplication().githubFiles, undefined);
  h.context.account = { id: 'new' }; h.context.replicationAttachmentCache();
  const fresh = h.context.replicationGitHubView('data'); assert.notEqual(fresh, view); assert.equal(fresh.selected.length, 0); assert.equal(fresh.open, false);
});

test('removing a reference edits metadata only, and malicious imported links are never rendered as active downloads', async () => {
  const h = ui(); h.context.activeReplication().githubFiles = [{ ...reference }];
  await h.context.replicationGitHubAction(button('remove', 'data', { replicationGithubTask: 'rp-one', replicationGithubId: 'gh-one' }));
  assert.equal(h.slots['replication:rp-one'].payload.githubFiles.length, 0);
  h.context.activeReplication().githubFiles = [{ ...reference, name: '<img src=x>', url: 'javascript:alert(1)' }]; h.context.renderReplicationGitHubFiles('data');
  const markup = h.node('replicationGitHubFiles_data').innerHTML;
  assert.doesNotMatch(markup, /href="javascript:|<img/); assert.match(markup, /&lt;img/);
  assert.ok(!source.includes('Authorization')); assert.ok(!source.includes('localStorage')); assert.ok(!source.includes("method: 'POST'"));
});
