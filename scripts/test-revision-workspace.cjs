const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '../web/paper-pipeline-v2.html'), 'utf8');
const source = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const base = fs.readFileSync(path.join(__dirname, 'test-submission-status.cjs'), 'utf8');
const factory = vm.createContext({ source, vm, Date, console, require });
vm.runInContext(base.slice(base.indexOf('function harness('), base.indexOf("test('entire pipeline")), factory);
function harness(stored) {
  const h = factory.harness(stored), alerts = [];
  h.context.alert = message => alerts.push(message);
  h.context.location = { origin: 'https://example.test' };
  return { ...h, alerts };
}

test('revision is a real pipeline navigation page, not a fourth paper store', () => {
  const h = harness(); h.seed({ status: 'major_revision' });
  assert.match(html, /data-page="revision">📑 <span>返修论文<\/span>/);
  assert.doesNotMatch(html, /data-page="revision"><span aria-hidden="true">↻/);
  h.context.navigate('revision'); assert.equal(h.run('currentPage'), 'revision');
  assert.equal(h.node('page-title').textContent, '返修论文');
  assert.match(h.node('page-content').innerHTML, /class="cards-grid revision-cards-grid"/);
  assert.deepEqual(Array.from(h.run('Object.keys(DATA)')).sort(), ['published', 'research', 'submitted']);
});

test('major/minor revisions, older opinions, historical deadlines and material archives appear automatically', () => {
  for (const fields of [
    { status: 'major_revision' }, { status: 'minor_revision' },
    { status: 'resubmitted', history: [{ journal: 'Old', status: 'major_revision', revisionDueAt: '2026-11-02' }] },
    { status: 'accepted', submissionRevisionRounds: [{ id: 'rround123456', number: 1, items: [] }] },
    { status: 'under_review', submissionFileRounds: [{ id: 'rround123456', number: 1, journal: 'Old' }] }
  ]) {
    const h = harness(); h.seed(fields); const snapshot = JSON.stringify([...h.stored]);
    assert.equal(h.run('revisionPaperEntries().length'), 1);
    assert.match(h.run('renderRevisionPapers()'), /data-paper-key="paper1"/);
    assert.equal(JSON.stringify([...h.stored]), snapshot);
  }
  const h = harness(); h.seed(); assert.equal(h.run('revisionPaperEntries().length'), 0);
});

test('submitted cards keep submission controls and one entry point, not duplicate revision editors', () => {
  const h = harness(); h.seed({ status: 'major_revision' }); h.context.addRevisionItem('paper1', null);
  const before = h.run('renderSubmitted()'), revision = h.run('renderRevisionPapers()');
  for (const text of ['进入返修论文', '记录当前投稿到历史', '稿件编号', '投稿次数']) assert.ok(before.includes(text));
  assert.doesNotMatch(before, /class="submission-revision"|aria-label="返修截止日期"|data-submission-material="(?:revision|response)"/);
  for (const text of ['返修截止日期', '审稿意见', '修改内容', '稿件位置', '回复文字', '加入待办', '导出回复清单', '返修稿', '回复信']) assert.ok(revision.includes(text));
  assert.equal((revision.match(/class="revision-item"/g) || []).length, 1);
  assert.equal(h.field('submissionCount'), 1);
});

test('starting revision uses the selected original paper without adding a submission attempt', () => {
  const h = harness(); h.seed({ manuscriptId: 'JB-100' });
  h.context.startPaperRevision('paper1');
  assert.equal(h.run('currentPage'), 'revision'); assert.equal(h.field('status'), 'major_revision');
  assert.equal(h.field('submissionCount'), 1); assert.equal(h.field('manuscriptId'), 'JB-100');
  assert.equal(h.run('DATA.submitted.length'), 1); assert.equal(h.run('DATA.submitted[0]._key'), 'paper1');
  h.context.setSubmissionStatus('paper1', 'minor_revision'); h.context.startPaperRevision('paper1');
  assert.equal(h.field('status'), 'minor_revision'); assert.equal(h.field('submissionCount'), 1);
  const fresh = harness(h.stored); assert.equal(fresh.run('revisionPaperEntries().length'), 1);
});

test('missing journal and unknown papers cannot start revision or mutate records', () => {
  const h = harness(); h.seed({ currentJournal: '', submissionDate: '' });
  const snapshot = JSON.stringify([...h.stored]); h.context.startPaperRevision('paper1'); h.context.startPaperRevision('missing');
  assert.equal(h.alerts.length, 2); assert.equal(JSON.stringify([...h.stored]), snapshot);
});

test('opening and leaving a revision paper is read-only and respects the original paper location', () => {
  const h = harness(); h.seed(); const snapshot = JSON.stringify([...h.stored]);
  assert.equal(h.context.openRevisionPaper('paper1'), true);
  assert.equal(h.run('currentPage'), 'revision'); assert.equal(h.run('revisionPaperEntries().length'), 1);
  h.context.openRevisionSourcePaper('paper1'); assert.equal(h.run('currentPage'), 'submitted');
  assert.equal(h.run('revisionFocusKey'), ''); assert.equal(JSON.stringify([...h.stored]), snapshot);
  assert.equal(h.context.openRevisionPaper('missing'), false);
});

test('search reads saved field overrides and active/history filters use the real status', () => {
  const h = harness(); h.seed({ status: 'major_revision' });
  h.context.setPaperField(h.run('DATA.submitted[0]'), 'title', 'Updated title');
  h.context.navigate('revision');
  h.node('searchInput').value = 'Updated'; h.node('searchInput').dispatchEvent({ type: 'input' });
  assert.match(h.node('results').innerHTML, /Updated title/);
  h.node('statusFilter').value = 'history'; h.node('statusFilter').dispatchEvent({ type: 'change' });
  assert.doesNotMatch(h.node('results').innerHTML, /data-paper-key="paper1"/);
  h.node('statusFilter').value = 'active'; h.node('statusFilter').dispatchEvent({ type: 'change' });
  assert.match(h.node('results').innerHTML, /data-paper-key="paper1"/);
});

test('old round deadlines and replies stay editable separately after resubmission', () => {
  const h = harness(); h.seed({ status: 'major_revision' }); h.context.addRevisionItem('paper1', null);
  const round = h.field('submissionRevisionRounds')[0];
  h.context.updateRevisionItem('paper1', round.id, round.items[0].id, 'response', 'Old reply');
  h.context.setRevisionDueAt('paper1', '2026-10-28'); h.context.setSubmissionStatus('paper1', 'resubmitted');
  const markup = h.run('renderRevisionPapers()');
  assert.match(markup, /历史第 1 次投稿/); assert.match(markup, /Old reply/); assert.match(markup, /2026-10-28/);
  assert.match(markup, /setHistoryRevisionDueAt\('paper1', 0, this.value\)/);
  assert.equal(h.field('revisionDueAt'), ''); assert.equal(h.field('submissionCount'), 2);
});

test('deleted history and publication transitions retain discoverable revision archives', () => {
  const h = harness(); h.seed({ status: 'major_revision' }); h.context.addRevisionItem('paper1', null);
  const round = h.field('submissionRevisionRounds')[0];
  h.context.updateRevisionItem('paper1', round.id, round.items[0].id, 'comment', 'Keep comment');
  h.context.deleteHistory('paper1', 0); assert.match(h.run('renderRevisionPapers()'), /返修清单归档/);
  h.context.moveToPublished('paper1');
  assert.match(h.run('renderRevisionPapers()'), /Keep comment/); assert.match(h.run('renderRevisionPapers()'), /已发表返修归档/);
  assert.doesNotMatch(h.run('renderPublishedCard(DATA.published[0])'), /class="submission-revision"/);
  assert.match(h.run('renderPublishedCard(DATA.published[0])'), /查看返修归档/);
  h.context.openRevisionPaper('paper1'); h.context.openRevisionSourcePaper('paper1'); assert.equal(h.run('currentPage'), 'published');
});

test('the revision page still uses common save and account-scoped snapshot keys', () => {
  const h = harness(); h.seed({ status: 'major_revision' }); h.context.navigate('revision'); h.context.addRevisionItem('paper1', null);
  const fields = JSON.parse(h.stored.get('research-hub-fields-v1'));
  assert.equal(fields.paper1.submissionRevisionRounds[0].items.length, 1);
  assert.match(html, /pipeline-save\.js\?v=/); assert.doesNotMatch(html, /research-hub-revisions-v\d/);
});

test('trusted incoming links can open revision page without a DATA.revision array', () => {
  const h = harness(); h.seed({ status: 'major_revision' });
  h.context.window.parent = {};
  const start = source.indexOf('window.addEventListener("message", event => {') + 'window.addEventListener("message", '.length;
  const end = source.indexOf('\n  });\n  document.getElementById("page-content")', start);
  const handler = vm.runInContext('(' + source.slice(start, end) + '\n})', h.context);
  handler({ origin: 'https://wrong.test', source: h.context.window.parent, data: { type: 'academic-research-hub-open-paper', kind: 'revision', key: 'paper1' } });
  assert.equal(h.run('currentPage'), 'submitted');
  handler({ origin: 'https://example.test', source: h.context.window.parent, data: { type: 'academic-research-hub-open-paper', kind: 'revision', key: 'paper1' } });
  assert.equal(h.run('currentPage'), 'revision');
});
