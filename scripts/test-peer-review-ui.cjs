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
    toast: message => toasts.push(message), confirm: () => options.confirm !== false,
    api: async (endpoint, init) => { calls.push({ endpoint, body: init ? JSON.parse(init.body) : undefined }); return options.api ? options.api(endpoint, init) : { ok: true, peerReviews: structuredClone(state.peerReviews) }; },
    afterCurrentEditorSaved: async (panel, callback) => { flushes++; if (options.flushFails) return; try { const slot = slots['peer-review:' + state.peerReviewId]; if (slot && slot.dirty) { await slot.persist(slot.payload); slot.dirty = false; } return await callback(); } catch (e) { toasts.push(e.message); } },
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

test('history is rendered as escaped read-only collapsed details with export actions, and hidden in trash', () => {
  const h = harness(); addTask(h, { history: [{ id: 'r1', round: 1, status: '已提交', archivedAt: '2026-10-07', summary: '<script>alert(1)</script>\n\nTail', notes: 'Private notes' }] });
  const markup = h.node('peerReviewHistory').innerHTML;
  assert.ok(markup.includes('<details ')); assert.ok(!/<details[^>]*\bopen\b/.test(markup)); assert.ok(markup.includes('&lt;script>')); assert.ok(!markup.includes('<script>'));
  assert.ok(markup.includes('data-review-history-author="r1"')); assert.ok(markup.includes('Private notes')); assert.ok(!/<textarea|<input/.test(markup));
  assert.ok(css.includes('white-space:pre-wrap')); assert.ok(html.includes('value="1" readonly'));
  h.state.peerReviewTrashOpen = true; h.context.renderPeerReviews(); assert.equal(h.node('peerReviewHistorySection').hidden, true); assert.equal(h.node('peerReviewNextRound').disabled, true);
});

test('history exports use the immutable historical round rather than the current editor and retain privacy allowlists', async () => {
  const h = harness(); addTask(h, { round: 2, summary: 'Current second round', history: [{ id: 'r1', title: 'Old title', round: 1, summary: 'Old author opinion', recommendation: '大修', editorComments: 'OLD_EDITOR_SECRET', notes: 'OLD_PERSONAL_SECRET' }] });
  assert.equal(h.context.exportPeerReviewHistory('r1', 'author'), true);
  const author = await h.downloads[0].blob.text(); assert.ok(author.includes('Old author opinion')); assert.ok(!author.includes('Current second round')); assert.ok(!author.includes('OLD_EDITOR_SECRET')); assert.ok(!author.includes('OLD_PERSONAL_SECRET')); assert.ok(h.downloads[0].filename.includes('第1轮-作者版'));
  assert.equal(h.context.exportPeerReviewHistory('r1', 'editor'), true); const editor = await h.downloads[1].blob.text(); assert.ok(editor.includes('OLD_EDITOR_SECRET')); assert.ok(!editor.includes('OLD_PERSONAL_SECRET')); assert.ok(!editor.includes('Old author opinion'));
  assert.equal(h.context.exportPeerReviewHistory('missing', 'author'), false); assert.equal(h.downloads.length, 2);
  h.state.peerReviewTrashOpen = true; assert.equal(h.context.exportPeerReviewHistory('r1', 'author'), false);
});

test('starting next round saves the latest form before archiving, preserves a single task and clears the editor only after success', async () => {
  const actions = []; let saved;
  const h = harness({ api: async (endpoint, init) => {
    const body = JSON.parse(init.body); actions.push(body.action);
    if (body.action === 'save') { saved = { ...body }; return { ok: true, peerReviews: { items: [{ ...body, history: [] }], trash: [] } }; }
    assert.equal(body.expectedRound, 1); assert.equal(body.id, 'one'); assert.equal(saved.summary, 'Latest unsaved opinion');
    return { ok: true, peerReviews: { items: [{ ...saved, round: 2, summary: '', notes: '', recommendation: '尚未决定', history: [{ ...saved, id: 'r1' }] }], trash: [] } };
  } });
  addTask(h, { summary: 'Older version' }); h.node('peerReviewSummary').value = 'Latest unsaved opinion';
  assert.equal(await h.context.startNextPeerReviewRound(), true); assert.deepEqual(actions, ['save', 'next-round']);
  assert.equal(h.state.peerReviews.items.length, 1); assert.equal(h.state.peerReviews.items[0].round, 2); assert.equal(h.node('peerReviewSummary').value, ''); assert.equal(h.state.peerReviews.items[0].history[0].summary, 'Latest unsaved opinion'); assert.equal(h.state.peerReviewBusy, false);
});

test('failed save or failed archive never clears the current opinions or shows next-round success', async () => {
  for (const failAction of ['save', 'next-round']) {
    const h = harness({ api: async (endpoint, init) => {
      const body = JSON.parse(init.body); return body.action === failAction ? { ok: false, error: 'Simulated failure' } : { ok: true, peerReviews: { items: [{ ...body, history: [] }], trash: [] } };
    } });
    addTask(h); h.node('peerReviewSummary').value = 'Do not lose';
    assert.equal(await h.context.startNextPeerReviewRound(), false); assert.equal(h.node('peerReviewSummary').value, 'Do not lose'); assert.equal(Number(h.state.peerReviews.items[0].round), 1); assert.equal(h.state.peerReviewBusy, false);
    assert.ok(h.toasts.every(text => !text.includes('已开始')));
    if (failAction === 'save') assert.ok(h.calls.every(call => call.body.action !== 'next-round'));
  }
});

test('next-round controls reject cancellation, unavailable tasks, round limits and loading without writes', async () => {
  const cancelled = harness({ confirm: false }); addTask(cancelled, { summary: 'Keep' }); assert.equal(await cancelled.context.startNextPeerReviewRound(), false); assert.equal(cancelled.calls.length, 0);
  for (const flag of ['peerReviewBusy', 'peerReviewLoading', 'peerReviewTrashOpen']) { const h = harness(); addTask(h); h.state[flag] = true; assert.equal(await h.context.startNextPeerReviewRound(), false); assert.equal(h.calls.length, 0); }
  const max = harness(); addTask(max, { round: 20 }); assert.equal(max.node('peerReviewNextRound').disabled, true); assert.equal(await max.context.startNextPeerReviewRound(), false); assert.equal(max.calls.length, 0);
  const empty = harness(); assert.equal(await empty.context.startNextPeerReviewRound(), false);
  const blocked = harness({ flushFails: true }); addTask(blocked); assert.equal(await blocked.context.startNextPeerReviewRound(), false); assert.equal(blocked.state.peerReviewBusy, false); assert.equal(blocked.calls.length, 0);
});

test('dirty old-round drafts cannot overwrite an incoming new round, but same-round drafts still win', () => {
  const h = harness(); addTask(h); h.slots['peer-review:one'] = { dirty: true, payload: { id: 'one', round: 1, summary: 'Old local draft' } };
  h.context.applyPeerReviewData({ items: [{ id: 'one', round: 2, summary: 'New round server', history: [{ id: 'r1', summary: 'Archived' }] }], trash: [] });
  assert.equal(h.state.peerReviews.items[0].summary, 'New round server'); assert.equal(h.state.peerReviews.items[0].round, 2);
  h.slots['peer-review:one'].payload = { id: 'one', round: 2, summary: 'New local draft' };
  h.context.applyPeerReviewData({ items: [{ id: 'one', round: 2, summary: 'Older server value' }], trash: [] }); assert.equal(h.state.peerReviews.items[0].summary, 'New local draft');
});

test('checklist add is inline, queues autosave and uses immutable draft copies', () => {
  const h = harness(); addTask(h); assert.equal(h.context.addPeerReviewCheck(), true);
  const row = h.state.peerReviews.items[0].checklist[0]; assert.ok(row.id); assert.equal(row.status, '待核对'); assert.equal(h.slots['peer-review:one'].payload.checklist.length, 1);
  assert.ok(h.node('peerReviewChecklist').innerHTML.includes('<textarea')); assert.ok(h.node('peerReviewChecklistProgress').textContent.includes('待核对 1'));
  row.issue = 'Changed after draft'; assert.equal(h.slots['peer-review:one'].payload.checklist[0].issue, '');
  assert.ok(h.context.addPeerReviewCheck()); assert.equal(h.state.peerReviews.items[0].checklist.length, 2);
});

test('checklist split only recognizes explicit numbering/bullets and preserves continuation paragraphs', () => {
  const h = harness();
  assert.deepEqual(Array.from(h.context.splitPeerReviewIssues('1. First\nContinuation\n\n2、Second\n- Third')), ['1. First\nContinuation', '2、Second', '- Third']);
  assert.deepEqual(Array.from(h.context.splitPeerReviewIssues('Plain paragraph\n\n**Bold heading**\nMore text')), ['Plain paragraph\n\n**Bold heading**\nMore text']);
  assert.deepEqual(Array.from(h.context.splitPeerReviewIssues('')), []);
});

test('previous-round imports exclude private fields, are idempotent even after editing, and capture source round', () => {
  const h = harness(); addTask(h, { round: 2, history: [{ id: 'r1', round: 1, majorComments: '1. First\n2. Second', minorComments: 'Small issue', editorComments: 'SECRET_EDITOR', notes: 'SECRET_NOTES' }] });
  assert.equal(h.context.importPreviousPeerReviewChecks(), true); const rows = h.state.peerReviews.items[0].checklist;
  assert.equal(rows.length, 3); assert.equal(rows[0].sourceHistoryId, 'r1'); assert.equal(rows[0].sourceRound, 1); assert.equal(rows[2].kind, '次要意见'); assert.ok(rows.every(row => row.status === '待核对'));
  assert.ok(!JSON.stringify(rows).includes('SECRET_')); rows[0].issue = 'My edited problem';
  assert.equal(h.context.importPreviousPeerReviewChecks(), false); assert.equal(rows.length, 3); assert.equal(h.slots['peer-review:one'].dirty, true);
});

test('delegated checklist editing saves response/status without rerendering the text editor and deletion removes only one row', () => {
  const h = harness(); addTask(h); h.context.bindPeerReviewEvents(); h.context.addPeerReviewCheck(); h.context.addPeerReviewCheck();
  const rows = h.state.peerReviews.items[0].checklist; const id = rows[0].id; const originalMarkup = h.node('peerReviewChecklist').innerHTML;
  function edit(field, value) { const input = { dataset: { reviewCheckField: field }, value }; const container = { dataset: { reviewCheckId: id } }; h.node('peerReviewChecklist').handlers.input({ target: { closest: selector => selector === '[data-review-check-field]' ? input : container } }); }
  edit('response', 'Author reply\n\nMore'); edit('status', '部分解决'); edit('assessment', 'Internal judgment');
  assert.equal(rows[0].response, 'Author reply\n\nMore'); assert.equal(h.slots['peer-review:one'].payload.checklist[0].assessment, 'Internal judgment'); assert.equal(h.node('peerReviewChecklist').innerHTML, originalMarkup); assert.ok(h.node('peerReviewChecklistProgress').textContent.includes('部分解决 1'));
  h.node('peerReviewChecklist').handlers.click({ target: { closest: () => ({ dataset: { reviewCheckDelete: id } }) } });
  assert.deepEqual(Array.from(h.state.peerReviews.items[0].checklist, row => row.id), [rows[1].id]); assert.equal(h.slots['peer-review:one'].payload.checklist.length, 1);
});

test('dirty checklist drafts win within the same round, but never overlay a different round', () => {
  const h = harness(); addTask(h); h.context.addPeerReviewCheck(); const draft = h.slots['peer-review:one'].payload.checklist;
  h.context.applyPeerReviewData({ items: [{ id: 'one', round: 1, checklist: [] }], trash: [] }); assert.equal(h.state.peerReviews.items[0].checklist[0].id, draft[0].id);
  h.context.applyPeerReviewData({ items: [{ id: 'one', round: 2, checklist: [] }], trash: [] }); assert.equal(h.state.peerReviews.items[0].checklist.length, 0);
});

test('checklist markup is escaped; frozen checklist history is read-only and never included in opinion exports', () => {
  const h = harness(); const row = { id: 'safe', kind: '主要意见', status: '未解决', issue: '</textarea><script>', response: 'Response', assessment: 'PRIVATE_CHECKLIST_JUDGMENT' };
  addTask(h, { checklist: [row], history: [{ id: 'r1', round: 1, summary: 'Author text', checklist: [row] }] });
  assert.ok(h.node('peerReviewChecklist').innerHTML.includes('&lt;/textarea>')); assert.ok(!h.node('peerReviewChecklist').innerHTML.includes('<script>'));
  const history = h.node('peerReviewHistory').innerHTML; assert.ok(history.includes('PRIVATE_CHECKLIST_JUDGMENT')); assert.ok(!/<textarea|<input/.test(history));
  for (const audience of ['author', 'editor']) assert.ok(!h.context.buildPeerReviewExport(h.state.peerReviews.items[0].history[0], audience).text.includes('PRIVATE_CHECKLIST_JUDGMENT'));
});

test('checklist controls respect loading, busy, trash, absent history and limits; oversized imports are not partly applied', () => {
  const h = harness(); addTask(h); assert.equal(h.node('peerReviewChecklistImport').disabled, true); assert.equal(h.context.importPreviousPeerReviewChecks(), false);
  for (const flag of ['peerReviewLoading', 'peerReviewBusy', 'peerReviewTrashOpen']) { h.state[flag] = true; assert.equal(h.context.addPeerReviewCheck(), false); assert.equal(h.context.importPreviousPeerReviewChecks(), false); h.state[flag] = false; }
  h.state.peerReviews.items[0].history = [{ id: 'r1', round: 1, majorComments: 'a'.repeat(10001) }]; assert.equal(h.context.importPreviousPeerReviewChecks(), false); assert.equal(h.state.peerReviews.items[0].checklist.length, 0);
  h.state.peerReviews.items[0].checklist = Array.from({ length: 100 }, (_, i) => ({ id: String(i), status: '待核对' })); h.context.renderPeerReviewChecklist(); assert.equal(h.node('peerReviewChecklistAdd').disabled, true); assert.equal(h.context.addPeerReviewCheck(), false);
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
