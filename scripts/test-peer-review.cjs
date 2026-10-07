const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
// Reuse the existing isolated workspace harness without executing its tests.
const harnessSource = fs.readFileSync(path.join(__dirname, 'test-reference-operations.cjs'), 'utf8');
const staticApiSource = fs.readFileSync(path.join(__dirname, '../web/static-api.js'), 'utf8');
const context = vm.createContext({ staticApiSource, vm, structuredClone, Response, Request, Headers, URL, setTimeout, clearTimeout, Date, Math, JSON, Object, Array, String, Number, Boolean, Map, Set, Promise, Error, RegExp, console });
vm.runInContext(harnessSource.slice(harnessSource.indexOf('function createApiHarness('), harnessSource.indexOf("test('browser preference")), context);
const harness = context.createApiHarness;
const initial = () => ({ peerReviews: { items: [], trash: [] }, researchProjects: { projects: [{ id: 1, title: 'Keep my project' }], trash: [] }, referenceLibrary: { items: [{ id: 9, title: 'Keep my reference' }] } });
async function create(h) { const result = await (await h.request({ action: 'create' }, '/api/peer-reviews')).json(); assert.equal(result.ok, true); return result.createdId; }
async function request(h, body) { const response = await h.request(body, '/api/peer-reviews'); return { status: response.status, body: await response.json() }; }

test('authenticated legacy workspaces load an empty module without a write; signed-out reads and writes are rejected', async () => {
  const h = harness({ todos: [] }); const result = await h.get('/api/peer-reviews');
  assert.equal(result.status, 200); assert.deepEqual((await result.json()).peerReviews, { items: [], trash: [] }); assert.equal(h.writeCount(), 0);
  const guest = harness(initial(), { signedOut: true });
  assert.equal((await guest.get('/api/peer-reviews')).status, 401);
  assert.equal((await request(guest, { action: 'create' })).status, 401); assert.equal(guest.writeCount(), 0);
});
test('complete review saves, refreshes and reloads with comments, whitespace and other modules preserved', async () => {
  const h = harness(initial()); const id = await create(h);
  const body = { action: 'save', id, title: 'Political career incentives', journal: 'JEEM', manuscriptCode: 'JEEM-2026-0123', round: 2,
    status: '审稿中', invitedAt: '2026-10-01', dueAt: '2026-10-20', submittedAt: '', recommendation: '大修', manuscriptUrl: 'https://example.test/review',
    summary: '第一段\n\n第二段\n\n', majorComments: '1.识别策略\n2.数据', minorComments: '格式建议', editorComments: 'Confidential for editor only', notes: 'Personal notes' };
  const saved = await request(h, body); assert.equal(saved.status, 200);
  const loaded = await (await harness(h.readWorkspace()).get('/api/peer-reviews')).json();
  const item = loaded.peerReviews.items[0];
  for (const key of Object.keys(body).filter(k => k !== 'action')) assert.equal(item[key], body[key], key);
  assert.deepEqual(h.readWorkspace().researchProjects, initial().researchProjects);
  assert.deepEqual(h.readWorkspace().referenceLibrary, initial().referenceLibrary);
});
test('rapid task creation uses distinct IDs and append order', async () => {
  const h = harness(initial()); const first = await create(h); const second = await create(h);
  assert.notEqual(first, second); assert.deepEqual(h.readWorkspace().peerReviews.items.map(i => i.id), [first, second]);
});
test('partial saves retain omitted fields and cannot alter ID or creation metadata', async () => {
  const h = harness(initial()); const id = await create(h);
  await request(h, { action: 'save', id, majorComments: 'Keep these opinions', created: 'tampered', peerReviews: {} });
  const prior = h.readWorkspace().peerReviews.items[0];
  await request(h, { action: 'save', id, status: '已提交', submittedAt: '2026-10-07' });
  const item = h.readWorkspace().peerReviews.items[0]; assert.equal(item.majorComments, prior.majorComments); assert.equal(item.created, prior.created); assert.equal(item.id, id);
});
test('invalid action, ID, enums, dates, round, URLs and oversized fields fail before cloud writes', async () => {
  const h = harness(initial()); const id = await create(h); const writes = h.writeCount();
  for (const [body, code] of [
    [{ action: 'unknown' }, 400], [{ action: 'save', id: 'missing' }, 404], [{ action: 'trash', id: 'missing' }, 404],
    [{ action: 'save', id, status: 'no' }, 422], [{ action: 'save', id, recommendation: 'no' }, 422],
    [{ action: 'save', id, dueAt: '2026-02-30' }, 422], [{ action: 'save', id, invitedAt: 'tomorrow' }, 422],
    [{ action: 'save', id, round: 0 }, 422], [{ action: 'save', id, round: 1.5 }, 422],
    [{ action: 'save', id, manuscriptUrl: 'javascript:alert(1)' }, 422], [{ action: 'save', id, title: 'a'.repeat(1001) }, 422]
  ]) assert.equal((await request(h, body)).status, code, JSON.stringify(body).slice(0, 100));
  assert.equal(h.writeCount(), writes); assert.equal(h.readWorkspace().peerReviews.items[0].status, '待决定');
});
test('trash is reversible, stale saves cannot recreate deleted tasks, and purge affects only the chosen trash entry', async () => {
  const h = harness(initial()); const id = await create(h); await request(h, { action: 'save', id, notes: 'Preserved note' });
  const trashed = await request(h, { action: 'trash', id }); const entry = trashed.body.peerReviews.trash[0];
  assert.equal(trashed.body.peerReviews.items.length, 0);
  assert.equal((await request(h, { action: 'save', id, notes: 'late response' })).status, 404);
  const restored = await request(h, { action: 'restore', id: entry.id }); assert.equal(restored.body.peerReviews.items[0].notes, 'Preserved note');
  await request(h, { action: 'trash', id });
  const second = await create(h); await request(h, { action: 'trash', id: second });
  const trash = h.readWorkspace().peerReviews.trash; await request(h, { action: 'purge', id: trash[0].id });
  assert.deepEqual(h.readWorkspace().peerReviews.trash.map(e => e.id), [trash[1].id]);
  assert.equal((await request(h, { action: 'restore', id: trash[0].id })).status, 404);
});
test('failed cloud writes return failure and never appear in a fresh account load', async () => {
  const h = harness(initial(), { failWrites: true }); const result = await request(h, { action: 'create' });
  assert.equal(result.status, 500); assert.equal(result.body.ok, false); assert.equal(h.writeCount(), 0);
  const fresh = await (await harness(h.readWorkspace()).get('/api/peer-reviews')).json(); assert.equal(fresh.peerReviews.items.length, 0);
});
