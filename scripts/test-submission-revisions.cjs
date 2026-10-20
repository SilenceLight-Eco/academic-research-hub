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
  if (!stored) h.seed({ status: 'major_revision', revisionDueAt: '2026-10-25' });
  h.run('currentPage = "revision"; render();');
  const rounds = () => h.run('getSubmissionRevisionRounds(findPaperByKey("paper1"))');
  const add = (reference = null) => h.context.addRevisionItem('paper1', reference);
  const update = (field, value, roundIndex = 0, itemIndex = 0) => {
    const round = rounds()[roundIndex];
    h.context.updateRevisionItem('paper1', round.id, round.items[itemIndex].id, field, value);
  };
  return { ...h, alerts, rounds, add, update };
}

test('current checklist is inline in the revision workspace, with all fields and no prompt', () => {
  const h = harness(); h.add();
  const markup = h.run('renderRevisionPaperCard(DATA.submitted[0], "submitted")');
  for (const text of ['本轮返修清单', '审稿意见', '修改内容', '稿件位置', '回复文字', '未处理', '修改中', '已完成', '导出回复清单']) assert.ok(markup.includes(text));
  assert.equal((markup.match(/class="submission-revision"/g) || []).length, 1);
  assert.equal((markup.match(/<textarea/g) || []).length, 4);
  assert.match(markup, /2026-10-25/);
  assert.doesNotMatch(h.run('renderResearchCard(DATA.submitted[0])'), /submission-revision/);
  assert.doesNotMatch(h.run('renderSubmittedCard(DATA.submitted[0])'), /class="submission-revision"/);
  assert.doesNotMatch(source.slice(source.indexOf('const REVISION_ITEM_STATUSES'), source.indexOf('function validSubmissionFileRoundId')), /prompt\(/);
});

test('rendering never mutates data; creating opinions does not increase submission count', () => {
  const h = harness(), snapshot = JSON.stringify([...h.stored]);
  h.run('renderRevisionPapers()'); assert.equal(JSON.stringify([...h.stored]), snapshot);
  h.add(); h.add();
  assert.equal(h.field('submissionCount'), 1); assert.equal(h.rounds().length, 1);
  assert.equal(h.rounds()[0].items.length, 2);
  assert.notEqual(h.rounds()[0].items[0].id, h.rounds()[0].items[1].id);
});

test('all four fields and progress survive refresh using the existing synced field store', () => {
  const h = harness(); h.add();
  for (const [field, value] of Object.entries({ comment: '识别假设\n补充说明', change: '新增稳健性检验', position: '第 4 页，第 12 行', response: 'Thank you.\n已修改。', status: 'done' })) h.update(field, value);
  const fresh = harness(h.stored), item = fresh.rounds()[0].items[0];
  assert.equal(item.comment, '识别假设\n补充说明'); assert.equal(item.change, '新增稳健性检验');
  assert.equal(item.position, '第 4 页，第 12 行'); assert.equal(item.response, 'Thank you.\n已修改。');
  assert.match(fresh.run('renderRevisionPapers()'), /1\/1 已完成（100%）/);
  const fields = JSON.parse(h.stored.get('research-hub-fields-v1')).paper1;
  assert.equal(fields.submissionRevisionRounds[0].items[0].status, 'done');
  assert.equal(fields.history[0].revisionRoundId, fields.submissionRevisionRounds[0].id);
});

test('text updates do not redraw the editor, while status updates recompute progress', () => {
  const h = harness(); h.add(); h.add();
  h.node('page-content').innerHTML = 'editor remains focused';
  h.update('comment', '输入中'); assert.equal(h.node('page-content').innerHTML, 'editor remains focused');
  h.update('status', 'working'); assert.match(h.node('page-content').innerHTML, /0\/2 已完成（0%）/);
  h.update('status', 'done'); assert.match(h.node('page-content').innerHTML, /1\/2 已完成（50%）/);
});

test('same-journal/date corrections and recording history preserve the checklist', () => {
  const h = harness(); h.add(); h.update('comment', '第一轮意见'); const id = h.rounds()[0].id;
  h.context.setCurrentSubmissionJournal('paper1', 'JOURNAL B');
  h.context.setSubmissionDate('paper1', '2026-10-02'); h.context.setRevisionDueAt('paper1', '2026-10-28');
  h.context.recordCurrentSubmission('paper1'); h.add();
  assert.equal(h.rounds()[0].id, id); assert.equal(h.rounds().length, 1);
  assert.equal(h.rounds()[0].items[0].comment, '第一轮意见');
  assert.equal(h.rounds()[0].journal, 'JOURNAL B'); assert.equal(h.rounds()[0].date, '2026-10-02');
  assert.equal(h.rounds()[0].dueAt, '2026-10-28'); assert.equal(h.field('submissionCount'), 1);
});

test('resubmission starts empty and old-round replies remain independently editable', () => {
  const h = harness(); h.add(); h.update('response', '旧回复'); const old = h.rounds()[0].id;
  h.context.setSubmissionStatus('paper1', 'resubmitted');
  assert.equal(h.run('submissionRevisionContext(DATA.submitted[0], null).round.items.length'), 0);
  h.add(); const current = h.rounds()[1];
  assert.notEqual(current.id, old); assert.equal(current.dueAt, '');
  assert.equal(current.items[0].response, ''); assert.equal(h.field('submissionCount'), 2);
  h.update('response', '新回复', 1); h.update('comment', '旧意见');
  assert.equal(h.rounds()[0].items[0].response, '旧回复'); assert.equal(h.rounds()[1].items[0].response, '新回复');
  assert.equal(h.run('submissionRevisionContext(DATA.submitted[0], 0).round.id'), old);
  assert.equal((h.run('renderRevisionPapers()').match(/class="submission-revision"/g) || []).length, 2);
});

test('changing journals creates separate revision rounds without copying replies', () => {
  const h = harness(); h.add(); h.update('comment', '旧期刊意见');
  h.context.setCurrentSubmissionJournal('paper1', 'Journal C'); h.add();
  assert.equal(h.rounds().length, 2); assert.equal(h.rounds()[1].journal, 'Journal C');
  assert.equal(h.rounds()[1].items[0].comment, ''); assert.equal(h.field('submissionCount'), 2);
});

test('a manual blank history row never steals the current checklist', () => {
  const h = harness(); h.add(); const old = h.rounds()[0].id;
  h.context.addHistory('paper1'); h.add();
  assert.equal(h.rounds().length, 1); assert.equal(h.rounds()[0].items.length, 2);
  assert.equal(h.field('history')[0].revisionRoundId, old); assert.equal(h.field('history')[1].revisionRoundId, undefined);
  h.context.setCurrentSubmissionJournal('paper1', 'Journal C'); h.add();
  assert.equal(h.rounds().length, 2); assert.equal(h.field('submissionCount'), 2);
});

test('deleting a history row retains archived replies and their latest deadline', () => {
  const h = harness(); h.add(); h.update('comment', '必须保留');
  h.context.setRevisionDueAt('paper1', '2026-11-02'); const id = h.rounds()[0].id;
  h.context.deleteHistory('paper1', 0);
  assert.equal(h.field('submissionCount'), 0); assert.equal(h.rounds()[0].dueAt, '2026-11-02');
  assert.match(h.run('renderRevisionPapers()'), /返修清单归档/);
  h.add(id); assert.equal(h.rounds()[0].items.length, 2);
  h.context.recordCurrentSubmission('paper1'); h.add();
  assert.equal(h.rounds().length, 2); assert.notEqual(h.rounds()[1].id, id);
  assert.equal(h.rounds()[0].items[0].comment, '必须保留');
});

test('deleting a history index cannot transfer another round’s replies', () => {
  const h = harness(); h.add(); h.update('comment', '旧意见');
  h.context.setSubmissionStatus('paper1', 'resubmitted'); h.add(); h.update('comment', '新意见', 1);
  const currentId = h.rounds()[1].id; h.context.deleteHistory('paper1', 0);
  assert.equal(h.run('submissionRevisionContext(DATA.submitted[0], null).round.id'), currentId);
  assert.equal(h.run('submissionRevisionContext(DATA.submitted[0], 0).round.items[0].comment'), '新意见');
});

test('moving to published preserves complete revision archives across refresh', () => {
  const h = harness(); h.add(); h.update('response', '录用前回复'); const id = h.rounds()[0].id;
  h.context.moveToPublished('paper1');
  assert.match(h.run('renderRevisionPaperCard(DATA.published[0], "published")'), /返修清单归档/);
  const fresh = harness(h.stored); assert.equal(fresh.rounds()[0].id, id);
  assert.equal(fresh.rounds()[0].items[0].response, '录用前回复');
  fresh.add(id); assert.equal(fresh.rounds()[0].items.length, 2);
});

test('delete removes only the selected opinion; cancel preserves it', () => {
  const h = harness(); h.add(); h.add(); const round = h.rounds()[0];
  h.context.confirm = () => false;
  h.context.deleteRevisionItem('paper1', round.id, round.items[0].id); assert.equal(h.rounds()[0].items.length, 2);
  h.context.confirm = () => true;
  h.context.deleteRevisionItem('paper1', round.id, round.items[0].id);
  assert.equal(h.rounds()[0].items.length, 1); assert.equal(h.rounds()[0].items[0].id, round.items[1].id);
  h.context.deleteRevisionItem('paper1', round.id, round.items[1].id);
  assert.match(h.run('renderRevisionPapers()'), /0\/0 已完成（0%）/);
});

test('unrecorded current attempts and invalid references cannot silently create ambiguous rounds', () => {
  const h = harness(); h.seed({ currentJournal: '', submissionDate: '' }); h.add();
  assert.equal(h.rounds().length, 0); assert.match(h.alerts[0], /记录当前投稿到历史/);
  h.seed(); h.context.deleteHistory('paper1', 0); h.add(); assert.equal(h.rounds().length, 0);
  for (const ref of [99, -1, '__proto__', 'rnot-in-catalog']) h.add(ref);
  assert.equal(h.rounds().length, 0);
});

test('invalid statuses, fields, item and round IDs cannot overwrite unrelated data', () => {
  const h = harness(); h.add(); const round = h.rounds()[0]; const snapshot = JSON.stringify(h.rounds());
  for (const field of ['__proto__', 'constructor', 'items', 'title']) h.update(field, 'bad');
  h.update('status', 'bad');
  h.context.updateRevisionItem('paper1', 'missing', round.items[0].id, 'response', 'bad');
  h.context.updateRevisionItem('paper1', round.id, 'missing', 'response', 'bad');
  assert.equal(JSON.stringify(h.rounds()), snapshot);
});

test('user text is escaped in HTML, retains whitespace, and exports the real reply content', () => {
  const h = harness(); h.add(); const payload = '</textarea><img src=x onerror=alert(1)>\n\n中文  双空格';
  h.update('comment', payload); h.update('response', '感谢审稿人\n\n详见修订稿。');
  const markup = h.run('renderRevisionPapers()');
  assert.ok(!markup.includes('</textarea><img')); assert.ok(markup.includes('&lt;/textarea&gt;&lt;img'));
  assert.equal(h.rounds()[0].items[0].comment, payload);
  const markdown = h.run('buildRevisionChecklistMarkdown(DATA.submitted[0], getSubmissionRevisionRounds(DATA.submitted[0])[0])');
  assert.ok(markdown.includes(payload)); assert.ok(markdown.includes('感谢审稿人\n\n详见修订稿。'));
  assert.match(markdown, /第 1 次投稿 · Journal B/); assert.match(markdown, /返修截止：2026-10-25/);
});

test('export creates one local Markdown download without network calls', () => {
  const h = harness(); h.add(); h.update('response', 'Exported response');
  const downloads = [], revoked = [], links = [];
  h.context.Blob = class { constructor(parts, options) { downloads.push({ parts, options }); } };
  h.context.URL = { createObjectURL: () => 'blob:revision', revokeObjectURL: url => revoked.push(url) };
  h.context.setTimeout = callback => callback();
  h.context.document.body = { appendChild: link => links.push(link) };
  h.context.document.createElement = () => ({ click() { this.clicked = true; }, remove() { this.removed = true; } });
  h.context.exportRevisionChecklist('paper1', null);
  assert.equal(downloads.length, 1); assert.equal(downloads[0].options.type, 'text/markdown;charset=utf-8');
  assert.ok(downloads[0].parts[0].includes('Exported response')); assert.equal(links[0].download, '返修回复清单-第1次投稿.md');
  assert.ok(links[0].clicked && links[0].removed); assert.deepEqual(revoked, ['blob:revision']);
});

test('status redraw preserves open and closed checklist state plus current search filters', () => {
  const h = harness(); h.add();
  const panels = [{ dataset: { submissionRevision: 'paper1:current' }, open: false }, { dataset: { submissionRevision: 'paper1:0' }, open: true }];
  h.context.document.querySelectorAll = selector => selector === '[data-submission-revision]' ? panels : [];
  h.node('searchInput').value = 'Test'; h.node('statusFilter').value = 'major_revision';
  h.update('status', 'done');
  assert.equal(panels[0].open, false); assert.equal(panels[1].open, true);
  assert.equal(h.node('searchInput').value, 'Test'); assert.equal(h.node('statusFilter').value, 'major_revision');
});
