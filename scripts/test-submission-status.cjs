const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../web/paper-pipeline-v2.html'), 'utf8');
const source = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function harness(stored = new Map()) {
  const nodes = {};
  function node(id) {
    if (!nodes[id]) nodes[id] = {
      value: '', textContent: '', markup: '', handlers: {},
      get innerHTML() { return this.markup; },
      set innerHTML(value) {
        this.markup = value;
        if (id === 'page-content') {
          for (const key of ['searchInput', 'statusFilter']) {
            node(key).value = ''; node(key).handlers = {};
          }
        }
      },
      addEventListener(type, handler) { this.handlers[type] = handler; },
      dispatchEvent(event) { this.handlers[event.type]?.(event); }
    };
    return nodes[id];
  }
  const context = vm.createContext({
    localStorage: { getItem: key => stored.get(key) || null, setItem: (key, value) => stored.set(key, value) },
    document: {
      addEventListener() {}, querySelectorAll: () => [],
      getElementById: id => id === 'priorityFilter' ? null : node(id)
    },
    window: {}, Event: class { constructor(type) { this.type = type; } },
    console, Date, alert() {}, confirm: () => true
  });
  vm.runInContext(source, context);
  vm.runInContext('DATA = Object.assign({}, DATA_EMBEDDED); currentPage = "submitted"; syncLists();', context);
  const run = code => vm.runInContext(code, context);
  function seed(fields = {}) {
    const paper = { _key: 'paper1', title: 'Test paper', status: 'under_review', currentJournal: 'Journal B', submissionDate: '2026-10-01', history: [], ...fields };
    stored.set('research-hub-cards-v1', JSON.stringify({ submitted: { added: { paper1: paper }, order: ['paper1'] } }));
    run('syncLists(); render();');
    return paper;
  }
  return { context, stored, run, seed, node, field: name => run(`getPaperField(DATA.submitted[0], ${JSON.stringify(name)})`) };
}

test('entire pipeline script parses; current status is editable and filter includes rejection/resubmission', () => {
  const h = harness(); h.seed();
  const page = h.node('page-content').innerHTML;
  assert.match(page, /aria-label="当前投稿状态"/);
  assert.match(page, /setSubmissionStatus/);
  assert.match(page, /value="rejected">已拒稿/);
  assert.match(page, /value="resubmitted">已重投/);
  assert.match(page, /value="under_review" selected/);
});

test('rejection and resubmission persist through fresh script initialization and syncLists', () => {
  const h = harness(); h.seed();
  for (const status of ['rejected', 'resubmitted']) {
    h.context.setSubmissionStatus('paper1', status);
    const refreshed = harness(h.stored);
    assert.equal(refreshed.field('status'), status);
    assert.match(refreshed.run('renderSubmitted()'), new RegExp(`value="${status}" selected`));
    assert.equal(JSON.parse(h.stored.get('research-hub-fields-v1')).paper1.status, status);
    assert.ok(refreshed.field('lastUpdate'));
  }
});

test('filter reads persisted status rather than stale card defaults after refresh', () => {
  const h = harness(); h.seed(); h.context.setSubmissionStatus('paper1', 'rejected');
  const refreshed = harness(h.stored); refreshed.run('render();');
  assert.equal(refreshed.run('DATA.submitted[0].status'), 'under_review');
  refreshed.node('statusFilter').value = 'rejected';
  refreshed.node('statusFilter').dispatchEvent({ type: 'change' });
  assert.match(refreshed.node('results').innerHTML, /Test paper/);
  refreshed.node('statusFilter').value = 'under_review';
  refreshed.node('statusFilter').dispatchEvent({ type: 'change' });
  assert.match(refreshed.node('results').innerHTML, /没有找到匹配的论文/);
});

test('resubmission appends a new round and retains all older statuses', () => {
  const h = harness(); h.seed({ history: [
    { journal: 'Journal A', date: '2026-09-01', status: 'rejected' },
    { journal: 'Journal B', date: '2026-10-01', status: 'under_review' }
  ] });
  h.context.setSubmissionStatus('paper1', 'resubmitted');
  const history = h.field('history');
  assert.equal(history.length, 3);
  assert.equal(history[0].status, 'rejected');
  assert.equal(history[1].status, 'under_review');
  assert.equal(history[2].status, 'resubmitted');
});

test('current history rejection updates top status and remains visible after reload', () => {
  const h = harness(); h.seed({ history: [{ journal: 'Journal B', date: '2026-10-01', status: 'under_review' }] });
  h.context.setHistoryStatus('paper1', 0, 'rejected');
  const refreshed = harness(h.stored);
  assert.equal(refreshed.field('status'), 'rejected');
  assert.match(refreshed.run('renderSubmitted()'), /value="rejected" selected/);
});

test('editing an old round does not replace current resubmission status', () => {
  const h = harness(); h.seed({ status: 'resubmitted', history: [
    { journal: 'Journal A', date: '2026-09-01', status: 'submitted' },
    { journal: 'Journal B', date: '2026-10-01', status: 'resubmitted' }
  ] });
  h.context.setHistoryStatus('paper1', 0, 'rejected');
  assert.equal(h.field('status'), 'resubmitted');
  assert.equal(h.field('history')[0].status, 'rejected');
});

test('latest history for a different journal or submission date is not treated as current', () => {
  for (const previous of [
    { journal: 'Journal A', date: '2026-10-01', status: 'rejected' },
    { journal: 'Journal B', date: '2026-09-01', status: 'rejected' }
  ]) {
    const h = harness(); h.seed({ history: [previous] });
    h.context.setSubmissionStatus('paper1', 'resubmitted');
    assert.equal(h.field('history')[0].status, 'rejected');
    h.context.setHistoryStatus('paper1', 0, 'withdrawn');
    assert.equal(h.field('status'), 'resubmitted');
  }
});

test('history status works when current journal and date have not been filled', () => {
  const h = harness(); h.seed({ currentJournal: '', submissionDate: '', history: [{ journal: 'Journal B', date: '2026-10-01', status: 'submitted' }] });
  h.context.setHistoryStatus('paper1', 0, 'resubmitted');
  assert.equal(h.field('status'), 'resubmitted');
});

test('status change preserves search/filter and removes a nonmatching card from current results', () => {
  const h = harness(); h.seed();
  h.node('searchInput').value = 'Test'; h.node('statusFilter').value = 'under_review';
  h.context.setSubmissionStatus('paper1', 'rejected');
  assert.equal(h.node('searchInput').value, 'Test');
  assert.equal(h.node('statusFilter').value, 'under_review');
  assert.match(h.node('results').innerHTML, /没有找到匹配的论文/);
});

test('unknown status, missing paper or history row do not change stored content', () => {
  const h = harness(); h.seed(); const before = JSON.stringify([...h.stored]);
  h.context.setSubmissionStatus('paper1', 'invalid');
  h.context.setSubmissionStatus('missing', 'rejected');
  h.context.setHistoryStatus('paper1', 0, 'invalid');
  h.context.setHistoryStatus('paper1', 99, 'rejected');
  assert.equal(JSON.stringify([...h.stored]), before);
});

test('status badges label resubmission, use distinct colors and escape unknown legacy text', () => {
  const h = harness();
  assert.match(h.context.statusBadge('resubmitted'), /orange.*已重投/);
  assert.match(h.context.statusBadge('rejected'), /red.*已拒稿/);
  assert.match(h.context.statusBadge('<legacy>'), /&lt;legacy&gt;/);
});

test('legacy status values remain selected without silently rewriting them', () => {
  const h = harness(); h.seed({ status: 'legacy_status' });
  assert.match(h.run('renderSubmitted()'), /value="legacy_status" selected/);
  assert.equal(h.field('status'), 'legacy_status');
});

test('new cache version reaches both outer pages and embedded paper pipeline', () => {
  const repo = path.join(__dirname, '..');
  for (const file of ['index.html', 'web/index.html', 'web/workbench.html']) {
    assert.match(fs.readFileSync(path.join(repo, file), 'utf8'), /20261007-10/);
  }
  assert.match(fs.readFileSync(path.join(repo, 'web/workbench.html'), 'utf8'), /paper-pipeline-v2\.html\?v=20261007-10/);
});

test('submission count derives from history, ignores legacy manual numbers and updates on add/delete', () => {
  const h = harness(); h.seed({ submissionCount: 9, currentJournal: '', submissionDate: '' });
  assert.equal(h.field('submissionCount'), 0);
  h.context.addHistory('paper1');
  assert.equal(h.field('submissionCount'), 1);
  h.context.addHistory('paper1');
  assert.equal(h.field('submissionCount'), 2);
  h.context.deleteHistory('paper1', 1);
  assert.equal(h.field('submissionCount'), 1);
  assert.equal(JSON.parse(h.stored.get('research-hub-fields-v1')).paper1.submissionCount, 1);
  const refreshed = harness(h.stored);
  assert.equal(refreshed.field('submissionCount'), 1);
  assert.match(refreshed.run('renderSubmitted()'), /1 次/);
  assert.doesNotMatch(refreshed.run('renderSubmitted()'), /data-edit-field="submissionCount"/);
});

test('state changes within a round never count as another submission', () => {
  const h = harness(); h.seed({ currentJournal: '', submissionDate: '' }); h.context.addHistory('paper1');
  for (const state of ['with_editor', 'under_review', 'major_revision', 'rejected']) {
    h.context.setHistoryStatus('paper1', 0, state);
    assert.equal(h.field('submissionCount'), 1);
  }
});

test('every state has its own date picker and history is created inline without prompts', () => {
  const h = harness(); h.seed(); h.context.addHistory('paper1');
  const page = h.run('renderSubmitted()');
  for (const label of ['已投稿', '初审中', '外审中', '小修改', '大修改', '已录用', '已拒稿', '已重投', '已撤稿']) {
    assert.ok(page.includes(`aria-label="第 1 次投稿${label}日期"`));
  }
  assert.match(page, /type="date" aria-label="投稿日期"/);
  assert.match(page, /type="date" aria-label="当前状态日期"/);
});

test('all independently chosen status dates survive switching states and reloading', () => {
  const h = harness(); h.seed({ history: [{ journal: 'Journal B', date: '2026-10-01', status: 'under_review' }] });
  const states = ['submitted', 'with_editor', 'under_review', 'minor_revision', 'major_revision', 'accepted', 'rejected', 'resubmitted', 'withdrawn'];
  for (let i = 0; i < states.length; i++) {
    h.context.setHistoryStatusDate('paper1', 0, states[i], `2026-10-${String(i + 1).padStart(2, '0')}`);
  }
  for (let i = 0; i < 7; i++) {
    h.context.setSubmissionStatus('paper1', states[i]);
    const refreshed = harness(h.stored);
    assert.equal(refreshed.run('getSubmissionStatusDate(DATA.submitted[0])'), `2026-10-${String(i + 1).padStart(2, '0')}`);
  }
  assert.equal(Object.keys(h.field('history')[0].statusDates).length, 9);
  h.context.setSubmissionStatus('paper1', 'resubmitted');
  assert.equal(h.run('getSubmissionStatusDate(DATA.submitted[0])'), '');
  assert.equal(h.field('history')[0].statusDates.resubmitted, '2026-10-08');
  h.context.setSubmissionStatusDate('paper1', '2026-10-10');
  assert.equal(harness(h.stored).run('getSubmissionStatusDate(DATA.submitted[0])'), '2026-10-10');
});

test('top status date syncs only the matching current round; clearing stays cleared after reload', () => {
  const h = harness(); h.seed({ history: [
    { journal: 'Journal A', date: '2026-09-01', status: 'rejected', statusDates: { rejected: '2026-09-20' } },
    { journal: 'Journal B', date: '2026-10-01', status: 'under_review' }
  ] });
  h.context.setSubmissionStatusDate('paper1', '2026-10-06');
  assert.equal(h.field('history')[1].statusDates.under_review, '2026-10-06');
  assert.equal(h.field('history')[0].statusDates.rejected, '2026-09-20');
  h.context.setSubmissionStatusDate('paper1', '');
  assert.equal(harness(h.stored).run('getSubmissionStatusDate(DATA.submitted[0])'), '');
});

test('top date still works without any history and does not invent a submission count', () => {
  const h = harness(); h.seed({ currentJournal: '', submissionDate: '' });
  h.context.setSubmissionStatusDate('paper1', '2026-10-06');
  assert.equal(harness(h.stored).run('getSubmissionStatusDate(DATA.submitted[0])'), '2026-10-06');
  assert.equal(h.field('submissionCount'), 0);
});

test('editing submission date preserves current-round linkage in both directions', () => {
  const h = harness(); h.seed({ history: [{ journal: 'Journal B', date: '2026-10-01', status: 'under_review' }] });
  h.context.setHistoryDate('paper1', 0, '2026-10-02');
  assert.equal(h.field('submissionDate'), '2026-10-02');
  h.context.setSubmissionDate('paper1', '2026-10-03');
  assert.equal(h.field('history')[0].date, '2026-10-03');
  h.context.setHistoryStatus('paper1', 0, 'rejected');
  assert.equal(h.field('status'), 'rejected');
});

test('legacy submission date is not mislabelled as rejection or resubmission date', () => {
  const h = harness(); h.seed({ history: [{ journal: 'Journal B', date: '2026-10-01', status: 'under_review' }] });
  h.context.setSubmissionStatus('paper1', 'rejected');
  assert.equal(h.run('getSubmissionStatusDate(DATA.submitted[0])'), '');
  h.context.setSubmissionStatus('paper1', 'resubmitted');
  assert.equal(h.run('getSubmissionStatusDate(DATA.submitted[0])'), '');
  assert.equal(h.run('submissionHistoryStatusDate(getPaperField(DATA.submitted[0], "history")[0], "submitted")'), '2026-10-01');
});

test('invalid calendar dates are rejected; leap days and clearing are allowed', () => {
  const h = harness(); h.seed(); h.context.addHistory('paper1');
  const before = JSON.stringify([...h.stored]);
  for (const date of ['2026-02-30', '2026-02-29', 'not-a-date', '2026-13-01']) {
    h.context.setHistoryStatusDate('paper1', 0, 'rejected', date);
    h.context.setHistoryDate('paper1', 0, date);
    h.context.setSubmissionDate('paper1', date);
    h.context.setSubmissionStatusDate('paper1', date);
  }
  assert.equal(JSON.stringify([...h.stored]), before);
  h.context.setHistoryStatusDate('paper1', 0, 'rejected', '2024-02-29');
  assert.equal(h.field('history')[0].statusDates.rejected, '2024-02-29');
  h.context.setHistoryDate('paper1', 0, '');
  assert.equal(h.field('history')[0].date, '');
});

test('rejecting then resubmitting from the card creates a second attempt without overwriting rejection', () => {
  const h = harness(); h.seed({ history: [{ journal: 'Journal B', date: '2026-10-01', status: 'under_review', statusDates: { under_review: '2026-10-03' } }] });
  h.context.setSubmissionStatus('paper1', 'rejected');
  h.context.setSubmissionStatusDate('paper1', '2026-10-05');
  assert.equal(h.field('submissionCount'), 1);
  h.context.setSubmissionStatus('paper1', 'resubmitted');
  assert.equal(h.field('submissionCount'), 2);
  assert.equal(h.field('history')[0].status, 'rejected');
  assert.equal(h.field('history')[0].statusDates.rejected, '2026-10-05');
  assert.equal(h.field('history')[1].status, 'resubmitted');
  assert.equal(h.field('submissionDate'), '');
  assert.equal(h.run('getSubmissionStatusDate(DATA.submitted[0])'), '');
  h.context.setSubmissionStatus('paper1', 'resubmitted');
  assert.equal(h.field('submissionCount'), 2);
  assert.equal(harness(h.stored).field('submissionCount'), 2);
});

test('selecting resubmitted in the current history also creates a new attempt', () => {
  const h = harness(); h.seed({ status: 'rejected', history: [{ journal: 'Journal B', date: '2026-10-01', status: 'rejected' }] });
  h.context.setHistoryStatus('paper1', 0, 'resubmitted');
  assert.equal(h.field('submissionCount'), 2);
  assert.equal(h.field('history')[0].status, 'rejected');
  assert.equal(h.field('history')[1].status, 'resubmitted');
  assert.equal(h.field('status'), 'resubmitted');
});

test('legacy current submissions without history are preserved before a new resubmission', () => {
  const h = harness(); h.seed({ status: 'rejected', statusDates: { rejected: '2026-10-05' } });
  h.context.setSubmissionStatus('paper1', 'resubmitted');
  assert.equal(h.field('submissionCount'), 2);
  assert.equal(h.field('history')[0].date, '2026-10-01');
  assert.equal(h.field('history')[0].status, 'rejected');
  assert.equal(h.field('history')[0].statusDates.rejected, '2026-10-05');
});

test('recording the current journal persists a real history record without duplicates', () => {
  const h = harness(); h.seed({ status: 'rejected', statusDates: { rejected: '2026-10-05' } });
  assert.match(h.run('renderSubmitted()'), /记录当前投稿到历史/);
  h.context.recordCurrentSubmission('paper1');
  assert.equal(h.field('submissionCount'), 1);
  assert.equal(JSON.parse(h.stored.get('research-hub-fields-v1')).paper1.history[0].journal, 'Journal B');
  h.context.recordCurrentSubmission('paper1');
  assert.equal(h.field('submissionCount'), 1);
});

test('filling the first current journal automatically creates history; corrections sync without increasing count', () => {
  const h = harness(); h.seed({ status: 'submitted', currentJournal: '', submissionDate: '' });
  h.context.setCurrentSubmissionJournal('paper1', 'First journal');
  assert.equal(h.field('history')[0].journal, 'First journal');
  assert.equal(h.field('submissionCount'), 1);
  h.context.setCurrentSubmissionJournal('paper1', 'First Journal');
  assert.equal(h.field('history')[0].journal, 'First Journal');
  assert.equal(h.field('submissionCount'), 1);
});

test('changing journal after rejection archives old journal and starts another counted attempt', () => {
  const h = harness(); h.seed({ status: 'rejected', history: [{ journal: 'Journal B', date: '2026-10-01', status: 'rejected', statusDates: { rejected: '2026-10-05' } }] });
  h.context.setCurrentSubmissionJournal('paper1', 'Journal C');
  assert.equal(h.field('submissionCount'), 2);
  assert.equal(h.field('history')[0].journal, 'Journal B');
  assert.equal(h.field('history')[0].statusDates.rejected, '2026-10-05');
  assert.equal(h.field('history')[1].journal, 'Journal C');
  assert.equal(h.field('status'), 'resubmitted');
  assert.equal(h.field('submissionDate'), '');
  h.context.recordCurrentSubmission('paper1');
  assert.equal(h.field('submissionCount'), 2);
  h.context.setCurrentSubmissionJournal('paper1', 'Journal C corrected');
  assert.equal(h.field('submissionCount'), 2);
  assert.equal(harness(h.stored).field('history')[1].journal, 'Journal C corrected');
});

test('inline editing current journal routes to history and editing current history journal syncs back', () => {
  const h = harness(); h.seed({ history: [{ journal: 'Journal B', date: '2026-10-01', status: 'under_review' }] });
  h.context.commitEditField({ dataset: { editId: 'paper1' } }, { dataset: {}, value: 'Journal B edited' }, h.run('DATA.submitted[0]'), 'currentJournal');
  assert.equal(h.field('history')[0].journal, 'Journal B edited');
  h.context.commitEditField({ dataset: { editId: 'paper1', editHist: '0' } }, { dataset: {}, value: 'Journal B second edit' }, h.run('DATA.submitted[0]'), 'journal');
  assert.equal(h.field('currentJournal'), 'Journal B second edit');
  assert.equal(h.field('submissionCount'), 1);
});

test('reuse manually added blank round during resubmission without double counting', () => {
  const h = harness(); h.seed({ status: 'rejected', history: [{ journal: 'Journal B', date: '2026-10-01', status: 'rejected' }] });
  h.context.addHistory('paper1');
  h.context.setSubmissionStatus('paper1', 'resubmitted');
  assert.equal(h.field('submissionCount'), 2);
  assert.equal(h.field('history')[0].status, 'rejected');
  assert.equal(h.field('history')[1].status, 'resubmitted');
});

test('deleting all history does not recreate an implicit legacy round', () => {
  const h = harness(); h.seed({ history: [{ journal: 'Journal B', date: '2026-10-01', status: 'under_review' }] });
  h.context.deleteHistory('paper1', 0);
  assert.equal(h.field('submissionCount'), 0);
  assert.equal(harness(h.stored).field('submissionCount'), 0);
});

test('changing journal after manually adding a blank attempt does not double count', () => {
  const h = harness(); h.seed({ status: 'rejected', history: [{ journal: 'Journal B', date: '2026-10-01', status: 'rejected' }] });
  h.context.addHistory('paper1');
  h.context.recordCurrentSubmission('paper1');
  assert.equal(h.field('submissionCount'), 2);
  h.context.setCurrentSubmissionJournal('paper1', 'Journal C');
  assert.equal(h.field('submissionCount'), 2);
  assert.equal(h.field('history')[0].journal, 'Journal B');
  assert.equal(h.field('history')[1].journal, 'Journal C');
});

test('submission-history layout outranks generic timeline rules and gives dates a full row', () => {
  const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
  const rule = css.match(/\.timeline-item\.submission-history-item\s*\{([^}]+)\}/);
  assert.ok(rule, 'two class selectors must outrank the later single-class timeline rule');
  assert.match(rule[1], /grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  const date = css.match(/\.submission-history-item\s+\.submission-date\s*\{([^}]+)\}/);
  assert.ok(date);
  assert.match(date[1], /width:\s*180px/);
  assert.match(date[1], /min-width:\s*160px/);
});
