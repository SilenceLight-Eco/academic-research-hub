const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const app = fs.readFileSync(path.join(__dirname, '../web/app.js'), 'utf8');
const staticApiSource = fs.readFileSync(path.join(__dirname, '../web/static-api.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../web/paper-pipeline-v2.html'), 'utf8');
const source = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const ref = { paperKey: 'paper1', roundId: 'rround12345', itemId: 'ritem123456' };
const linkedSource = { type: 'submission-revision', ...ref };
const base = fs.readFileSync(path.join(__dirname, 'test-reference-operations.cjs'), 'utf8');
const apiFactory = vm.createContext({ staticApiSource, vm, structuredClone, Response, Request, Headers, URL, setTimeout, clearTimeout, console });
vm.runInContext(base.slice(base.indexOf('function createApiHarness('), base.indexOf("test('browser preference")), apiFactory);
function payload(overrides = {}) {
  const round = { id: ref.roundId, number: 2, journal: 'Journal B', dueAt: '2026-10-30', items: [{ id: ref.itemId, status: 'pending', comment: '补充识别检验', response: '不得覆盖', ...overrides }] };
  return { todos: [], journal: [{ content: 'Keep' }], researchHub: {
    'research-hub-cards-v1': JSON.stringify({ submitted: { added: { paper1: { _key: 'paper1', title: '原论文', submissionRevisionRounds: [round] } } } }),
    'research-hub-fields-v1': JSON.stringify({ paper1: { title: '编辑后的论文', submissionRevisionRounds: [round], history: [{ revisionRoundId: ref.roundId, revisionDueAt: '2026-11-02' }] } })
  } };
}
async function apiHarness(data = payload(), options) {
  const h = apiFactory.createApiHarness(data, options);
  // Reproduce normal workspace hydration before browser writes.
  await h.get('/api/sync');
  return { ...h, add: extra => h.request({ action: 'add-revision', accountEmail: 'test@example.com', ...ref, ...extra }, '/api/todos') };
}

test('API derives a task from the saved opinion and inherits its current round deadline', async () => {
  const h = await apiHarness(), result = await (await h.add({ text: 'untrusted replacement', deadline: 'bad' })).json();
  assert.equal(result.ok, true); assert.equal(result.status, 'added');
  const todo = h.readWorkspace().todos[0];
  assert.match(todo.text, /编辑后的论文.*第 2 次投稿意见 1：补充识别检验/);
  assert.equal(todo.deadline, '2026-11-02'); assert.equal(todo.done, false);
  assert.deepEqual(todo.source, linkedSource); assert.equal(h.readWorkspace().journal[0].content, 'Keep');
  const fields = JSON.parse(h.readWorkspace().researchHub['research-hub-fields-v1']);
  assert.equal(fields.paper1.submissionRevisionRounds[0].items[0].response, '不得覆盖');
});

test('duplicate clicks and retries after refresh never create a second task or reopen a completed todo', async () => {
  const h = await apiHarness(); await h.add();
  const id = h.readWorkspace().todos[0].id, writes = h.writeCount();
  assert.equal((await (await h.add()).json()).status, 'duplicate'); assert.equal(h.writeCount(), writes);
  await h.request({ action: 'toggle', id }, '/api/todos');
  const fresh = await apiHarness(h.readWorkspace());
  const result = await (await fresh.add()).json();
  assert.equal(result.status, 'duplicate'); assert.equal(result.todos.length, 1); assert.equal(result.todos[0].done, true);
  assert.equal(fresh.writeCount(), 0);
});

test('different opinions and rounds get separate tasks, with collision-safe numeric IDs', async () => {
  const data = payload(), fields = JSON.parse(data.researchHub['research-hub-fields-v1']);
  fields.paper1.submissionRevisionRounds.push({ id: 'rround99999', number: 3, items: [{ id: ref.itemId, status: 'working', comment: '新一轮意见' }] });
  data.researchHub['research-hub-fields-v1'] = JSON.stringify(fields);
  const h = await apiHarness(data); await h.add(); await h.add({ roundId: 'rround99999' });
  const todos = h.readWorkspace().todos;
  assert.equal(todos.length, 2); assert.notEqual(todos[0].id, todos[1].id);
  assert.notEqual(todos[0].source.roundId, todos[1].source.roundId);
});

test('a deleted task may be created again without deleting or completing the source opinion', async () => {
  const h = await apiHarness(); await h.add();
  await h.request({ action: 'delete', id: h.readWorkspace().todos[0].id }, '/api/todos');
  assert.equal((await (await h.add()).json()).status, 'added'); assert.equal(h.readWorkspace().todos.length, 1);
  assert.equal(JSON.parse(h.readWorkspace().researchHub['research-hub-fields-v1']).paper1.submissionRevisionRounds[0].items[0].status, 'pending');
});

test('invalid, deleted, completed and empty sources are rejected without writes', async () => {
  for (const extra of [{ paperKey: 'missing' }, { roundId: 'rmissing123' }, { itemId: 'rmissing123' }, { roundId: "bad'" }, { accountEmail: 'other@example.com' }]) {
    const h = await apiHarness(); const result = await h.add(extra); assert.ok(result.status >= 400); assert.equal(h.writeCount(), 0);
  }
  for (const override of [{ status: 'done' }, { comment: '   ' }]) {
    const h = await apiHarness(payload(override)); const result = await h.add(); assert.equal(result.status, 422); assert.equal(h.writeCount(), 0);
  }
  const guest = await apiHarness(payload(), { signedOut: true }); assert.equal((await guest.add()).status, 401);
});

test('cloud save errors are not reported as task success', async () => {
  const h = await apiHarness(payload(), { failWrites: true });
  const result = await (await h.add()).json(); assert.notEqual(result.ok, true); assert.equal(h.writeCount(), 0);
});

test('archived and published opinions remain valid sources and invalid deadlines are omitted', async () => {
  const data = payload(), cards = JSON.parse(data.researchHub['research-hub-cards-v1']), fields = JSON.parse(data.researchHub['research-hub-fields-v1']);
  cards.published = cards.submitted; delete cards.submitted;
  fields.paper1.history = []; fields.paper1.submissionRevisionRounds[0].dueAt = '2026-02-31';
  data.researchHub['research-hub-cards-v1'] = JSON.stringify(cards); data.researchHub['research-hub-fields-v1'] = JSON.stringify(fields);
  const h = await apiHarness(data); assert.equal((await (await h.add()).json()).status, 'added');
  assert.equal(h.readWorkspace().todos[0].deadline, '');
});

function parentHarness() {
  const calls = [], opened = [], notices = [], frame = { contentWindow: {} };
  const context = vm.createContext({ window: {}, account: { email: 'test@example.com' }, state: { todos: [], panel: 'research-hub' },
    $: () => frame, autoSaveDraftAccountKey: () => context.account?.email || 'local',
    api: async (_url, options) => { calls.push({ type: 'api', body: JSON.parse(options.body) }); return { ok: true, status: 'added', todos: [{ id: 1, source: linkedSource }] }; },
    renderTodos() {}, renderDashboardTodos() {}, updateTodoBadge() {}, renderTodayBoard() {},
    projectPaperTargets: () => [{ id: 'paper1', kind: 'submitted', item: { submissionRevisionRounds: [{ id: ref.roundId, items: [{ id: ref.itemId }] }] } }],
    toast: text => notices.push(text), afterCurrentEditorSaved: (_panel, fn) => fn(),
    openPipelinePaper: (...args) => opened.push(args), Promise, Map, Error
  });
  context.window.__academicSavePipeline = async () => { calls.push({ type: 'save' }); return { scope: 'cloud' }; };
  const start = app.indexOf('  // ===== 返修意见与待办联动 =====');
  vm.runInContext(app.slice(start, app.indexOf('  // ===== 操作：日志 =====', start)), context);
  return { context, calls, opened, notices, frame, add: () => context.window.__academicAddRevisionTodo(frame.contentWindow, ref) };
}

test('parent validates frame/login, saves pipeline before creating task, and coalesces double clicks', async () => {
  const h = parentHarness();
  await assert.rejects(h.context.window.__academicAddRevisionTodo({}, ref), /来源无效/);
  h.context.account = null; await assert.rejects(h.add(), /请先登录/); h.context.account = { email: 'test@example.com' };
  const first = h.add(), second = h.add(); assert.equal(first, second); await first;
  assert.deepEqual(h.calls.map(call => call.type), ['save', 'api']); assert.equal(h.calls[1].body.accountEmail, 'test@example.com');
  assert.equal(h.context.state.todos.length, 1);
});

test('parent does not create tasks after failed sync, account changes, or unconfirmed saves', async () => {
  const h = parentHarness(); h.context.window.__academicSavePipeline = async () => { throw new Error('Sync failed'); };
  await assert.rejects(h.add(), /Sync failed/); assert.equal(h.calls.length, 0);
  h.context.window.__academicSavePipeline = async () => { h.context.account = { email: 'new@example.com' }; return { scope: 'cloud' }; };
  await assert.rejects(h.add(), /账号已切换/); assert.equal(h.calls.length, 0);
  h.context.window.__academicSavePipeline = async () => ({ scope: 'local' });
  await assert.rejects(h.add(), /先同步/); assert.equal(h.calls.length, 0);
});

test('todo return entry locates the exact opinion; deleted sources degrade safely', async () => {
  const h = parentHarness(); await h.add(); h.context.openRevisionTodo(1);
  assert.equal(h.opened[0][0], 'revision'); assert.equal(h.opened[0][1], 'paper1');
  assert.equal(h.opened[0][2].itemId, ref.itemId); assert.equal(h.opened[0][2].roundId, ref.roundId);
  h.context.projectPaperTargets = () => [{ id: 'paper1', kind: 'published', item: {} }];
  h.context.openRevisionTodo(1); assert.equal(h.opened[1][0], 'revision'); assert.equal(h.opened[1][2], null);
  assert.match(h.notices.at(-1), /意见已删除/);
  h.context.projectPaperTargets = () => []; h.context.openRevisionTodo(1); assert.equal(h.opened.length, 2); assert.match(h.notices.at(-1), /论文已删除/);
});

function childHarness() {
  const statusBase = fs.readFileSync(path.join(__dirname, 'test-submission-status.cjs'), 'utf8');
  const factory = vm.createContext({ source, vm, Date, console, require });
  vm.runInContext(statusBase.slice(statusBase.indexOf('function harness('), statusBase.indexOf("test('entire pipeline")), factory);
  const h = factory.harness(), calls = [], feedback = { textContent: '' };
  h.context.location = { origin: 'https://example.test' };
  h.context.setTimeout = setTimeout; h.context.clearTimeout = clearTimeout;
  h.seed(); h.context.addRevisionItem('paper1', null);
  const round = h.field('submissionRevisionRounds')[0], item = round.items[0];
  h.context.updateRevisionItem('paper1', round.id, item.id, 'comment', '补充检验');
  h.context.window.parent = { postMessage() {}, __academicAddRevisionTodo: async (_source, reference) => { calls.push(reference); return { ok: true, status: 'added' }; } };
  h.context.window.__academicPipelineFlushLocalWrites = () => calls.push('flush');
  const button = { disabled: false, textContent: '', parentElement: { querySelector: () => feedback } };
  return { ...h, calls, feedback, button, round, item, add: () => h.context.addRevisionTodo('paper1', round.id, item.id, button) };
}

test('child add shows progress, prevents duplicates and reports confirmed results inline', async () => {
  const h = childHarness(); let release;
  h.context.window.parent.__academicAddRevisionTodo = () => new Promise(resolve => { release = resolve; });
  const first = h.add(); assert.equal(h.button.disabled, true); assert.equal(h.button.textContent, '正在加入…');
  await h.add(); release({ ok: true, status: 'duplicate' }); await first;
  assert.equal(h.button.disabled, false); assert.match(h.feedback.textContent, /不重复创建/);
});

test('child refuses completed/empty opinions and permits retry after errors', async () => {
  const h = childHarness(); h.context.window.parent.__academicAddRevisionTodo = async () => { throw new Error('Network error'); };
  await h.add(); assert.match(h.feedback.textContent, /Network error/); assert.equal(h.button.disabled, false);
  h.context.window.parent.__academicAddRevisionTodo = async () => ({ ok: true, status: 'added' }); await h.add(); assert.match(h.feedback.textContent, /已加入待办/);
  h.context.updateRevisionItem('paper1', h.round.id, h.item.id, 'comment', ''); await h.add(); assert.match(h.feedback.textContent, /先填写/);
  h.context.updateRevisionItem('paper1', h.round.id, h.item.id, 'status', 'done'); await h.add(); assert.match(h.feedback.textContent, /仅未完成/);
});

test('navigation reveals an archived opinion by stable IDs, never by mutable index', () => {
  const h = childHarness(), focus = [];
  const item = { dataset: { revisionItem: h.item.id }, scrollIntoView: value => focus.push(value.block), focus: () => focus.push('focus') };
  const panel = { dataset: { revisionRound: h.round.id }, open: false, querySelectorAll: () => [item] };
  const card = { dataset: { paperKey: 'paper1' }, querySelectorAll: () => [panel] };
  h.context.document.querySelectorAll = () => [card];
  assert.equal(h.context.revealRevisionTodoTarget('paper1', h.round.id, h.item.id), true);
  assert.equal(panel.open, true); assert.deepEqual(focus, ['center', 'focus']);
  assert.equal(h.context.revealRevisionTodoTarget('paper1', 'missing', h.item.id), false);
});

test('a timeout unlocks the child for safe retry rather than leaving it stuck saving', async () => {
  const h = childHarness(); let timeout;
  h.context.setTimeout = fn => { timeout = fn; return 1; }; h.context.clearTimeout = () => {};
  h.context.window.parent.__academicAddRevisionTodo = () => new Promise(() => {});
  const pending = h.add(); timeout(); await pending;
  assert.equal(h.button.disabled, false); assert.match(h.feedback.textContent, /尚未收到保存确认/);
});

test('local storage errors and standalone use do not dispatch task creation', async () => {
  const h = childHarness(); h.context.window.__academicPipelineFlushLocalWrites = () => { throw new Error('Storage full'); };
  await h.add(); assert.match(h.feedback.textContent, /Storage full/); assert.equal(h.calls.length, 0);
  h.context.window.parent = h.context.window; await h.add(); assert.match(h.feedback.textContent, /从学术工作台打开/);
});

test('account change during task save does not apply old-account todos to the new UI', async () => {
  const h = parentHarness(); let release;
  h.context.api = () => new Promise(resolve => { release = resolve; });
  const pending = h.add(); await Promise.resolve(); await Promise.resolve();
  h.context.account = { email: 'other@example.com' }; release({ ok: true, status: 'added', todos: [{ id: 2 }] });
  await assert.rejects(pending, /账号已切换/); assert.equal(h.context.state.todos.length, 0);
});

test('todo cards expose escaped deadline and return control; completion actions stay independent', () => {
  const h = parentHarness(), nodes = { '#todoBoard': { innerHTML: '' } };
  h.context.$ = key => nodes[key]; h.context.HS_ICONS = { check: '' }; h.context.pomoCounts = {}; h.context.focusPreset = 25;
  h.context.escapeHtml = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const start = app.indexOf('  function renderTodos()');
  vm.runInContext(app.slice(start, app.indexOf('\n  function ', start + 5)), h.context);
  h.context.state.todos = [{ id: 1, text: '<script>', deadline: '<unsafe>', source: linkedSource, priority: '普通', done: true }];
  h.context.renderTodos(); const markup = nodes['#todoBoard'].innerHTML;
  assert.match(markup, /返回返修意见/); assert.match(markup, /data-action="open-revision"/); assert.match(markup, /&lt;unsafe>/);
  assert.doesNotMatch(markup, /<script>/); assert.match(app, /open-revision'\) openRevisionTodo\(id\)/);
});
