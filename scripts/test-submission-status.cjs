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

test('changing current status updates only the matching current history and retains old rejection', () => {
  const h = harness(); h.seed({ history: [
    { journal: 'Journal A', date: '2026-09-01', status: 'rejected' },
    { journal: 'Journal B', date: '2026-10-01', status: 'under_review' }
  ] });
  h.context.setSubmissionStatus('paper1', 'resubmitted');
  const history = h.field('history');
  assert.equal(history.length, 2);
  assert.equal(history[0].status, 'rejected');
  assert.equal(history[1].status, 'resubmitted');
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
    assert.match(fs.readFileSync(path.join(repo, file), 'utf8'), /20261007-07/);
  }
  assert.match(fs.readFileSync(path.join(repo, 'web/workbench.html'), 'utf8'), /paper-pipeline-v2\.html\?v=20261007-07/);
});
