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
  assert.equal(result.status, 200); assert.deepEqual((await result.json()).peerReviews, { items: [], trash: [], folders: [] }); assert.equal(h.writeCount(), 0);
  const guest = harness(initial(), { signedOut: true });
  assert.equal((await guest.get('/api/peer-reviews')).status, 401);
  assert.equal((await request(guest, { action: 'create' })).status, 401); assert.equal(guest.writeCount(), 0);
});
test('complete review saves, refreshes and reloads with comments, whitespace and other modules preserved', async () => {
  const h = harness(initial()); const id = await create(h);
  await request(h, { action: 'next-round', id, expectedRound: 1 });
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

test('next round atomically archives all current review fields, clears new opinions/dates and preserves manuscript metadata', async () => {
  const h = harness(initial()); const id = await create(h);
  const fields = { title: 'Synthetic review', journal: 'Test journal', manuscriptCode: 'CODE', round: 1, status: '已提交', invitedAt: '2026-10-01', dueAt: '2026-10-05', submittedAt: '2026-10-04', recommendation: '大修', manuscriptUrl: 'https://example.test/review', summary: 'First\n\nLast\n\n', majorComments: 'MAJOR', minorComments: 'MINOR', editorComments: 'EDITOR_ONLY', notes: 'PERSONAL_ONLY' };
  await request(h, { action: 'save', id, ...fields });
  const result = await request(h, { action: 'next-round', id, expectedRound: 1 }); assert.equal(result.status, 200);
  const item = result.body.peerReviews.items[0]; assert.equal(item.round, 2); assert.equal(item.history.length, 1);
  for (const field of Object.keys(fields)) assert.equal(item.history[0][field], fields[field], field);
  assert.ok(item.history[0].id); assert.ok(item.history[0].archivedAt); assert.equal(item.history[0].history, undefined);
  for (const field of ['title', 'journal', 'manuscriptCode', 'manuscriptUrl']) assert.equal(item[field], fields[field]);
  for (const field of ['invitedAt', 'dueAt', 'submittedAt', 'summary', 'majorComments', 'minorComments', 'editorComments', 'notes']) assert.equal(item[field], '');
  assert.equal(item.status, '审稿中'); assert.equal(item.recommendation, '尚未决定');
  assert.deepEqual(h.readWorkspace().referenceLibrary, initial().referenceLibrary);
});

test('history survives refresh, later edits, second archive, trash and restore without alteration', async () => {
  const h = harness(initial()); const id = await create(h);
  await request(h, { action: 'save', id, round: 1, summary: 'Original first round' });
  await request(h, { action: 'next-round', id, expectedRound: 1 });
  const frozenFirst = h.readWorkspace().peerReviews.items[0].history[0];
  const fresh = harness(h.readWorkspace());
  await request(fresh, { action: 'save', id, round: 2, title: 'Revised title', summary: 'Second round', history: [{ summary: 'Tampered history' }] });
  assert.deepEqual(fresh.readWorkspace().peerReviews.items[0].history, [frozenFirst]);
  await request(fresh, { action: 'next-round', id, expectedRound: 2 });
  const history = fresh.readWorkspace().peerReviews.items[0].history; assert.equal(history.length, 2); assert.deepEqual(history[0], frozenFirst); assert.equal(history[1].summary, 'Second round');
  assert.notEqual(history[0].id, history[1].id);
  const trash = await request(fresh, { action: 'trash', id });
  await request(fresh, { action: 'restore', id: trash.body.peerReviews.trash[0].id });
  assert.deepEqual(fresh.readWorkspace().peerReviews.items[0].history, history);
});

test('replayed next-round operations and stale saves cannot overwrite a new round or its archive', async () => {
  const h = harness(initial()); const id = await create(h);
  await request(h, { action: 'save', id, summary: 'First' });
  await request(h, { action: 'next-round', id, expectedRound: 1 });
  await request(h, { action: 'save', id, round: 2, summary: 'New work' });
  const before = h.readWorkspace(); const writes = h.writeCount();
  for (const body of [{ action: 'next-round', id, expectedRound: 1 }, { action: 'next-round', id }, { action: 'save', id, round: 1, summary: 'Delayed save' }, { action: 'save', id, summary: 'Legacy delayed save' }, { action: 'save', id, round: 3 }]) assert.equal((await request(h, body)).status, 409);
  assert.equal(h.writeCount(), writes); assert.deepEqual(h.readWorkspace(), before);
});

test('legacy tasks without history migrate on first archive, using their current round number', async () => {
  const data = initial(); data.peerReviews.items.push({ id: 'legacy', title: 'Existing task', round: 4, summary: 'Keep legacy opinions', notes: 'Keep note' });
  const h = harness(data); const result = await request(h, { action: 'next-round', id: 'legacy', expectedRound: 4 });
  assert.equal(result.status, 200); assert.equal(result.body.peerReviews.items[0].round, 5); assert.equal(result.body.peerReviews.items[0].history[0].round, 4); assert.equal(result.body.peerReviews.items[0].history[0].notes, 'Keep note');
});

test('round limits, missing tasks, signed-out requests and cloud failures leave history and opinions untouched', async () => {
  const data = initial(); data.peerReviews.items.push({ id: 'limit', round: 20, summary: 'Keep', history: [] });
  const h = harness(data); assert.equal((await request(h, { action: 'next-round', id: 'limit', expectedRound: 20 })).status, 422);
  assert.equal((await request(h, { action: 'next-round', id: 'missing', expectedRound: 1 })).status, 404); assert.equal(h.writeCount(), 0);
  const guest = harness(data, { signedOut: true }); assert.equal((await request(guest, { action: 'next-round', id: 'limit', expectedRound: 20 })).status, 401);
  data.peerReviews.items[0].round = 1;
  const failed = harness(data, { failWrites: true }); assert.equal((await request(failed, { action: 'next-round', id: 'limit', expectedRound: 1 })).status, 500);
  assert.equal(failed.writeCount(), 0); assert.deepEqual(failed.readWorkspace(), data);
});

const checkRow = (id, extras = {}) => ({ id, kind: '主要意见', status: '待核对', issue: 'Identification strategy\n\nSecond paragraph', response: 'Author reply', assessment: 'My private judgment', sourceHistoryId: '', sourceKey: '', ...extras });

test('checklist saves and reloads with whitespace, preserves omitted rows and ignores unrelated injected fields', async () => {
  const h = harness(initial()); const id = await create(h);
  const checklist = [checkRow('c1', { status: '部分解决', sourceRound: 99, unknown: 'Do not persist' }), checkRow('c2', { kind: '补充问题', status: '已解决' })];
  assert.equal((await request(h, { action: 'save', id, round: 1, checklist })).status, 200);
  const saved = h.readWorkspace().peerReviews.items[0].checklist;
  assert.equal(saved.length, 2); assert.equal(saved[0].issue, checklist[0].issue); assert.equal(saved[0].assessment, checklist[0].assessment); assert.equal(saved[0].sourceRound, ''); assert.equal(saved[0].unknown, undefined);
  await request(h, { action: 'save', id, round: 1, summary: 'Other changes' });
  const loaded = await (await harness(h.readWorkspace()).get('/api/peer-reviews')).json(); assert.deepEqual(loaded.peerReviews.items[0].checklist, saved);
});

test('checklist source links are validated against actual history and round numbers are derived rather than trusted', async () => {
  const h = harness(initial()); const id = await create(h); await request(h, { action: 'save', id, majorComments: 'Previous problem' });
  const archived = await request(h, { action: 'next-round', id, expectedRound: 1 }); const snapshotId = archived.body.peerReviews.items[0].history[0].id;
  const row = checkRow('c1', { sourceHistoryId: snapshotId, sourceKey: 'majorComments:0', sourceRound: 500 });
  const result = await request(h, { action: 'save', id, round: 2, checklist: [row] }); assert.equal(result.status, 200);
  assert.equal(result.body.peerReviews.items[0].checklist[0].sourceRound, 1); assert.equal(result.body.peerReviews.items[0].checklist[0].sourceHistoryId, snapshotId);
  const before = h.readWorkspace(); const writes = h.writeCount();
  assert.equal((await request(h, { action: 'save', id, round: 2, checklist: [checkRow('bad', { sourceHistoryId: 'foreign-snapshot' })] })).status, 422); assert.equal(h.writeCount(), writes); assert.deepEqual(h.readWorkspace(), before);
});

test('malformed, duplicate, oversized and excessive checklist rows fail before any cloud write', async () => {
  const h = harness(initial()); const id = await create(h); const writes = h.writeCount();
  for (const checklist of [{}, [null], [checkRow('x'), checkRow('x')], [checkRow('')], [checkRow('x', { kind: 'invalid' })], [checkRow('x', { status: 'invalid' })], [checkRow('x', { issue: {} })], [checkRow('x', { response: 'x'.repeat(10001) })], [checkRow('x', { sourceKey: 'x'.repeat(101) })], Array.from({ length: 101 }, (_, i) => checkRow('c' + i))]) {
    assert.equal((await request(h, { action: 'save', id, round: 1, checklist })).status, 422);
  }
  assert.equal(h.writeCount(), writes); assert.deepEqual(h.readWorkspace().peerReviews.items[0].checklist, []);
});

test('archiving freezes checklist rows and a new round starts empty; trash/restore retains historical checks', async () => {
  const h = harness(initial()); const id = await create(h);
  await request(h, { action: 'save', id, round: 1, checklist: [checkRow('old', { status: '未解决' })] });
  const result = await request(h, { action: 'next-round', id, expectedRound: 1 }); const frozen = result.body.peerReviews.items[0].history[0].checklist;
  assert.equal(frozen[0].assessment, 'My private judgment'); assert.deepEqual(result.body.peerReviews.items[0].checklist, []);
  await request(h, { action: 'save', id, round: 2, checklist: [checkRow('new', { status: '已解决' })] });
  assert.deepEqual(h.readWorkspace().peerReviews.items[0].history[0].checklist, frozen);
  const trash = await request(h, { action: 'trash', id }); const restored = await request(h, { action: 'restore', id: trash.body.peerReviews.trash[0].id });
  assert.deepEqual(restored.body.peerReviews.items[0].history[0].checklist, frozen); assert.equal(restored.body.peerReviews.items[0].checklist[0].id, 'new');
});

test('deleting one checklist row only affects that row and stale round saves cannot erase the current checklist', async () => {
  const h = harness(initial()); const id = await create(h); await request(h, { action: 'next-round', id, expectedRound: 1 });
  await request(h, { action: 'save', id, round: 2, checklist: [checkRow('keep'), checkRow('remove')] });
  await request(h, { action: 'save', id, round: 2, checklist: [checkRow('keep')] });
  assert.equal((await request(h, { action: 'save', id, round: 1, checklist: [] })).status, 409); assert.deepEqual(h.readWorkspace().peerReviews.items[0].checklist.map(row => row.id), ['keep']);
});

test('review folders create, rename and persist across a fresh account load; tasks can be created or moved into folders', async () => {
  const h = harness(initial()); const folder = await request(h, { action: 'create-folder', name: '  Economics  ' });
  assert.equal(folder.status, 200); const folderId = folder.body.createdFolderId; assert.ok(folderId);
  const task = await request(h, { action: 'create', folderId }); const id = task.body.createdId;
  assert.equal(task.body.peerReviews.items[0].folderId, folderId);
  await request(h, { action: 'rename-folder', folderId, name: 'Environmental economics' });
  const fresh = harness(h.readWorkspace()); const loaded = await (await fresh.get('/api/peer-reviews')).json();
  assert.equal(loaded.peerReviews.folders[0].name, 'Environmental economics'); assert.equal(loaded.peerReviews.items[0].folderId, folderId);
  await request(fresh, { action: 'save', id, round: 1, folderId: '' }); assert.equal(fresh.readWorkspace().peerReviews.items[0].folderId, '');
  await request(fresh, { action: 'save', id, round: 1, folderId }); assert.equal(fresh.readWorkspace().peerReviews.items[0].folderId, folderId);
});

test('deleting a review folder moves active and trashed tasks to unfiled, preserving opinions, rounds and other folders', async () => {
  const h = harness(initial()); const first = (await request(h, { action: 'create-folder', name: 'First' })).body.createdFolderId;
  const second = (await request(h, { action: 'create-folder', name: 'Keep folder' })).body.createdFolderId;
  const a = (await request(h, { action: 'create', folderId: first })).body.createdId; const b = (await request(h, { action: 'create', folderId: first })).body.createdId;
  await request(h, { action: 'save', id: a, round: 1, summary: 'Keep author opinion' }); await request(h, { action: 'next-round', id: a, expectedRound: 1 }); await request(h, { action: 'trash', id: b });
  const history = h.readWorkspace().peerReviews.items[0].history;
  const deleted = await request(h, { action: 'delete-folder', folderId: first }); assert.equal(deleted.status, 200);
  const data = deleted.body.peerReviews; assert.deepEqual(data.folders.map(folder => folder.id), [second]); assert.equal(data.items.length, 1); assert.equal(data.trash.length, 1);
  assert.equal(data.items[0].folderId, ''); assert.equal(data.trash[0].item.folderId, ''); assert.deepEqual(data.items[0].history, history);
  assert.deepEqual(h.readWorkspace().referenceLibrary, initial().referenceLibrary);
});

test('invalid folder actions, duplicate/reserved names and invalid task folder IDs fail before writes', async () => {
  const h = harness(initial()); const id = await create(h); const folderId = (await request(h, { action: 'create-folder', name: 'Named folder' })).body.createdFolderId; const writes = h.writeCount();
  for (const [body, status] of [[{ action: 'create-folder', name: '' }, 422], [{ action: 'create-folder', name: 'x'.repeat(81) }, 422], [{ action: 'create-folder', name: 'NAMED FOLDER', folderId }, 409], [{ action: 'create-folder', name: '未分类' }, 409], [{ action: 'rename-folder', folderId: 'missing', name: 'New' }, 404], [{ action: 'delete-folder', folderId: 'missing' }, 404], [{ action: 'create', folderId: 'missing' }, 422], [{ action: 'save', id, round: 1, folderId: 'missing' }, 422]]) assert.equal((await request(h, body)).status, status);
  assert.equal(h.writeCount(), writes); assert.equal(h.readWorkspace().peerReviews.items.length, 1);
});

test('folder cloud-write failures leave tasks and folder catalog unchanged', async () => {
  const data = initial(); data.peerReviews.folders = [{ id: 'f1', name: 'Keep' }]; data.peerReviews.items.push({ id: 'one', round: 1, folderId: 'f1', summary: 'Keep opinion' });
  const h = harness(data, { failWrites: true });
  for (const body of [{ action: 'create-folder', name: 'New' }, { action: 'rename-folder', folderId: 'f1', name: 'Changed' }, { action: 'delete-folder', folderId: 'f1' }]) assert.equal((await request(h, body)).status, 500);
  assert.deepEqual(h.readWorkspace(), data); assert.equal(h.writeCount(), 0);
});
