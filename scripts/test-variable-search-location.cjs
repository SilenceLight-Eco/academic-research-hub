const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../web/app.js'), 'utf8');
const prior = fs.readFileSync(path.join(__dirname, 'test-variable-search.cjs'), 'utf8');
const root = vm.createContext({ source, assert, vm });
vm.runInContext(prior.slice(prior.indexOf('function functionSource('), prior.indexOf('\nconst ids =')), root);

function harness(options = {}) {
  const h = root.harness(), ctx = h.context, nodes = new Map(), toasts = [], saves = [];
  let renders = 0;
  ctx.account = { id: 'owner' }; ctx.state.panel = 'variable-library'; ctx.state.variableSearchMode = 'all';
  ctx.state.variableQuery = '命中';
  ctx.state.variableLibrary.items.find(item => item.id === 'other').measureReferences.push({ role: ['控制变量'], measures: ['前言\n命中 A；命中 B', '另一个命中'], source: '原始\n  命中来源', papers: ['命中文献'], instrumentVariables: ['命中工具'] });
  function field(value) {
    const classes = new Set();
    return { value, classList: { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name) },
      focus() { this.focused = true; }, setSelectionRange(start, end) { this.selection = [start, end]; }, scrollIntoView() { this.scrolled = true; } };
  }
  function render() {
    renders++; nodes.clear();
    const item = ctx.activeVariable(); if (!item) return;
    nodes.set('#variableName', field(item.name || '')); nodes.set('#variableDefinition', field(item.definition || ''));
    const groups = ctx.normalizedVariableMeasureReferences(item);
    groups.forEach((group, g) => {
      nodes.set(`[data-variable-source="${g}"]`, field(group.source));
      nodes.set(`[data-variable-role="${g}"]:checked`, field(group.role[0]));
      for (const [kind, values] of [['measure', group.measures], ['paper', group.papers], ['instrument', group.instrumentVariables]]) values.forEach((value, i) => nodes.set(`[data-variable-${kind}="${g}"][data-variable-${kind}-index="${i}"]`, field(value)));
    });
  }
  ctx.$ = selector => {
    const node = nodes.has(selector) ? nodes.get(selector) : h.node(selector);
    if (!node.classList) { node.classList = field('').classList; node.scrollIntoView = function () { this.scrolled = true; }; }
    return node;
  };
  ctx.$$ = selector => selector === '.variable-search-location-focus' ? Array.from(nodes.values()).filter(node => node.classList.contains('variable-search-location-focus')) : [];
  ctx.readVariablePayload = () => {
    const item = ctx.activeVariable();
    const groups = ctx.normalizedVariableMeasureReferences(item);
    groups.forEach((group, g) => {
      group.source = ctx.$(`[data-variable-source="${g}"]`).value;
      for (const [kind, name] of [['measure', 'measures'], ['paper', 'papers'], ['instrument', 'instrumentVariables']]) group[name] = group[name].map((_value, i) => ctx.$(`[data-variable-${kind}="${g}"][data-variable-${kind}-index="${i}"]`).value);
    });
    return { id: item.id, name: ctx.$('#variableName').value, definition: ctx.$('#variableDefinition').value, measureReferences: groups };
  };
  ctx.renderVariableLibrary = () => { render(); ctx.refreshVariableSearchLocation(); };
  ctx.toast = text => toasts.push(text);
  ctx.afterCurrentEditorSaved = async (panel, callback) => { saves.push(panel); try { if (options.flush) await options.flush(); callback(); } catch (_) { /* Existing autosave handler retains failed edits. */ } };
  for (const name of ['activeVariable', 'variableEditorSearchHits', 'variableSearchHitTarget', 'variableSearchHitIndex', 'clearVariableSearchFocus', 'refreshVariableSearchLocation', 'focusVariableSearchHit', 'moveVariableSearchHit', 'openVariableSearchResult', 'bindVariableSearchLocationEvents']) vm.runInContext(root.functionSource(name), ctx);
  const at = source.indexOf("    $('#variableList').addEventListener('click'");
  vm.runInContext(source.slice(at, source.indexOf("    $('#variableList').addEventListener('dragstart'", at)), ctx);
  ctx.bindVariableSearchLocationEvents(); render(); ctx.refreshVariableSearchLocation();
  return { ...h, ctx, field: selector => ctx.$(selector), toasts, saves, renders: () => renders };
}

test('summaries identify the exact group and added row with escaped, stable target keys', () => {
  const h = harness(), item = h.ctx.activeVariable();
  const html = h.ctx.variableSearchExcerpt(item, '另一个命中');
  assert.match(html, /data-variable-search-target="measure-1-1"/);
  assert.match(html, /记录组 2 · 衡量方式 2/);
  assert.match(h.ctx.variableSearchExcerpt(item, '命中文献'), /data-variable-search-target="paper-1-0"/);
});

test('clicking a summary in the selected variable locates original multiline text without saving or redrawing edits', async () => {
  const h = harness(), sourceInput = h.field('[data-variable-source="1"]');
  h.field('#variableName').value = '尚未保存的名称';
  const before = JSON.stringify(h.ctx.state.variableLibrary), rendered = h.renders();
  const target = { closest: selector => selector === '[data-variable-id]' ? { dataset: { variableId: 'other' } } : selector === '[data-variable-search-target]' ? { dataset: { variableSearchTarget: 'source-1' } } : null };
  h.events['#variableList:click']({ target });
  assert.deepEqual(sourceInput.selection, [5, 7]); assert.equal(sourceInput.scrolled, true);
  assert.equal(h.field('#variableName').value, '尚未保存的名称'); assert.equal(h.renders(), rendered); assert.equal(h.saves.length, 0);
  assert.equal(JSON.stringify(h.ctx.state.variableLibrary), before);
  assert.match(h.node('#variableSearchLocationStatus').textContent, /记录组 2 · 数据来源/);
});

test('previous and next traverse each occurrence, wrap in both directions, and include added measures and citations', () => {
  const h = harness(), hits = h.ctx.variableEditorSearchHits();
  assert.equal(hits.length, 6);
  h.events['#variableSearchNext:click']();
  assert.deepEqual(h.field('[data-variable-measure="1"][data-variable-measure-index="0"]').selection, [3, 5]);
  h.events['#variableSearchNext:click']();
  assert.deepEqual(h.field('[data-variable-measure="1"][data-variable-measure-index="0"]').selection, [8, 10]);
  h.ctx.focusVariableSearchHit(hits.length - 1); h.events['#variableSearchNext:click']();
  assert.equal(h.ctx.variableSearchHitIndex(h.ctx.variableEditorSearchHits()), 0);
  h.events['#variableSearchPrevious:click'](); assert.equal(h.ctx.variableSearchHitIndex(h.ctx.variableEditorSearchHits()), hits.length - 1);
  assert.match(h.node('#variableSearchLocationStatus').textContent, /第 6 \/ 6 处 · 记录组 2 · 参考文献/);
});

test('live edits recalculate hits, clear stale locations and clearing a query removes the navigation highlight', () => {
  const h = harness(); h.ctx.focusVariableSearchHit(0);
  const input = h.field('[data-variable-measure="1"][data-variable-measure-index="0"]');
  input.value = '已修改'; h.ctx.refreshVariableSearchLocation();
  assert.equal(h.ctx.state.variableSearchLocation, null); assert.equal(input.classList.contains('variable-search-location-focus'), false);
  h.ctx.updateVariableSearch('不存在'); assert.equal(h.node('#variableSearchNext').disabled, true);
  h.ctx.updateVariableSearch(''); assert.equal(h.node('#variableSearchLocationBar').hidden, true);
  assert.equal(h.field('#variableName').value, '企业规模');
});

test('hidden legacy content is shown safely as a read-only context, while name modes only count name or symbol matches', () => {
  const h = harness(); h.ctx.activeVariable().notes = '命中<script>alert(1)</script>';
  const hits = h.ctx.variableEditorSearchHits(), index = hits.findIndex(hit => hit.kind === 'notes'); h.ctx.focusVariableSearchHit(index);
  assert.equal(h.node('#variableSearchLegacyContext').hidden, false);
  assert.match(h.node('#variableSearchLegacyContext').innerHTML, /&lt;script&gt;/);
  assert.doesNotMatch(h.node('#variableSearchLegacyContext').innerHTML, /<script>/);
  h.ctx.state.variableSearchMode = 'name'; assert.equal(h.ctx.variableEditorSearchHits().length, 0);
  h.ctx.updateVariableSearch('ＳＩＺＥ'); assert.equal(h.ctx.variableEditorSearchHits().length, 1);
});

test('switching variables waits for saving, and failed or stale navigation cannot discard the current editor', async () => {
  let finish;
  const h = harness({ flush: () => new Promise(resolve => { finish = resolve; }) });
  h.ctx.state.variableQuery = '绿色';
  const opening = h.ctx.openVariableSearchResult('partial');
  assert.equal(h.ctx.state.variableId, 'other'); finish(); await opening;
  assert.equal(h.ctx.state.variableId, 'partial'); assert.deepEqual(h.field('#variableName').selection, [0, 2]);
  const failed = harness({ flush: async () => { throw new Error('offline'); } });
  failed.ctx.state.variableQuery = '绿色'; await failed.ctx.openVariableSearchResult('partial'); assert.equal(failed.ctx.state.variableId, 'other');
  const stale = harness({ flush: () => new Promise(resolve => { finish = resolve; }) });
  stale.ctx.state.variableQuery = '绿色'; const pending = stale.ctx.openVariableSearchResult('partial'); stale.ctx.account = { id: 'other-account' }; finish(); await pending;
  assert.equal(stale.ctx.state.variableId, 'other');
});

test('the last click wins and changing the query invalidates pending variable navigation', async () => {
  const pending = [];
  const h = harness({ flush: () => new Promise(resolve => pending.push(resolve)) });
  h.ctx.state.variableQuery = '绿色';
  const first = h.ctx.openVariableSearchResult('partial'), second = h.ctx.openVariableSearchResult('exact');
  pending[1](); await second; pending[0](); await first;
  assert.equal(h.ctx.state.variableId, 'exact');
  const stale = harness({ flush: () => new Promise(resolve => pending.push(resolve)) });
  stale.ctx.state.variableQuery = '绿色'; const opening = stale.ctx.openVariableSearchResult('partial');
  stale.ctx.updateVariableSearch('CSMAR'); pending[2](); await opening;
  assert.equal(stale.ctx.state.variableId, 'other');
});
