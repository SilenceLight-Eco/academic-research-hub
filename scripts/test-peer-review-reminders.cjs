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
const helpers = fs.readFileSync(path.join(__dirname, 'test-peer-review-ui.cjs'), 'utf8');
const factory = vm.createContext({ source, html, css, start, end, vm, Date, console, Blob, structuredClone });
vm.runInContext(helpers.slice(helpers.indexOf('function harness('), helpers.indexOf('function addTask(')), factory);
function harness(options = {}) {
  const h = factory.harness(options); h.state.panel = 'dashboard'; h.state.todos = []; h.state.peerReviews.folders = [];
  const navigation = []; let authOpens = 0;
  h.context.switchPanel = panel => { navigation.push(panel); h.state.panel = panel; };
  h.context.openAuth = () => authOpens++;
  h.context.todayStr = () => '2026-10-07'; h.context.todayWeek = () => '星期三';
  h.context.submissionDeadlineReminders = () => []; h.context.submissionReminderHtml = () => '';
  const boardStart = source.indexOf('  function renderTodayBoard()');
  const boardEnd = source.indexOf('    return;', boardStart);
  vm.runInContext(source.slice(boardStart, boardEnd) + '\n  }', h.context);
  return Object.assign(h, { navigation, authOpens: () => authOpens });
}
const task = (id, dueAt, status = '审稿中', extra = {}) => ({ id, title: 'Review ' + id, journal: 'Test Journal', dueAt, status, round: 2, ...extra });

test('reminders include overdue/today/next seven days, excluding later, invalid, submitted, declined and trashed tasks', () => {
  const h = harness(); h.state.peerReviews.items = [task('7days', '2026-10-14'), task('overdue', '2026-10-01'), task('today', '2026-10-07'), task('later', '2026-10-15'), task('invalid', '2026-02-30'), task('done', '2026-10-01', '已提交'), task('declined', '2026-10-01', '已拒绝')];
  h.state.peerReviews.trash = [{ item: task('trashed', '2026-10-01') }];
  const reminders = h.context.peerReviewDeadlineReminders(new Date('2026-10-07T23:59:59+08:00'));
  assert.deepEqual(Array.from(reminders, entry => entry.item.id), ['overdue', 'today', '7days']); assert.equal(reminders[1].deadline.label, '今天截止');
  assert.equal(h.state.peerReviews.items[0].id, '7days');
});

test('overview preserves normal todos, caps visible review reminders at six and excludes confidential content', () => {
  const h = harness(); h.state.todos = [{ text: 'Normal task', done: false }, { text: 'Finished task', done: true }];
  h.state.peerReviews.items = Array.from({ length: 8 }, (_, i) => task(String(i), '2000-01-01', '审稿中', { title: '<unsafe title>', editorComments: 'EDITOR_SECRET', notes: 'PERSONAL_SECRET' })); h.context.peerReviewReminderStatus = 'ready'; h.context.renderTodayBoard();
  const markup = h.node('todayBoard').innerHTML; assert.ok(markup.includes('Normal task')); assert.ok(!markup.includes('Finished task')); assert.ok(markup.includes('待办 1 项 · 审稿提醒 8 项'));
  assert.equal((markup.match(/data-review-reminder-open=/g) || []).length, 6); assert.ok(markup.includes('另有 2 项提醒')); assert.ok(markup.includes('&lt;unsafe title>')); assert.ok(!markup.includes('EDITOR_SECRET')); assert.ok(!markup.includes('PERSONAL_SECRET'));
  assert.equal(h.calls.length, 0); assert.equal(h.state.todos.length, 2);
});

test('reminder loading is read-only, does not overwrite the selected editor or dirty drafts, and updates the overview', async () => {
  const h = harness({ api: async () => ({ ok: true, peerReviews: { items: [task('one', '2000-01-01', '审稿中', { title: 'Old server title' })], trash: [] } }) });
  h.state.peerReviewId = 'one'; h.node('peerReviewTitle').value = 'Editor untouched'; h.slots['peer-review:one'] = { dirty: true, payload: { id: 'one', round: 2, title: 'New local draft' } };
  await h.context.loadPeerReviewReminders(); assert.equal(h.state.peerReviews.items[0].title, 'New local draft'); assert.equal(h.node('peerReviewTitle').value, 'Editor untouched'); assert.equal(h.context.peerReviewReminderStatus, 'ready');
  assert.equal(h.calls[0].body, undefined); assert.ok(h.node('todayBoard').innerHTML.includes('New local draft'));
});

test('later saves invalidate in-flight reminder reads and failed reads show retry instead of falsely claiming no tasks', async () => {
  let complete; const h = harness({ api: () => new Promise(resolve => { complete = resolve; }) });
  const loading = h.context.loadPeerReviewReminders(); assert.ok(h.node('todayBoard').innerHTML.includes('正在载入'));
  h.context.applyPeerReviewData({ items: [task('new', '2000-01-01')], trash: [] }); complete({ ok: true, peerReviews: { items: [task('stale', '2000-01-01')], trash: [] } }); await loading;
  assert.equal(h.state.peerReviews.items[0].id, 'new');
  const failed = harness({ api: async () => ({ ok: false, error: 'Network failure' }) }); await failed.context.loadPeerReviewReminders(); const markup = failed.node('todayBoard').innerHTML;
  assert.ok(markup.includes('data-review-reminder-retry')); assert.ok(!markup.includes('没有未来 7 天')); assert.equal(failed.toasts.length, 0);
});

test('signed-out overview does not fetch or reveal cached review titles, and signed-out/missing-task clicks cannot navigate', async () => {
  const h = harness(); h.context.account = null; h.state.peerReviews.items = [task('one', '2000-01-01', '审稿中', { title: 'CONFIDENTIAL_OLD_ACCOUNT' })];
  await h.context.loadPeerReviewReminders(); assert.equal(h.calls.length, 0); assert.ok(!h.node('todayBoard').innerHTML.includes('CONFIDENTIAL_OLD_ACCOUNT')); assert.ok(h.node('todayBoard').innerHTML.includes('登录后查看'));
  assert.equal(await h.context.openPeerReviewReminder('one'), false); assert.equal(h.authOpens(), 1); assert.equal(h.navigation.length, 0);
  h.context.account = { id: 'test-user' }; assert.equal(await h.context.openPeerReviewReminder('missing'), false); assert.equal(h.navigation.length, 0);
});

test('clicking a reminder flushes the current editor, resets task filters and opens the right record/folder', async () => {
  const h = harness(); h.state.peerReviews.items = [task('one', '2000-01-01', '审稿中', { folderId: 'f1' })]; h.state.peerReviewTrashOpen = true; h.state.peerReviewFilter = '已提交'; h.state.peerReviewFolderFilter = 'other'; h.state.peerReviewQuery = 'old';
  await h.context.openPeerReviewReminder('one'); assert.equal(h.flushes(), 1); assert.deepEqual(h.navigation, ['peer-reviews']); assert.equal(h.state.peerReviewId, 'one'); assert.equal(h.state.peerReviewTrashOpen, false); assert.equal(h.state.peerReviewFilter, 'all'); assert.equal(h.state.peerReviewFolderFilter, 'all'); assert.equal(h.state.peerReviewFolderCollapsed.f1, false);
  const blocked = harness({ flushFails: true }); blocked.state.peerReviews.items = [task('one', '2000-01-01')]; await blocked.context.openPeerReviewReminder('one'); assert.equal(blocked.navigation.length, 0); assert.equal(blocked.state.peerReviewId, null);
});

test('account logout cancels late reminder responses and removes cached tasks and folder form contents', async () => {
  let complete; const h = harness({ api: () => new Promise(resolve => { complete = resolve; }) });
  h.state.peerReviews.items = [task('one', '2000-01-01')]; h.node('peerReviewFolderName').value = 'Private group'; h.node('peerReviewFolderForm').hidden = false;
  const loading = h.context.loadPeerReviewReminders();
  Object.assign(h.context, { autoSaveDraftAccountKey: () => h.context.account ? h.context.account.id : 'guest', autoSaveDraftRestoreAccount: '', setGlobalSaveState() {}, navigator: { onLine: true }, syncTimer: null, setInterval: () => 1, clearInterval() {}, hasUnsavedChanges: () => false });
  vm.runInContext(source.slice(source.indexOf('  function setAccount(user)'), source.indexOf('  function checkAccount()')), h.context);
  h.context.setAccount(null); complete({ ok: true, peerReviews: { items: [task('leaked', '2000-01-01')], trash: [] } }); await loading;
  assert.equal(h.state.peerReviews.items.length, 0); assert.equal(h.node('peerReviewFolderName').value, ''); assert.equal(h.node('peerReviewFolderForm').hidden, true); assert.ok(!h.node('todayBoard').innerHTML.includes('Review leaked'));
});

test('dashboard load/entry/foreground and shared save hooks are connected without adding polling or writes', () => {
  assert.ok(source.includes('loadJournal(), loadPeerReviewReminders()')); assert.ok(source.includes("if (panel === 'dashboard' && prev !== panel) { renderTodayBoard(); loadPeerReviewReminders(); }"));
  assert.ok(source.includes("if (!document.hidden && state.panel === 'dashboard') renderTodayBoard();")); assert.ok(source.includes('if (handlePeerReviewReminderClick(e)) return;')); assert.ok(css.includes('.today-grid-reminders'));
});

test('late saves from a previous account cannot repopulate the current account review catalog or reminders', async () => {
  let complete; const h = harness({ api: () => new Promise(resolve => { complete = resolve; }) });
  const saving = h.context.persistPeerReview({ action: 'save', id: 'old', round: 1 });
  h.context.account = { id: 'different-user' }; h.state.peerReviews = { items: [], trash: [] };
  complete({ ok: true, peerReviews: { items: [task('old', '2000-01-01')], trash: [] } });
  await assert.rejects(saving, /账号已变化/); assert.equal(h.state.peerReviews.items.length, 0);
});
