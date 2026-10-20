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
  h.context.alert = text => alerts.push(text);
  if (!stored) h.seed({ status: 'major_revision' });
  h.run('currentPage = "revision"; render();');
  const rounds = () => h.run('getSubmissionRevisionRounds(findPaperByKey("paper1"))');
  const add = (groupId = '', reference = null) => h.context.addRevisionItem('paper1', reference, groupId);
  const group = (name, reference = null) => h.context.addRevisionGroup('paper1', reference, name);
  const update = (field, value, itemIndex = 0, roundIndex = 0) => {
    const round = rounds()[roundIndex];
    h.context.updateRevisionItem('paper1', round.id, round.items[itemIndex].id, field, value);
  };
  return { ...h, alerts, rounds, add, group, update };
}

test('existing opinions stay unassigned with unchanged text; default groups render without writes', () => {
  const h = harness();
  h.seed({ status: 'major_revision', submissionRevisionRounds: [{ id: 'rlegacy12345', number: 1, items: [{ id: 'rcomment1234', status: 'working', comment: '原文\n\n  保持空格', response: '原回复' }] }] });
  const snapshot = JSON.stringify([...h.stored]), markup = h.run('renderRevisionPapers()');
  for (const name of ['编辑', '审稿人 1', '审稿人 2', '未分组']) assert.ok(markup.includes(name));
  assert.equal(h.rounds()[0].items[0].groupId, ''); assert.equal(h.rounds()[0].items[0].comment, '原文\n\n  保持空格');
  assert.equal(JSON.stringify([...h.stored]), snapshot); assert.equal((markup.match(/class="revision-item"/g) || []).length, 1);
});

test('creating a group before any opinion establishes only one stable submission round', () => {
  const h = harness(); h.group('审稿人 3'); h.group('统计编辑');
  const round = h.rounds()[0]; assert.equal(round.items.length, 0); assert.equal(round.groups.length, 5);
  assert.equal(h.field('submissionCount'), 1); assert.equal(h.field('history')[0].revisionRoundId, round.id);
  const fresh = harness(h.stored); assert.ok(fresh.rounds()[0].groups.some(group => group.name === '审稿人 3'));
});

test('default groups can be renamed or removed even before the first opinion', () => {
  const h = harness(); h.context.renameRevisionGroup('paper1', null, 'geditor001', '责任编辑');
  assert.equal(h.rounds()[0].groups[0].name, '责任编辑');
  const id = h.rounds()[0].id; h.context.deleteRevisionGroup('paper1', null, 'greviewer02');
  assert.equal(h.rounds()[0].id, id); assert.equal(h.rounds()[0].groups.length, 2); assert.equal(h.field('submissionCount'), 1);
  assert.match(h.run('renderRevisionPapers()'), /renameRevisionGroup\('paper1', null, 'geditor001'/);
});

test('empty, oversized, reserved and case-insensitive duplicate names are rejected without writes', () => {
  const h = harness(), snapshot = JSON.stringify([...h.stored]);
  for (const name of ['', '   ', 'x'.repeat(41), '未分组', '编辑', ' 编辑 ']) h.group(name);
  assert.equal(JSON.stringify([...h.stored]), snapshot);
  h.group('Reviewer A'); const before = JSON.stringify([...h.stored]); h.group('reviewer a');
  assert.equal(JSON.stringify([...h.stored]), before); assert.equal(h.alerts.length, 7);
});

test('new opinions are created in their chosen group and keep grouping during text/status edits', () => {
  const h = harness(); h.add('greviewer01'); h.update('comment', '审稿人一的意见'); h.update('status', 'working'); h.update('response', '回复内容');
  const fresh = harness(h.stored), item = fresh.rounds()[0].items[0];
  assert.equal(item.groupId, 'greviewer01'); assert.equal(item.status, 'working'); assert.equal(item.response, '回复内容');
  assert.match(fresh.run('renderRevisionPapers()'), /审稿人 1 · 0\/1 已完成/);
});

test('moving opinions changes only group membership, never item IDs, array order or replies', () => {
  const h = harness(); h.add(); h.add('greviewer01'); h.update('comment', '原意见'); h.update('response', '原回复');
  const before = h.rounds()[0]; h.update('groupId', 'geditor001');
  const after = h.rounds()[0]; assert.equal(after.id, before.id);
  assert.deepEqual(Array.from(after.items, item => item.id), Array.from(before.items, item => item.id));
  assert.equal(after.items[0].response, '原回复'); assert.equal(after.items[0].groupId, 'geditor001');
  h.update('groupId', 'missing'); assert.equal(h.rounds()[0].items[0].groupId, 'geditor001');
});

test('group progress is separate while the round total still counts every opinion exactly once', () => {
  const h = harness(); h.add('geditor001'); h.add('geditor001'); h.add('greviewer01'); h.add();
  h.update('status', 'done', 0); h.update('status', 'done', 2);
  const markup = h.run('renderRevisionPapers()');
  assert.match(markup, /本轮返修清单 · 2\/4 已完成（50%）/);
  assert.match(markup, /编辑 · 1\/2 已完成（50%）/); assert.match(markup, /审稿人 1 · 1\/1 已完成（100%）/);
  assert.match(markup, /未分组 · 0\/1 已完成（0%）/); assert.equal((markup.match(/class="revision-item"/g) || []).length, 4);
});

test('deleting a group moves its complete opinions to unassigned; cancellation changes nothing', () => {
  const h = harness(); h.add('greviewer01'); h.update('comment', '意见'); h.update('response', '保留回复'); h.update('status', 'done');
  const before = h.rounds()[0]; h.context.confirm = () => false; h.context.deleteRevisionGroup('paper1', before.id, 'greviewer01');
  assert.equal(h.rounds()[0].groups.length, 3);
  h.context.confirm = () => true; h.context.deleteRevisionGroup('paper1', before.id, 'greviewer01');
  const after = h.rounds()[0]; assert.equal(after.groups.length, 2); assert.equal(after.items[0].groupId, '');
  assert.equal(after.items[0].id, before.items[0].id); assert.equal(after.items[0].response, '保留回复'); assert.equal(after.items[0].status, 'done');
  assert.match(h.run('renderRevisionPapers()'), /未分组 · 1\/1 已完成/);
});

test('deleted default groups do not return after refresh or after creating more opinions', () => {
  const h = harness(); h.add();
  for (const id of ['geditor001', 'greviewer01', 'greviewer02']) h.context.deleteRevisionGroup('paper1', null, id);
  const fresh = harness(h.stored); fresh.add(); assert.equal(fresh.rounds()[0].groups.length, 0);
  assert.match(fresh.run('renderRevisionPapers()'), /未分组 · 0\/2 已完成/);
  assert.doesNotMatch(fresh.run('renderRevisionPapers()'), /审稿人 1 ·/);
});

test('group customization is isolated by submission round and is not copied on resubmission', () => {
  const h = harness(); h.group('匿名审稿人'); const old = h.rounds()[0], custom = old.groups.at(-1);
  h.add(custom.id); h.context.setSubmissionStatus('paper1', 'resubmitted'); h.add('greviewer02');
  assert.equal(h.rounds().length, 2); assert.equal(h.rounds()[0].groups.length, 4); assert.equal(h.rounds()[1].groups.length, 3);
  assert.equal(h.rounds()[0].items[0].groupId, custom.id); assert.equal(h.rounds()[1].items[0].groupId, 'greviewer02');
  h.context.renameRevisionGroup('paper1', 0, 'geditor001', '旧编辑');
  assert.equal(h.rounds()[0].groups[0].name, '旧编辑'); assert.equal(h.rounds()[1].groups[0].name, '编辑');
});

test('grouped opinions remain reachable in deleted-history and published archives', () => {
  const h = harness(); h.group('领域审稿人'); const group = h.rounds()[0].groups.at(-1); h.add(group.id);
  h.update('response', '归档回复'); h.context.deleteHistory('paper1', 0);
  assert.match(h.run('renderRevisionPapers()'), /领域审稿人/); h.context.moveToPublished('paper1');
  const fresh = harness(h.stored); assert.equal(fresh.rounds()[0].items[0].groupId, group.id);
  assert.match(fresh.run('renderRevisionPapers()'), /归档回复/); assert.match(fresh.run('renderRevisionPapers()'), /领域审稿人/);
});

test('Markdown export includes grouped progress and original global opinion numbers', () => {
  const h = harness(); h.add('greviewer02'); h.add('geditor001'); h.update('comment', '审稿人意见'); h.update('response', '编辑回复', 1);
  const markdown = h.run('buildRevisionChecklistMarkdown(DATA.submitted[0], getSubmissionRevisionRounds(DATA.submitted[0])[0])');
  assert.match(markdown, /## 编辑（0\/1 已完成）[\s\S]*### 意见 2/);
  assert.match(markdown, /## 审稿人 2（0\/1 已完成）[\s\S]*### 意见 1/);
  assert.ok(markdown.includes('审稿人意见')); assert.ok(markdown.includes('编辑回复'));
  assert.equal((markdown.match(/### 意见 /g) || []).length, 2);
});

test('group names are escaped, invalid IDs cannot inject attributes or hide opinions', () => {
  const h = harness(); h.group('<img src=x onerror=alert(1)>');
  const markup = h.run('renderRevisionPapers()'); assert.ok(markup.includes('&lt;img')); assert.ok(!markup.includes('<img src=x'));
  const unsafe = harness();
  unsafe.seed({ status: 'major_revision', submissionRevisionRounds: [{ id: 'rlegacy12345', groups: [{ id: "bad' onclick='alert(1)", name: 'Invalid' }], items: [{ id: 'rcomment1234', status: 'pending', groupId: 'missing', comment: '必须显示' }] }] });
  assert.equal(unsafe.rounds()[0].items[0].groupId, ''); assert.match(unsafe.run('renderRevisionPapers()'), /必须显示/);
  assert.doesNotMatch(unsafe.run('renderRevisionPapers()'), /bad' onclick/);
});

test('group expansion and current filters survive status redraws', () => {
  const h = harness(); h.add();
  const panels = [{ dataset: { revisionReviewer: 'editor' }, open: false }, { dataset: { revisionReviewer: 'unfiled' }, open: true }];
  h.context.document.querySelectorAll = selector => selector === '[data-revision-reviewer]' ? panels : [];
  h.node('searchInput').value = 'Test'; h.node('statusFilter').value = 'active'; h.update('status', 'done');
  assert.equal(panels[0].open, false); assert.equal(panels[1].open, true);
  assert.equal(h.node('searchInput').value, 'Test'); assert.equal(h.node('statusFilter').value, 'active');
});

test('todo return links open the enclosing reviewer group without changing source IDs', () => {
  const h = harness(); h.add('greviewer01'); const round = h.rounds()[0], item = round.items[0], group = { open: false }, focus = [];
  const itemNode = { dataset: { revisionItem: item.id }, closest: () => group, scrollIntoView: () => focus.push('scroll'), focus: () => focus.push('focus') };
  const panel = { dataset: { revisionRound: round.id }, open: false, querySelectorAll: () => [itemNode] };
  const card = { dataset: { paperKey: 'paper1' }, querySelectorAll: () => [panel] };
  h.context.document.querySelectorAll = () => [card];
  assert.equal(h.context.revealRevisionTodoTarget('paper1', round.id, item.id), true);
  assert.equal(group.open, true); assert.equal(panel.open, true); assert.deepEqual(focus, ['scroll', 'focus']);
});

test('invalid group operations do not create rounds or change other fields', () => {
  const h = harness(), snapshot = JSON.stringify([...h.stored]);
  h.add('missing'); h.group('New', 'missing'); h.context.renameRevisionGroup('paper1', null, 'missing', 'New');
  h.context.deleteRevisionGroup('paper1', null, 'missing'); assert.equal(JSON.stringify([...h.stored]), snapshot);
});
