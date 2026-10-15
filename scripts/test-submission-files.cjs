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
function harness() {
  const h = factory.harness(); const messages = [], alerts = [];
  h.context.location = h.context.window.location = { origin: 'https://example.test' };
  h.context.window.parent = { postMessage: (data, origin) => messages.push({ data, origin }) };
  h.context.alert = text => alerts.push(text);
  h.seed();
  const open = (ref = null, type = 'manuscript') => h.context.openSubmissionFiles('paper1', ref, type);
  const attachments = () => messages.filter(message => message.data.type === 'academic-research-hub-open-attachments');
  return { ...h, messages, alerts, open, attachments };
}

test('current and history show three material types and retain legacy attachment access', () => {
  const h = harness(); const markup = h.run('renderSubmitted()');
  for (const label of ['投稿稿', '返修稿', '回复信', '通用与原有附件']) assert.ok(markup.includes(label));
  assert.match(markup, /openSubmissionFiles\('paper1', null, 'manuscript'\)/);
  assert.match(markup, /openSubmissionFiles\('paper1', 0, 'response'\)/);
});

test('each material type has a separate persistent context and opening files never adds submission attempts', () => {
  const h = harness();
  for (const type of ['manuscript', 'revision', 'response']) h.open(null, type);
  const messages = h.attachments();
  assert.equal(messages.length, 3); assert.equal(new Set(messages.map(entry => entry.data.id)).size, 3);
  assert.equal(h.field('submissionCount'), 1); assert.equal(h.field('submissionFileRounds').length, 1);
  for (const entry of messages) {
    assert.match(entry.data.id, /^[A-Za-z0-9_-]{1,120}$/); assert.equal(entry.origin, 'https://example.test');
    assert.match(entry.data.title, /第 1 次投稿/); assert.match(entry.data.description, /Journal B/);
  }
  h.open(0, 'manuscript'); assert.equal(h.attachments().at(-1).data.id, messages[0].data.id);
  const fresh = factory.harness(h.stored);
  assert.equal(fresh.field('history')[0].attachmentRoundId, h.field('history')[0].attachmentRoundId);
  assert.equal(fresh.field('submissionFileRounds')[0].id, h.field('submissionFileRounds')[0].id);
});

test('a resubmission uses a new round while earlier materials remain reachable', () => {
  const h = harness(); h.open(); const old = h.attachments()[0].data.id;
  h.context.setSubmissionStatus('paper1', 'resubmitted'); h.open();
  const current = h.attachments().at(-1).data.id;
  assert.notEqual(current, old); assert.equal(h.field('submissionCount'), 2);
  h.open(0); assert.equal(h.attachments().at(-1).data.id, old);
  h.open(1); assert.equal(h.attachments().at(-1).data.id, current);
});

test('same-journal/date corrections and record-current preserve the material ID', () => {
  const h = harness(); h.open(); const old = h.attachments()[0].data.id;
  h.context.setSubmissionDate('paper1', '2026-10-02');
  h.context.setCurrentSubmissionJournal('paper1', 'JOURNAL B');
  h.context.recordCurrentSubmission('paper1'); h.open();
  assert.equal(h.attachments().at(-1).data.id, old);
  assert.equal(h.field('submissionCount'), 1);
  assert.equal(h.field('submissionFileRounds')[0].journal, 'JOURNAL B');
});

test('manual blank next round does not steal the current round materials', () => {
  const h = harness(); h.open(); const old = h.attachments()[0].data.id;
  h.context.addHistory('paper1'); h.open();
  assert.equal(h.attachments().at(-1).data.id, old);
  h.context.setCurrentSubmissionJournal('paper1', 'Journal C'); h.open();
  assert.notEqual(h.attachments().at(-1).data.id, old); assert.equal(h.field('submissionCount'), 2);
});

test('deleting history leaves archived materials reachable and prevents a new attempt from reusing the ID', () => {
  const h = harness(); h.open(); const old = h.attachments()[0].data.id;
  const round = h.field('submissionFileRounds')[0]; h.context.deleteHistory('paper1', 0);
  assert.equal(h.field('submissionCount'), 0);
  assert.match(h.run('renderSubmitted()'), /投稿材料归档 · 1 轮/);
  h.open(round.id); assert.equal(h.attachments().at(-1).data.id, old);
  h.context.setSubmissionStatus('paper1', 'resubmitted'); h.open();
  assert.notEqual(h.attachments().at(-1).data.id, old);
});

test('moving to published preserves material catalog and original shared attachments', () => {
  const h = harness(); h.context.setPaperField(h.run('DATA.submitted[0]'), 'attachmentKey', 'legacy-files');
  h.open(); const old = h.attachments()[0].data.id, round = h.field('submissionFileRounds')[0];
  h.context.moveToPublished('paper1');
  assert.equal(h.run('DATA.submitted.length'), 0); assert.equal(h.run('DATA.published.length'), 1);
  assert.match(h.run('renderPublishedCard(DATA.published[0])'), /投稿材料归档 · 1 轮/);
  h.open(round.id); assert.equal(h.attachments().at(-1).data.id, old);
  h.context.openPaperFiles('paper1'); assert.equal(h.attachments().at(-1).data.id, 'legacy-files');
  assert.equal(JSON.parse(h.stored.get('research-hub-fields-v1')).paper1.submissionFileRounds[0].id, round.id);
});

test('missing current journal, deleted history and invalid material cannot generate ambiguous uploads', () => {
  const h = harness();
  for (const type of ['unknown', '__proto__', 'constructor']) h.open(null, type);
  h.open(99); h.open('rnot-in-catalog'); assert.equal(h.attachments().length, 0);
  h.seed({ currentJournal: '', submissionDate: '' }); h.open(); assert.equal(h.attachments().length, 0);
  h.seed(); h.context.deleteHistory('paper1', 0); h.open(); assert.equal(h.attachments().length, 0);
  assert.ok(h.alerts.length >= 3); assert.equal(h.field('submissionCount'), 0);
});

test('local storage failure blocks upload before an unstable context can orphan files', () => {
  const h = harness(); h.context.localStorage.setItem = () => { throw new Error('Quota exceeded'); };
  h.open(); assert.equal(h.attachments().length, 0); assert.match(h.alerts.at(-1), /无法保存材料归档位置/);
});

test('standalone pipeline does not create a catalog before directing the user to the workbench', () => {
  const h = harness(); h.context.window.parent = h.context.window; h.open();
  assert.equal(h.attachments().length, 0); assert.equal(h.field('submissionFileRounds'), undefined);
});

test('archive safely escapes journal content and ignores malformed catalog IDs', () => {
  const h = harness(); h.seed({ currentJournal: '<script>journal</script>' }); h.open();
  assert.match(h.run('renderSubmissionFileArchive(DATA.submitted[0])'), /&lt;script&gt;journal&lt;\/script&gt;/);
  h.context.setPaperField(h.run('DATA.submitted[0]'), 'submissionFileRounds', [{ id: "bad' onclick='alert(1)", journal: 'bad' }]);
  assert.equal(h.run('renderSubmissionFileArchive(DATA.submitted[0])'), '');
});
