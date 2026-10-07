const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
process.env.TZ = 'Asia/Shanghai';
const source = fs.readFileSync(path.join(__dirname, '../web/app.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../web/workbench.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../web/style.css'), 'utf8');
const start = source.indexOf('  var peerReviewFieldMap =');
const end = source.indexOf('  // ===== 变量库：', start);
function harness(options = {}) {
  const state = { panel: 'peer-reviews', peerReviews: { items: [], trash: [] }, peerReviewId: null, peerReviewTrashOpen: false, peerReviewFilter: 'all', peerReviewQuery: '', peerReviewBusy: false, peerReviewLoading: false };
  const nodes = new Map(), slots = {}, toasts = [], calls = []; let flushes = 0;
  function node(id) { if (!nodes.has(id)) nodes.set(id, { value: '', textContent: '', innerHTML: '', disabled: false, hidden: false, handlers: {}, focus() {}, addEventListener(type, handler) { this.handlers[type] = handler; } }); return nodes.get(id); }
  const context = vm.createContext({ state, autoSaveSlots: slots, Date, console,
    $: selector => node(selector.slice(1)), escapeHtml: text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'),
    toast: message => toasts.push(message), confirm: () => true,
    api: async (endpoint, init) => { calls.push({ endpoint, body: init ? JSON.parse(init.body) : undefined }); return options.api ? options.api(endpoint, init) : { ok: true, peerReviews: structuredClone(state.peerReviews) }; },
    afterCurrentEditorSaved: async (panel, callback) => { flushes++; if (options.flushFails) return; try { return await callback(); } catch (e) { toasts.push(e.message); } },
    queueAutoSave: (key, payload, persist) => { slots[key] = { dirty: true, payload, persist }; },
    saveImmediately: async (key, payload, persist) => {
      slots[key] = { dirty: true, payload, persist };
      try { await persist(payload); slots[key].dirty = false; } catch (_) { /* Real auto-save chain retains dirty flag and swallows errors. */ }
    }
  });
  vm.runInContext(source.slice(start, end), context);
  return { context, state, slots, node, calls, toasts, flushes: () => flushes };
}
function addTask(h, extras = {}) {
  const item = { id: 'one', title: 'Review one', journal: 'JEEM', round: 1, status: '审稿中', recommendation: '尚未决定', dueAt: '', ...extras };
  h.state.peerReviews.items.push(item); h.state.peerReviewId = item.id; h.context.renderPeerReviews(); return item;
}

test('all editor fields and event targets exist once; module, save, backup and search hooks are wired', () => {
  const h = harness(); h.context.bindPeerReviewEvents();
  for (const id of Array.from(html.matchAll(/id="(peerReview[^"]+)"/g), m => m[1])) assert.equal((html.match(new RegExp('id="' + id + '"', 'g')) || []).length, 1, id);
  for (const id of Object.values(h.context.peerReviewFieldMap)) { assert.ok(html.includes('id="' + id + '"'), id); assert.ok(h.node(id).handlers.input); assert.ok(h.node(id).handlers.change); }
  assert.ok(h.node('peerReviewNew').handlers.click); assert.ok(h.node('peerReviewList').handlers.click);
  assert.ok(source.includes("if (key.indexOf('peer-review:') === 0) return persistPeerReview"));
  assert.ok(source.includes("return 'peer-review:' + state.peerReviewId"));
  assert.ok(source.includes("addLine('审稿任务', ['peerReviews']"));
  assert.ok(source.includes("['reviews', '/api/peer-reviews', 'peerReviews']"));
  assert.ok(source.includes("openCmdkRecord('peer-reviews', item, 'reviews')"));
  assert.ok(css.includes('.peer-review-editor[hidden]')); assert.ok(css.includes('.peer-review-content { padding:18px 22px; overflow:auto;'));
});
test('deadlines respect local calendar dates, include today and exclude submitted/declined tasks', () => {
  const h = harness(); const now = new Date('2026-10-07T23:59:00+08:00'); const deadline = date => h.context.peerReviewDeadline({ status: '审稿中', dueAt: date }, now);
  assert.equal(deadline('2026-10-07').label, '今天截止'); assert.equal(deadline('2026-10-06').label, '逾期 1 天');
  assert.equal(deadline('2026-10-14').kind, 'soon'); assert.equal(deadline('2026-10-15').kind, '');
  for (const date of ['', 'invalid', '2026-02-30']) assert.equal(deadline(date).label, '');
  for (const status of ['已提交', '已拒绝']) assert.equal(h.context.peerReviewDeadline({ status, dueAt: '2026-10-01' }, now).kind, '');
});
test('search and state filters compose, active deadlines come first and originals are not reordered', () => {
  const h = harness();
  h.state.peerReviews.items = [
    { id: 'done', title: 'Same title', status: '已提交', dueAt: '2020-01-01' },
    { id: 'late', title: 'Same title', status: '审稿中', dueAt: '2030-01-01', manuscriptCode: 'Review2' },
    { id: 'early', title: 'Same title', status: '待决定', dueAt: '2029-01-01', editorComments: 'Confidential Keyword' }
  ];
  assert.deepEqual(Array.from(h.context.visiblePeerReviews(), i => i.id), ['early', 'late', 'done']);
  assert.deepEqual(h.state.peerReviews.items.map(i => i.id), ['done', 'late', 'early']);
  h.state.peerReviewFilter = '待决定'; h.state.peerReviewQuery = 'keyword';
  assert.deepEqual(Array.from(h.context.visiblePeerReviews(), i => i.id), ['early']);
});
test('editing queues the complete payload without rerendering the editor or changing entered whitespace', () => {
  const h = harness(); addTask(h);
  h.node('peerReviewSummary').value = 'First paragraph\n\nSecond paragraph\n\n';
  h.context.queuePeerReviewAutoSave();
  assert.equal(h.slots['peer-review:one'].payload.summary, h.node('peerReviewSummary').value);
  assert.equal(h.state.peerReviews.items[0].summary, h.node('peerReviewSummary').value);
  assert.ok(h.node('peerReviewSaveStatus').textContent.includes('待保存'));
  assert.equal(h.calls.length, 0);
});
test('older save responses preserve newer drafts and do not overwrite another selected task editor', async () => {
  const h = harness({ api: async () => ({ ok: true, peerReviews: { items: [{ id: 'one', title: 'Old server value', summary: 'older' }, { id: 'two', title: 'Task two' }], trash: [] } }) });
  addTask(h, { summary: 'Newest local draft' });
  h.slots['peer-review:one'] = { dirty: true, payload: { id: 'one', title: 'New local title', summary: 'Newest local draft' } };
  h.state.peerReviewId = 'two'; h.node('peerReviewTitle').value = 'Task two being edited';
  await h.context.persistPeerReview({ action: 'save', id: 'one', title: 'Old server value' });
  assert.equal(h.state.peerReviews.items[0].summary, 'Newest local draft'); assert.equal(h.state.peerReviews.items[0].title, 'New local title');
  assert.equal(h.node('peerReviewTitle').value, 'Task two being edited');
});
test('manual save failures retained by the shared auto-save chain never show a success toast', async () => {
  const h = harness({ api: async () => ({ ok: false, error: 'Cloud write failed' }) }); addTask(h);
  const saved = await h.context.savePeerReview();
  assert.equal(saved, false); assert.equal(h.slots['peer-review:one'].dirty, true);
  assert.ok(h.toasts.every(text => !text.includes('已保存'))); assert.ok(h.node('peerReviewSaveStatus').textContent.includes('保存失败'));
  assert.equal(h.state.peerReviewBusy, false); assert.equal(h.node('peerReviewSave').disabled, false);
});
test('new task and selection flush previous edits; creation is inline and blocked switches preserve the current task', async () => {
  const h = harness({ api: async () => ({ ok: true, createdId: 'new', peerReviews: { items: [{ id: 'one', title: 'Old' }, { id: 'new', title: 'New' }], trash: [] } }) });
  addTask(h); h.context.bindPeerReviewEvents();
  await h.context.mutatePeerReview('create');
  assert.equal(h.flushes(), 1); assert.equal(h.state.peerReviewId, 'new'); assert.equal(h.node('peerReviewEditor').hidden, false);
  assert.equal(h.state.peerReviewBusy, false);
  const blocked = harness({ flushFails: true }); addTask(blocked);
  await blocked.context.mutatePeerReview('create'); assert.equal(blocked.calls.length, 0); assert.equal(blocked.state.peerReviewId, 'one'); assert.equal(blocked.state.peerReviewBusy, false);
});
test('trash disables/hides the editor and safely escapes user-controlled titles and IDs', () => {
  const h = harness(); addTask(h, { title: '<img src=x onerror=alert(1)>', id: '"unsafe' });
  assert.ok(h.node('peerReviewList').innerHTML.includes('&lt;img')); assert.ok(!h.node('peerReviewList').innerHTML.includes('<img'));
  h.state.peerReviewTrashOpen = true; h.state.peerReviews.trash = [{ id: 'trash', item: { title: '<script>' } }]; h.context.renderPeerReviews();
  assert.equal(h.node('peerReviewEditor').hidden, true); assert.equal(h.node('peerReviewSave').disabled, true); assert.equal(h.node('peerReviewTitle').disabled, true);
  assert.ok(h.node('peerReviewList').innerHTML.includes('&lt;script>'));
});

test('a pending initial load blocks creation until the catalog arrives, preventing late reads replacing new tasks', async () => {
  let resolveLoad;
  const h = harness({ api: () => new Promise(resolve => { resolveLoad = resolve; }) });
  const loading = h.context.loadPeerReviews();
  assert.equal(h.state.peerReviewLoading, true); assert.equal(h.node('peerReviewNew').disabled, true);
  await h.context.mutatePeerReview('create'); assert.equal(h.calls.length, 1);
  resolveLoad({ ok: true, peerReviews: { items: [], trash: [] } }); await loading;
  assert.equal(h.state.peerReviewLoading, false); assert.equal(h.node('peerReviewNew').disabled, false);
});
