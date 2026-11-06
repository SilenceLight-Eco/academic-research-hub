const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const staticApiSource = fs.readFileSync(path.join(__dirname, '../web/static-api.js'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, '../web/app.js'), 'utf8');
const helpers = vm.createContext({ Date, Number });
const start = staticApiSource.indexOf('  function calculateStudyProgress(');
vm.runInContext(staticApiSource.slice(start, staticApiSource.indexOf('  window.__academicCalculateStudyProgress', start)), helpers);
const calculate = helpers.calculateStudyProgress;
const dates = { start: '2026-01-01', end: '2026-01-11' };

test('progress is derived from the current date, never frozen saved percentages or day counts', () => {
  const saved = { ...dates, label: '学业进度', percent: 5, elapsed_days: 999, remain_days: 999 };
  const first = calculate(saved, '2026-01-02T12:00:00+08:00');
  const later = calculate(saved, '2026-01-06T12:00:00+08:00');
  assert.equal(first.percent, 10); assert.equal(first.elapsed_days, 1); assert.equal(first.remain_days, 9);
  assert.equal(later.percent, 50); assert.equal(later.elapsed_days, 5); assert.equal(later.remain_days, 5);
  assert.equal(saved.percent, 5, 'reading must not mutate stored data');
});

test('Beijing midnight advances exactly one calendar day, independent of partial-day rounding', () => {
  const before = calculate(dates, '2026-01-01T15:59:59Z');
  const after = calculate(dates, '2026-01-01T16:00:00Z');
  assert.equal(before.today, '2026-01-01'); assert.equal(before.elapsed_days, 0);
  assert.equal(after.today, '2026-01-02'); assert.equal(after.elapsed_days, 1);
  assert.equal(calculate(dates, '2026-01-02T23:59:59+08:00').elapsed_days, 1);
});

test('percent is bounded before enrollment and after graduation; day counts cannot be negative', () => {
  const before = calculate(dates, '2025-12-31T12:00:00+08:00');
  assert.equal(before.percent, 0); assert.equal(before.elapsed_days, 0); assert.equal(before.remain_days, 11);
  const at = calculate(dates, '2026-01-11T00:00:00+08:00');
  assert.equal(at.percent, 100); assert.equal(at.remain_days, 0);
  const after = calculate(dates, '2026-01-15T12:00:00+08:00');
  assert.equal(after.percent, 100); assert.equal(after.remain_days, 0); assert.equal(after.elapsed_days, 14);
});

test('leap years, decimal percent, missing/invalid dates and reversed ranges are handled safely', () => {
  assert.equal(calculate({ start: '2024-02-28', end: '2024-03-01' }, '2024-02-29T12:00:00+08:00').percent, 50);
  assert.equal(calculate({ start: '2026-01-01', end: '2026-01-04' }, '2026-01-02T12:00:00+08:00').percent, 33.3);
  for (const config of [{}, { start: '2026-02-30', end: '2027-01-01' }, { start: dates.end, end: dates.start }, { start: dates.start, end: dates.start }, { start: 'invalid', end: dates.end }]) {
    const result = calculate({ ...config, configured: true, percent: 80 }, '2026-01-02T12:00:00+08:00');
    assert.equal(result.configured, false); assert.equal(result.percent, 0);
  }
});

test('both overview cards update overnight without a page reload, cloud write, or repeated animation', () => {
  let now = '2026-01-02T12:00:00+08:00', animations = 0;
  const nodes = new Map();
  const context = vm.createContext({ window: { __academicCalculateStudyProgress: config => calculate(config, now) },
    state: { overview: { phd: { ...dates, percent: 99 } } }, document: { hidden: false },
    $: id => { if (!nodes.has(id)) nodes.set(id, { textContent: '', innerHTML: '', style: {} }); return nodes.get(id); },
    countUp: (node, value) => { animations++; node.textContent = value; } });
  const begin = app.indexOf('  var studyProgressRenderedDay');
  vm.runInContext(app.slice(begin, app.indexOf('  function renderOverview(', begin)), context);
  context.renderStudyProgress(true); assert.equal(animations, 2);
  assert.equal(nodes.get('#phdPercent').textContent, 10); assert.equal(nodes.get('#phdPercentMini').textContent, 10);
  now = '2026-01-03T00:00:00+08:00'; context.refreshStudyProgressForToday();
  assert.equal(nodes.get('#phdPercent').textContent, 20); assert.equal(nodes.get('#phdPercentMini').textContent, 20);
  assert.equal(nodes.get('#phdBarFill').style.width, '20%'); assert.equal(nodes.get('#phdBarMini').style.width, '20%');
  assert.match(nodes.get('#phdDays').innerHTML, /<strong>2<\/strong> 天.*<strong>8<\/strong>/);
  assert.equal(animations, 2);
  context.document.hidden = true; now = '2026-01-04T12:00:00+08:00'; context.refreshStudyProgressForToday();
  assert.equal(nodes.get('#phdPercent').textContent, 20);
  context.document.hidden = false; context.refreshStudyProgressForToday(); assert.equal(nodes.get('#phdPercent').textContent, 30);
});

test('API refresh recalculates legacy saved values without writes, and saves only dates/configuration', async () => {
  let now = Date.parse('2026-01-02T12:00:00+08:00');
  class ClockDate extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  const harnessSource = fs.readFileSync(path.join(__dirname, 'test-reference-operations.cjs'), 'utf8');
  const factory = vm.createContext({ staticApiSource, vm, structuredClone, Response, Request, Headers, URL, setTimeout, clearTimeout, Date: ClockDate, console });
  vm.runInContext(harnessSource.slice(harnessSource.indexOf('function createApiHarness('), harnessSource.indexOf('\ntest(')), factory);
  const h = factory.createApiHarness({ studyProgress: { ...dates, configured: true, percent: 1, elapsed_days: 1000, remain_days: 1000 }, todos: [{ id: 1, text: 'Keep' }] });
  const first = await (await h.get('/api/overview')).json(); assert.equal(first.phd.percent, 10);
  now = Date.parse('2026-01-06T12:00:00+08:00');
  const next = await (await h.get('/api/overview')).json(); assert.equal(next.phd.percent, 50); assert.equal(h.writeCount(), 0);
  const saved = await h.request({ ...dates, percent: 999, elapsed_days: -1000, remain_days: 999 }, '/api/study-progress');
  assert.equal(saved.status, 200); assert.equal((await saved.json()).phd.percent, 50);
  assert.deepEqual(h.readWorkspace().studyProgress, { label: '学业进度', stage: '', ...dates });
  assert.equal(h.readWorkspace().todos[0].text, 'Keep');
  const count = h.writeCount(); const invalid = await h.request({ start: '2026-02-30', end: '2027-01-01' }, '/api/study-progress');
  assert.equal(invalid.status, 422); assert.equal(h.writeCount(), count);
});

test('a synced change to graduation dates updates the progress card only when needed', () => {
  let renders = 0;
  const old = calculate(dates, '2026-01-06T12:00:00+08:00');
  const context = { window: { __academicCalculateStudyProgress: config => calculate(config, '2026-01-06T12:00:00+08:00') },
    state: { overview: { phd: old }, todos: [], journal: [] }, renderStudyProgress: () => renders++, applyResearchHubSnapshot() {} };
  const begin = app.indexOf('  function applySyncData(');
  vm.runInNewContext(app.slice(begin, app.indexOf('  function setAccount(', begin)), context);
  context.applySyncData({ studyProgress: dates }); assert.equal(renders, 0);
  context.applySyncData({ studyProgress: { ...dates, end: '2026-01-21' } });
  assert.equal(renders, 1); assert.equal(context.state.overview.phd.percent, 25);
  context.applySyncData({ studyProgress: { ...dates, end: '2026-01-21' } }); assert.equal(renders, 1);
});
