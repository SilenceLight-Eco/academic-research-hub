const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const deadlines = require('../web/submission-deadlines.js');
const app = fs.readFileSync(path.join(__dirname, '../web/app.js'), 'utf8');
const now = new Date('2026-10-07T18:00:00+08:00');
const paper = (title, revisionDueAt, status = 'major_revision') => ({ title, revisionDueAt, status, currentJournal: 'Journal B', submissionDate: '2026-10-01', history: [] });
function harness() {
  const stored = new Map(), nodes = new Map(), opened = [], toasts = [];
  let flushes = 0;
  const node = key => { if (!nodes.has(key)) nodes.set(key, { innerHTML: '' }); return nodes.get(key); };
  const context = vm.createContext({ account: { id: 'test-user' }, state: { panel: 'dashboard', todos: [] }, SubmissionDeadlines: deadlines,
    localStorage: { getItem: key => stored.get(key) || null }, $: key => node(key),
    escapeHtml: value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'),
    escapeAttribute: value => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;'),
    toast: text => toasts.push(text), afterCurrentEditorSaved: (_panel, fn) => { flushes++; return Promise.resolve(fn()); },
    openPipelinePaper: (kind, key) => opened.push({ kind, key }),
    todayStr: () => '2026-10-07', todayWeek: () => '星期三', peerReviewDeadlineReminders: () => [], peerReviewReminderHtml: () => '<div>审稿截止提醒</div>'
  });
  const targetsStart = app.indexOf('  function projectPaperTargets()');
  vm.runInContext(app.slice(targetsStart, app.indexOf('  function projectLinkTargets(', targetsStart)), context);
  const helperStart = app.indexOf('  // ===== 在投论文返修提醒');
  vm.runInContext(app.slice(helperStart, app.indexOf('  // ===== 我的审稿任务', helperStart)), context);
  const boardStart = app.indexOf('  function renderTodayBoard()');
  vm.runInContext(app.slice(boardStart, app.indexOf('    return;', boardStart)) + '\n}', context);
  function seed(submitted, fields = {}, others = {}) {
    stored.set('research-hub-cards-v1', JSON.stringify({ submitted: { added: submitted }, ...others }));
    stored.set('research-hub-fields-v1', JSON.stringify(fields));
  }
  const click = key => context.handleSubmissionReminderClick({ target: { closest: () => ({ dataset: { submissionReminderOpen: key } }) } });
  return { context, seed, opened, toasts, click, node, flushes: () => flushes };
}

test('deadlines use Beijing calendar dates, including midnight and leap-day boundaries', () => {
  assert.equal(deadlines.evaluate('major_revision', '2026-10-07', '2026-10-07T15:59:59Z').days, 0);
  assert.equal(deadlines.evaluate('major_revision', '2026-10-07', '2026-10-07T16:00:00Z').days, -1);
  assert.equal(deadlines.evaluate('minor_revision', '2028-03-01', '2028-02-28T20:00:00+08:00').days, 2);
  assert.equal(deadlines.evaluate('major_revision', '2026-10-14', now).kind, 'soon');
  assert.equal(deadlines.evaluate('major_revision', '2026-10-15', now).kind, 'later');
  assert.equal(deadlines.evaluate('major_revision', '2026-10-07', now).label, '今天截止');
});

test('invalid dates and nonrevision states never create reminders', () => {
  for (const date of ['', '2026-02-30', '0000-01-01', '07/10/2026']) assert.equal(deadlines.evaluate('major_revision', date, now), null);
  for (const status of ['accepted', 'rejected', 'resubmitted', 'withdrawn', 'under_review']) assert.equal(deadlines.evaluate(status, '2026-10-01', now), null);
  assert.equal(deadlines.evaluate('minor_revision', '2026-10-07', 'bad date'), null);
});

test('overview merges field overrides, orders overdue first and ignores other modules or closed papers', () => {
  const h = harness(); h.seed({
    late: paper('Late', '2026-10-01'), today: paper('Today', '2026-10-07'), soon: paper('Soon', '2026-10-14'), later: paper('Later', '2026-10-15'),
    closed: paper('Closed', '2026-10-01'), updated: paper('Updated', '2026-10-15', 'under_review'), missing: paper('Missing', '')
  }, { closed: { status: 'accepted' }, updated: { status: 'minor_revision', revisionDueAt: '2026-10-10' } }, { published: { added: { pub: paper('Published', '2026-10-01') } } });
  assert.deepEqual(Array.from(h.context.submissionDeadlineReminders(now), entry => entry.id), ['late', 'today', 'updated', 'soon']);
});

test('blank current deadline does not revive an archived one; matching history is recoverable', () => {
  const last = { journal: 'Journal B', date: '2026-10-01', revisionDueAt: '2026-10-07' };
  assert.equal(deadlines.dueAtForPaper({ ...paper('New', ''), history: [last] }), '');
  const legacy = { ...paper('Legacy'), history: [last] };
  assert.equal(deadlines.dueAtForPaper(legacy), '2026-10-07');
  assert.equal(deadlines.dueAtForPaper({ ...legacy, currentJournal: 'Another Journal' }), '');
  assert.equal(deadlines.dueAtForPaper({ ...legacy, submissionDate: '2026-10-02' }), '');
});

test('overview retains todos and review reminders, limits cards and escapes manuscript content', () => {
  const h = harness(); h.seed(Object.fromEntries(Array.from({ length: 8 }, (_, i) => [String(i), paper('<Title>', '2000-01-01')])));
  h.context.state.todos = [{ text: 'Keep todo', done: false }]; h.context.renderTodayBoard();
  const html = h.node('#todayBoard').innerHTML;
  assert.match(html, /Keep todo/); assert.match(html, /审稿截止提醒/); assert.match(html, /返修提醒 8 项/);
  assert.equal((html.match(/data-submission-reminder-open=/g) || []).length, 6);
  assert.match(html, /另有 2 项提醒/); assert.match(html, /&lt;Title>/); assert.doesNotMatch(html, /<Title>/);
});

test('signed-out overview does not display cached manuscript names', () => {
  const h = harness(); h.seed({ private: paper('PRIVATE_TITLE', '2000-01-01') }); h.context.account = null;
  h.context.renderTodayBoard();
  assert.equal(h.context.submissionDeadlineReminders(now).length, 0);
  assert.doesNotMatch(h.node('#todayBoard').innerHTML, /PRIVATE_TITLE/);
});

test('click opens the exact submitted paper after autosaving; removed papers cannot be opened', () => {
  const h = harness(); h.seed({ target: paper('Target', '2026-10-10') });
  assert.equal(h.click('target'), true); assert.equal(h.flushes(), 1);
  assert.deepEqual(h.opened, [{ kind: 'submitted', key: 'target' }]);
  h.click('deleted'); assert.equal(h.opened.length, 1); assert.equal(h.toasts.length, 1);
});

test('shared helper loads before both consumers; overview refresh is event driven, not extra polling', () => {
  for (const file of ['workbench.html', 'paper-pipeline-v2.html']) {
    const html = fs.readFileSync(path.join(__dirname, '../web', file), 'utf8');
    assert.match(html, /submission-deadlines\.js\?v=20261007-12/);
    assert.ok(html.indexOf('submission-deadlines.js') < (file === 'workbench.html' ? html.indexOf('app.js?v=') : html.indexOf('<script>')));
  }
  const helpers = app.slice(app.indexOf('  // ===== 在投论文返修提醒'), app.indexOf('  // ===== 我的审稿任务'));
  assert.doesNotMatch(helpers, /setInterval|fetch\(|api\(/);
  assert.match(app, /event\.data\.type === 'academic-research-hub-submissions-changed' && event\.source === \$\('\.research-hub-frame'\)\.contentWindow/);
  assert.match(app, /if \(handleSubmissionReminderClick\(e\)\) return;/);
});
