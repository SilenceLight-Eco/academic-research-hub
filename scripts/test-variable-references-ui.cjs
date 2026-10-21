const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../web/app.js'), 'utf8');

function functionSource(name) {
  const start = source.indexOf('  function ' + name + '(');
  assert.ok(start >= 0, name);
  const end = source.indexOf('\n  function ', start + 1);
  return source.slice(start, end);
}
function harness() {
  const nodes = new Map(), events = {};
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { innerHTML: '', focus() {}, addEventListener(type, callback) { events[id + ':' + type] = callback; } });
    return nodes.get(id);
  };
  let saves = 0;
  const context = vm.createContext({
    state: { variableId: 'v1', referenceLibrary: { items: [
      { id: 'r1', title: 'Old paper', updated: '2026-10-19' },
      { id: 'r2', title: 'New paper', authors: 'Smith', year: '2026', updated: '2026-10-21' },
      { id: 'r3', title: 'Third paper', updated: '2026-10-20' },
      { id: 'r4', title: 'Older paper', updated: '2026-10-18' }
    ] } },
    variableRoles: ['被解释变量', '控制变量'],
    normalizeVariableRoles: value => Array.isArray(value) ? value : [value || '被解释变量'],
    escapeHtml: value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
    $: (selector, scope) => scope && scope.find ? scope.find(selector) : node(selector),
    $$: (selector, scope) => scope && scope.findAll ? scope.findAll(selector) : [],
    queueVariableAutoSave() { saves++; }, resizeVariableMeasureTextarea() {},
    addVariableMeasureReference() {},
    window: { addEventListener() {} }, document: { addEventListener() {} },
    api() { throw new Error('Reference-library API must not be called'); }
  });
  for (const name of ['referenceCitationLabel', 'latestVariableReferences', 'variableRecentReferenceOptions', 'openVariableRecentReferences', 'renderVariableMeasureReferences', 'readVariableMeasureReferences', 'addVariableReferenceOnly', 'removeVariableReferenceOnly']) vm.runInContext(functionSource(name), context);
  const start = source.indexOf("    $('#variableMeasureReferences').addEventListener('input'");
  const end = source.indexOf("    $('#refNew').addEventListener", start);
  vm.runInContext(source.slice(start, end), context);
  return { context, events, node, saves: () => saves };
}
function citationField(value, referenceId = '') {
  return { value, dataset: referenceId ? { variablePaperReferenceId: referenceId, variablePaperLinkedText: value } : {}, focus() { this.focused = true; } };
}

test('reference inputs no longer render a library association selector or linked detail card', () => {
  const h = harness();
  h.context.renderVariableMeasureReferences([{ papers: ['Saved citation', '<script>alert(1)</script>'], paperReferenceIds: ['r1', 'r2'] }], false);
  const html = h.node('#variableMeasureReferences').innerHTML;
  assert.doesNotMatch(html, /关联文献库条目|<select|data-variable-reference-open|data-variable-paper-new/);
  assert.match(html, /value="Saved citation"/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /data-variable-reference-new="0"/);
  assert.match(html, /data-variable-reference-recent-show/);
  assert.match(html, /data-variable-reference-remove-paper="0"/);
  assert.equal((html.match(/data-variable-reference-pick=/g) || []).length, 6);
  assert.ok(!html.includes('>Older paper</button>'));
});
test('disabled and empty reference editors keep their existing protections', () => {
  const h = harness(); h.context.renderVariableMeasureReferences([], true);
  const html = h.node('#variableMeasureReferences').innerHTML;
  assert.match(html, /data-variable-paper="0"[^>]* disabled/);
  assert.match(html, /data-variable-reference-new="0"[^>]* disabled/);
  assert.equal(h.node('#variableMeasureReferenceAdd').disabled, true);
});
test('recent reference selection copies citation text, autosaves and does not create an association', () => {
  const h = harness(), field = citationField('Old text', 'r1'), menu = { hidden: false };
  const row = { find: selector => selector === '[data-variable-paper]' ? field : menu, classList: { remove() {} } };
  const pick = { dataset: { variableReferencePick: 'r2' }, closest: () => row };
  h.events['#variableMeasureReferences:click']({ target: { closest: selector => selector === '[data-variable-reference-pick]' ? pick : null } });
  assert.equal(field.value, 'Smith (2026). New paper');
  assert.equal(field.dataset.variablePaperReferenceId, undefined);
  assert.equal(field.dataset.variablePaperLinkedText, undefined);
  assert.equal(menu.hidden, true); assert.equal(field.focused, true); assert.equal(h.saves(), 1);
});
test('manual typing and leaving the field do not add records to the reference library', () => {
  const h = harness(), field = citationField('Original text', 'r1'); field.value = 'Edited text';
  field.closest = selector => selector === '[data-variable-paper]' ? field : null;
  field.matches = selector => selector.includes('[data-variable-paper]');
  h.events['#variableMeasureReferences:input']({ target: field });
  h.events['#variableMeasureReferences:change']({ target: field });
  h.events['#variableMeasureReferences:focusout']({ target: field });
  assert.equal(field.dataset.variablePaperReferenceId, undefined); assert.equal(h.saves(), 2);
  assert.equal(h.context.state.referenceLibrary.items.length, 4);
  assert.ok(!source.includes('function createVariableReference('));
});
test('saving retains citation text and legacy metadata only when the text is unchanged', () => {
  const h = harness(), fields = [citationField('Existing citation', 'r1'), citationField('Old citation', 'r2'), citationField('Manual citation')];
  fields[1].value = 'Edited citation';
  const row = { find: () => ({ value: 'Data source' }), findAll: selector => selector.startsWith('[data-variable-paper=') ? fields : selector.includes(':checked') ? [{ value: '控制变量' }] : [] };
  h.node('#variableMeasureReferences').findAll = () => [row];
  const entries = h.context.readVariableMeasureReferences();
  assert.deepEqual(Array.from(entries[0].papers), ['Existing citation', 'Edited citation', 'Manual citation']);
  assert.deepEqual(Array.from(entries[0].paperReferenceIds), ['r1', '', '']);
  assert.equal(entries[0].source, 'Data source');
});
test('new reference adds only an inline input and deletion preserves remaining citations', () => {
  const h = harness();
  const entries = [{ papers: ['First', 'Second', 'Third'], paper: 'First', paperReferenceIds: ['r1', 'r2', 'r3'] }];
  let rendered;
  h.context.readVariableMeasureReferences = () => entries;
  h.context.renderVariableMeasureReferences = value => { rendered = value; };
  h.context.addVariableReferenceOnly(0);
  assert.deepEqual(entries[0].papers, ['First', 'Second', 'Third', '']);
  h.context.removeVariableReferenceOnly(0, 1);
  assert.deepEqual(entries[0].papers, ['First', 'Third', '']);
  assert.deepEqual(entries[0].paperReferenceIds, ['r1', 'r3']);
  assert.equal(rendered, entries); assert.equal(h.saves(), 2);
});
test('focusing any reference field opens the latest three saved references, including a newly saved record', () => {
  const h = harness(), menu = { hidden: true }, field = citationField('Manual text');
  const row = { find: () => menu, classList: { add() {} } };
  field.closest = selector => selector === '[data-variable-paper]' ? field : row;
  h.context.state.referenceLibrary.items.push({ id: 'r5', title: 'Most recent', updated: '2026-10-22' });
  h.events['#variableMeasureReferences:focusin']({ target: field });
  assert.equal(menu.hidden, false); assert.equal(field.value, 'Manual text');
  assert.equal((menu.innerHTML.match(/data-variable-reference-pick=/g) || []).length, 3);
  assert.ok(menu.innerHTML.indexOf('Most recent') < menu.innerHTML.indexOf('New paper'));
  assert.ok(!menu.innerHTML.includes('Old paper')); assert.equal(h.saves(), 0);
});
test('explicit recent-reference button opens the picker without reintroducing an association selector', () => {
  const h = harness(), field = citationField('Existing'), menu = { hidden: true };
  const row = { find: selector => selector === '[data-variable-paper]' ? field : menu, classList: { add() {} } };
  field.closest = () => row;
  const button = { closest: () => row };
  h.events['#variableMeasureReferences:click']({ target: { closest: selector => selector === '[data-variable-reference-recent-show]' ? button : null } });
  assert.equal(menu.hidden, false); assert.equal(field.focused, true); assert.equal(field.value, 'Existing'); assert.equal(h.saves(), 0);
  assert.doesNotMatch(menu.innerHTML, /<select|关联文献库条目/);
});
test('blank library and disabled fields remain safe and recent suggestions stay in normal layout flow', () => {
  const h = harness(), field = citationField('Existing');
  h.context.state.referenceLibrary.items = [];
  assert.match(h.context.variableRecentReferenceOptions(), /可直接手动填写/);
  field.disabled = true; field.closest = () => { throw Error('Disabled field must not open'); };
  h.context.openVariableRecentReferences(field);
  const css = fs.readFileSync(path.join(__dirname, '../web/style.css'), 'utf8');
  assert.match(css, /\.variable-reference-recent \{ position:relative;/);
});
