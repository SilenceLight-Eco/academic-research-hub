const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../web/app.js'), 'utf8');
function functionSource(name) {
  const start = source.indexOf('  function ' + name + '(');
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf('\n  function ', start + 1));
}
function harness() {
  const nodes = new Map(), events = {};
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { value: '', innerHTML: '', textContent: '', dataset: {}, focus() { this.focused = true; }, addEventListener(type, callback) { events[id + ':' + type] = callback; } });
    return nodes.get(id);
  };
  let writes = 0;
  const context = vm.createContext({
    state: { variableId: 'other', variableQuery: '', variableSearchMode: 'name', variableCategoryFilter: '核心解释变量', variableSearchCollapsedRoles: {}, variableLibrary: { items: [
      { id: 'partial', name: '绿色创新质量', role: ['核心解释变量'] },
      { id: 'exact', name: '绿色创新', role: ['被解释变量'] },
      { id: 'other', name: '企业规模', symbol: 'Size', role: ['控制变量'], definition: '绿色创新研究的公司规模', measureReferences: [{ role: ['控制变量'], measures: ['自然对数'], source: 'CSMAR', papers: ['Smith (2026)'], instrumentVariables: ['港口距离'] }] },
      { id: 'same', name: '绿色创新', role: ['控制变量'] },
      { id: 'code', name: 'C++', role: ['核心解释变量'] },
      { id: 'unsafe', name: '<img src=x onerror=alert(1)>', role: ['核心解释变量'] }
    ], trash: [{ item: { name: '绿色创新' } }, { item: { name: '仅回收站' } }] } },
    variableRoles: ['被解释变量', '核心解释变量', '控制变量', '其他'],
    variableCollapsedRoles: { 被解释变量: true, 核心解释变量: true, 控制变量: true },
    variableCollapsedStorageKey: 'test-collapse',
    localStorage: { setItem() { writes++; } },
    $: node,
    escapeHtml: value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
    renderVariableLibrary() { throw Error('Searching must not redraw the editor'); }
  });
  for (const name of ['normalizeVariableRoles', 'displayVariableRoleText', 'normalizedVariableMeasureReferences', 'normalizeVariableSearchText', 'variableNameMatches', 'searchVariableItems', 'renderVariableNavigation', 'updateVariableSearch', 'toggleVariableRole']) vm.runInContext(functionSource(name), context);
  const start = source.indexOf("    $('#variableSearch').addEventListener('input'");
  vm.runInContext(source.slice(start, source.indexOf("    $('#variableCategories').addEventListener", start)), context);
  return { context, node, events, writes: () => writes, search: (query, mode) => context.searchVariableItems(context.state.variableLibrary.items, query, mode) };
}
const ids = result => Array.from(result.visible, item => item.id);
test('name lookup searches every role and ranks exact names before partial names', () => {
  const h = harness(), result = h.search('绿色创新', 'name');
  assert.deepEqual(ids(result), ['exact', 'same', 'partial']);
  assert.equal(result.exact.length, 2);
  assert.deepEqual(ids(h.search('绿色创新', 'exact')), ['exact', 'same']);
});
test('exact name and legacy symbol lookup normalize case, full width and whitespace without fuzzy matching', () => {
  const h = harness();
  assert.deepEqual(ids(h.search('  ＳＩＺＥ  ', 'exact')), ['other']);
  assert.deepEqual(ids(h.search('C++', 'exact')), ['code']);
  assert.equal(h.search('绿色 创新', 'exact').exact.length, 0);
  assert.deepEqual(ids(h.search('绿色创', 'exact')), []);
  assert.deepEqual(ids(h.search('不存在', 'name')), []);
});
test('full-content mode includes definitions, data sources, measures, instruments and citations', () => {
  const h = harness();
  for (const query of ['自然对数', 'CSMAR', '港口距离', 'Smith 2026']) assert.deepEqual(ids(h.search(query, 'all')), ['other']);
  assert.deepEqual(ids(h.search('绿色创新', 'all')), ['exact', 'same', 'partial', 'other']);
  assert.equal(h.search('自然对数', 'name').visible.length, 0);
});
test('lookup reports live exact matches separately from the recycle bin', () => {
  const h = harness(); h.context.updateVariableSearch('绿色创新');
  assert.match(h.node('#variableSearchSummary').textContent, /已存在 2 个同名变量；匹配 3 个/);
  assert.match(h.node('#variableSearchSummary').textContent, /回收站另有 1 个同名变量/);
  h.context.updateVariableSearch('仅回收站');
  assert.match(h.node('#variableSearchSummary').textContent, /现有变量中未找到同名变量；匹配 0 个/);
  assert.match(h.node('#variableList').innerHTML, /没有匹配的变量/);
});
test('search opens matched groups and labels exact names while leaving browse preferences unchanged', () => {
  const h = harness(); h.context.updateVariableSearch('绿色创新');
  const html = h.node('#variableList').innerHTML;
  assert.doesNotMatch(html, /class="variable-role-items" hidden/);
  assert.equal((html.match(/class="variable-search-exact"/g) || []).length, 2);
  h.context.toggleVariableRole('被解释变量'); h.context.renderVariableNavigation();
  assert.match(h.node('#variableList').innerHTML, /class="variable-role-items" hidden/);
  assert.equal(h.context.variableCollapsedRoles.被解释变量, true); assert.equal(h.writes(), 0);
  h.context.updateVariableSearch('企业规模');
  assert.doesNotMatch(h.node('#variableList').innerHTML, /class="variable-role-items" hidden/);
});
test('search and clearing do not change selected variable or overwrite unsaved editor fields', () => {
  const h = harness(); h.node('#variableName').value = 'Unsaved name'; h.node('#variableDefinition').value = 'Unsaved definition';
  const before = JSON.stringify(h.context.state.variableLibrary);
  h.context.updateVariableSearch('绿色创新'); h.context.updateVariableSearch('');
  assert.equal(h.context.state.variableId, 'other');
  assert.equal(h.node('#variableName').value, 'Unsaved name'); assert.equal(h.node('#variableDefinition').value, 'Unsaved definition');
  assert.equal(JSON.stringify(h.context.state.variableLibrary), before); assert.equal(h.writes(), 0);
  assert.equal(h.node('#variableSearchClear').hidden, true);
});
test('rendered matches escape names in labels and tooltips', () => {
  const h = harness(); h.context.updateVariableSearch('<img');
  const html = h.node('#variableList').innerHTML;
  assert.doesNotMatch(html, /<img src/); assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});
test('Chinese composition waits until completion and mode switching updates results without navigation', () => {
  const h = harness(), input = h.node('#variableSearch'); input.value = '绿色';
  h.events['#variableSearch:input'].call(input, { isComposing: true }); assert.equal(h.context.state.variableQuery, '');
  h.events['#variableSearch:compositionend'].call(input); assert.equal(h.context.state.variableQuery, '绿色');
  h.events['#variableSearchMode:change'].call({ value: 'exact' });
  assert.match(h.node('#variableSearchSummary').textContent, /匹配 0 个/);
  h.events['#variableSearchClear:click'](); assert.equal(input.value, ''); assert.equal(input.focused, true);
});
test('trash view never performs hidden active-library navigation', () => {
  const h = harness(); h.context.state.variableTrashOpen = true;
  h.context.updateVariableSearch('绿色创新'); assert.equal(h.context.state.variableQuery, ''); assert.equal(h.context.state.variableId, 'other');
});
test('no-query browsing still applies its role filter and default collapse can be expanded on first click', () => {
  const h = harness(); assert.deepEqual(ids(h.search('', 'name')), ['partial', 'code', 'unsafe']);
  delete h.context.variableCollapsedRoles.其他;
  h.context.toggleVariableRole('其他'); assert.equal(h.context.variableCollapsedRoles.其他, false); assert.equal(h.writes(), 1);
});
