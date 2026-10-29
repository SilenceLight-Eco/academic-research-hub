const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const app = read('web/app.js'), html = read('web/workbench.html');
const panels = [...html.matchAll(/class="nav-item[^"\n]*" data-panel="([^"]+)"/g)].map(match => match[1]);
function navigation(saved, hash) {
  const calls = [];
  const context = { RETIRED_PANELS: ['entertainment'], sessionStorage: { getItem() { return saved; } }, location: { hash }, switchPanel(panel) { calls.push(panel); },
    $$(selector) { assert.equal(selector, '.nav-item'); return panels.map(panel => ({ dataset: { panel } })); },
    $(selector) { const match = selector.match(/data-panel="([^"]+)"/); return match && panels.includes(match[1]) ? {} : null; }
  };
  for (const name of ['getLastVisitedPanel','applyHash']) {
    const start = app.indexOf('  function ' + name + '('), end = app.indexOf('\n  function ', start + 3);
    vm.runInNewContext(app.slice(start,end),context);
  }
  return { context, calls };
}
test('entertainment entry, panel, runtime callback and downloadable resource loads are removed', () => {
  assert.doesNotMatch(html, /entertainment|斗地主|掼蛋|麻将|五子棋|象棋/);
  assert.doesNotMatch(app, /AcademicEntertainment|entertainment:\s*['"]娱乐/);
  assert.match(app, /RETIRED_PANELS = \[[^\]]*'entertainment'/);
  assert.doesNotMatch(read('README.md'), /娱乐（|\| 娱乐 \|/);
});
test('old entertainment bookmarks redirect to overview rather than opening a blank panel', () => {
  for (const hash of ['#entertainment','#entertainment/landlord']) {
    const h = navigation('knowledge-base',hash); assert.equal(h.context.applyHash(),true); assert.deepEqual(h.calls,['dashboard']);
  }
});
test('old saved entertainment selection falls back while academic module history remains intact', () => {
  assert.equal(navigation('entertainment','').context.getLastVisitedPanel(),'dashboard');
  for (const panel of ['knowledge-base','references','variable-library','research-hub','focus']) {
    assert.ok(panels.includes(panel)); const h = navigation(panel,'#'+panel);
    assert.equal(h.context.getLastVisitedPanel(),panel); assert.equal(h.context.applyHash(),true); assert.deepEqual(h.calls,[panel]);
  }
});
test('all entry points and paper pipeline request the new release without entertainment assets', () => {
  for (const file of ['index.html','web/index.html','web/workbench.html','web/paper-pipeline-v2.html']) assert.match(read(file),/20261029-01/);
  assert.match(html,/app\.js\?v=20261029-01/);
});
