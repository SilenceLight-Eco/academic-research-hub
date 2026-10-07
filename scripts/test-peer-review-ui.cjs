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
  const nodes = new Map(), slots = {}, toasts = [], calls = [], downloads = []; let flushes = 0;
  function node(id) { if (!nodes.has(id)) nodes.set(id, { value: '', textContent: '', innerHTML: '', disabled: false, hidden: false, handlers: {}, focus() {}, addEventListener(type, handler) { this.handlers[type] = handler; } }); return nodes.get(id); }
  const context = vm.createContext({ state, autoSaveSlots: slots, Date, console, Blob,
    downloadBlob: (blob, filename) => { if (options.downloadFails) throw new Error('Download blocked'); downloads.push({ blob, filename }); },
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
  return { context, state, slots, node, calls, toasts, downloads, flushes: () => flushes };
}
function addTask(h, extras = {}) {
  const item = { id: 'one', title: 'Review one', journal: 'JEEM', round: 1, status: '审稿中', recommendation: '尚未决定', dueAt: '', ...extras };
  h.state.peerReviews.items.push(item); h.state.peerReviewId = item.id; h.context.renderPeerReviews(); return item;
}

test('author export has a strict allowlist and excludes recommendation, confidential comments, notes and private links', () => {
  const h = harness();
  const task = Object.freeze({ title: 'Synthetic paper', journal: 'Synthetic journal', manuscriptCode: 'CODE-1', round: 2, summary: 'Overall text', majorComments: 'Major text\n\nSecond paragraph\n\n', minorComments: 'Minor text', recommendation: '拒稿', editorComments: 'EDITOR_SECRET', notes: 'PERSONAL_SECRET', manuscriptUrl: 'https://private.invalid/token', dueAt: '2040-01-01', unknownSecret: 'UNKNOWN_SECRET' });
  const output = h.context.buildPeerReviewExport(task, 'author');
  for (const value of ['Overall text', 'Major text\n\nSecond paragraph\n\n', 'Minor text', 'CODE-1', '第 2 轮']) assert.ok(output.text.includes(value));
  for (const value of ['拒稿', 'EDITOR_SECRET', 'PERSONAL_SECRET', 'private.invalid', '2040-01-01', 'UNKNOWN_SECRET']) assert.ok(!output.text.includes(value), value);
  assert.ok(output.filename.endsWith('-作者版.md')); assert.equal(task.majorComments, 'Major text\n\nSecond paragraph\n\n');
});

test('editor export includes only decision and confidential comments, never author comments or personal notes', () => {
  const h = harness(); const output = h.context.buildPeerReviewExport({ title: 'Paper', summary: 'AUTHOR_SUMMARY', majorComments: 'AUTHOR_MAJOR', minorComments: 'AUTHOR_MINOR', recommendation: '小修', editorComments: 'EDITOR_ONLY', notes: 'PERSONAL_ONLY' }, 'editor');
  for (const value of ['仅供编辑（保密）', '小修', 'EDITOR_ONLY']) assert.ok(output.text.includes(value));
  for (const value of ['AUTHOR_SUMMARY', 'AUTHOR_MAJOR', 'AUTHOR_MINOR', 'PERSONAL_ONLY']) assert.ok(!output.text.includes(value));
  assert.ok(output.filename.endsWith('-编辑保密版.md'));
});

test('export filenames are safe on Windows and header fields cannot inject additional lines', () => {
  const h = harness(); const output = h.context.buildPeerReviewExport({ title: 'CON:<bad>/\\*?"|\n# Injected\t标题', journal: 'Journal\n## Not a section', manuscriptCode: 'Code\r\nOther', round: 99, summary: '中文意见' }, 'author');
  assert.ok(!/[<>:"/\\|?*\x00-\x1f]/.test(output.filename)); assert.ok(output.filename.startsWith('审稿-'));
  assert.ok(output.filename.includes('第1轮')); assert.ok(!output.text.includes('\n## Not a section')); assert.ok(output.text.includes('中文意见'));
  assert.throws(() => h.context.buildPeerReviewExport({}, 'other'), /未知/);
  assert.ok(h.context.buildPeerReviewExport({ title: 'a'.repeat(200), summary: 'x' }, 'author').filename.length < 110);
});

test('export reads the latest unsaved form without network calls, cloud saves or changing task status', async () => {
  const h = harness(); const task = addTask(h, { summary: 'Old cloud value', editorComments: 'EDITOR_SECRET', notes: 'PERSONAL_SECRET' });
  h.node('peerReviewSummary').value = '最新意见\n\n保留正文空行\n\n';
  assert.equal(h.context.exportPeerReview('author'), true);
  assert.equal(h.downloads.length, 1); assert.equal(h.downloads[0].blob.type, 'text/markdown;charset=utf-8');
  const text = await h.downloads[0].blob.text(); assert.ok(text.includes('最新意见\n\n保留正文空行\n\n'));
  for (const value of ['Old cloud value', 'EDITOR_SECRET', 'PERSONAL_SECRET']) assert.ok(!text.includes(value));
  assert.equal(h.calls.length, 0); assert.equal(h.flushes(), 0); assert.equal(Object.keys(h.slots).length, 0); assert.equal(task.status, '审稿中');
});

test('empty author/editor exports do not download; a chosen decision is sufficient for editor export', () => {
  const h = harness(); addTask(h, { summary: '   ', editorComments: '\n' });
  assert.equal(h.context.exportPeerReview('author'), false); assert.equal(h.context.exportPeerReview('editor'), false); assert.equal(h.downloads.length, 0);
  h.node('peerReviewRecommendation').value = '大修'; assert.equal(h.context.exportPeerReview('editor'), true); assert.equal(h.downloads.length, 1);
});

test('export buttons and handlers respect empty selection, trash, loading and busy states', () => {
  const h = harness(); h.context.bindPeerReviewEvents(); h.context.renderPeerReviews();
  for (const id of ['peerReviewExportAuthor', 'peerReviewExportEditor']) { assert.ok(html.includes('id="' + id + '"')); assert.equal(h.node(id).disabled, true); assert.ok(h.node(id).handlers.click); }
  assert.equal(h.context.exportPeerReview('author'), false);
  addTask(h, { summary: 'Author text', editorComments: 'Editor text' });
  h.node('peerReviewExportAuthor').handlers.click(); h.node('peerReviewExportEditor').handlers.click(); assert.equal(h.downloads.length, 2);
  for (const flag of ['peerReviewTrashOpen', 'peerReviewLoading', 'peerReviewBusy']) {
    h.state[flag] = true; h.context.renderPeerReviews();
    for (const id of ['peerReviewExportAuthor', 'peerReviewExportEditor']) assert.equal(h.node(id).disabled, true);
    assert.equal(h.context.exportPeerReview('author'), false); h.state[flag] = false;
  }
  assert.equal(h.context.exportPeerReview('other'), false); assert.equal(h.downloads.length, 2);
});

test('failed local downloads show failure and never claim success', () => {
  const h = harness({ downloadFails: true }); addTask(h, { summary: 'Test opinion' });
  assert.equal(h.context.exportPeerReview('author'), false); assert.equal(h.downloads.length, 0);
  assert.ok(h.toasts.some(text => text.includes('导出失败'))); assert.ok(h.toasts.every(text => !text.includes('已生成')));
});

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
