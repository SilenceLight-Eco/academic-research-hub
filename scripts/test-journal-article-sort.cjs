const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '../web/app.js'), 'utf8');
function block(start, end) {
  const offset = source.indexOf(start);
  assert.ok(offset >= 0, start);
  const stop = source.indexOf(end, offset);
  assert.ok(stop > offset, end);
  return source.slice(offset, stop);
}
function harness() {
  const state = {
    trackerArticleSorts: { unread: 'discovered-newest', read: 'discovered-newest' },
    trackerArticlePages: { unread: 4, read: 3 }, trackerCollapsedGroups: { unread: false, read: false }
  };
  const stored = new Map(); let renders = 0; const scrolls = [];
  const context = vm.createContext({ state, Date, escapeHtml: String,
    trackerDisplayPreferencesKey: 'prefs', localStorage: { getItem: k => stored.get(k) || null, setItem: (k,v) => stored.set(k,v) },
    renderJournalTracker: () => { renders++; }, scrollTrackerArticleGroupToTop: group => scrolls.push(group),
    renderArticleCard: article => '<article data-id="' + article.id + '"></article>'
  });
  vm.runInContext([
    block('  function normalizeTrackerArticleSort(', '  function renderJournalTracker()'),
    block('  function restoreTrackerDisplayPreferences()', '  restoreTrackerDisplayPreferences();'),
    block('  function setTrackerArticleSort(', '  function setTrackerDiscoveryRange('),
    block('    function renderArticleGroup(', '    if (visible.length)')
  ].join('\n'), context);
  const articles = [
    { id:'old-ingestion', discovered_at:'2026-10-01T00:00Z', publication_date:'2026-10-04', updated_at:'2026-10-04T10:00Z' },
    { id:'new-ingestion', discovered_at:'2026-10-04T00:00Z', publication_date:'2020-01-01' },
    { id:'same-time', discovered_at:'2026-10-04T00:00Z', publication_date:'2022-01-01' },
    { id:'unknown', discovered_at:null, publication_date:null },
    { id:'invalid', discovered_at:'invalid', publication_date:'invalid' }
  ];
  return { context, state, stored, articles, scrolls, renders: () => renders,
    ids: mode => Array.from(context.sortTrackerArticles(articles, mode), a => a.id) };
}
test('first ingestion and publication provide distinct orders; enrichment never moves old articles', () => {
  const h = harness();
  assert.deepEqual(h.ids('discovered-newest'), ['new-ingestion','same-time','old-ingestion','unknown','invalid']);
  assert.deepEqual(h.ids('newest'), ['old-ingestion','same-time','new-ingestion','unknown','invalid']);
});
test('ascending order keeps missing dates last and preserves timestamp ties', () => {
  const h = harness();
  assert.deepEqual(h.ids('discovered-oldest'), ['old-ingestion','new-ingestion','same-time','unknown','invalid']);
  assert.deepEqual(h.ids('oldest'), ['new-ingestion','same-time','old-ingestion','unknown','invalid']);
});
test('sorting never mutates article objects or the input array', () => {
  const h = harness(); const before = JSON.stringify(h.articles);
  h.articles.forEach(Object.freeze); Object.freeze(h.articles);
  h.context.sortTrackerArticles(h.articles,'discovered-newest');
  assert.equal(JSON.stringify(h.articles), before);
});
test('preferences restore both new modes and legacy publication order independently', () => {
  const h = harness();
  h.stored.set('prefs', JSON.stringify({ version:2, sorts:{ unread:'oldest', read:'discovered-oldest' } }));
  h.context.restoreTrackerDisplayPreferences();
  assert.equal(h.state.trackerArticleSorts.unread,'oldest'); assert.equal(h.state.trackerArticleSorts.read,'discovered-oldest');
  h.context.saveTrackerDisplayPreferences();
  assert.equal(JSON.parse(h.stored.get('prefs')).sorts.read,'discovered-oldest');
  h.stored.set('prefs', JSON.stringify({ sorts:{ unread:'invalid' } }));
  h.context.restoreTrackerDisplayPreferences();
  assert.equal(h.state.trackerArticleSorts.unread,'discovered-newest');
});
test('change resets only its own page, persists, scrolls and renders without a fetch', () => {
  const h = harness(); h.context.setTrackerArticleSort('unread','discovered-oldest');
  assert.equal(h.state.trackerArticlePages.unread,1); assert.equal(h.state.trackerArticlePages.read,3);
  assert.equal(h.state.trackerArticleSorts.read,'discovered-newest');
  assert.equal(JSON.parse(h.stored.get('prefs')).sorts.unread,'discovered-oldest');
  assert.deepEqual(h.scrolls,['unread']); assert.equal(h.renders(),1);
  h.context.setTrackerArticleSort('invalid','oldest'); assert.equal(h.renders(),1);
});
test('the full result is sorted before paging; all four options are labelled clearly', () => {
  const h = harness(); const articles = Array.from({ length:31 }, (_,i) => ({ id:String(i), discovered_at:new Date(Date.UTC(2026,9,1,0,i)).toISOString(), publication_date:'2020-01-01' }));
  h.state.trackerArticlePages.unread=1;
  let html = h.context.renderArticleGroup('unread','未读文章',articles);
  const ids = html => Array.from(html.matchAll(/data-id="(\d+)"/g), m => m[1]);
  assert.deepEqual(ids(html),Array.from({length:15},(_,i)=>String(30-i)));
  assert.match(html,/第 1 \/ 3 页/); assert.match(html,/1–15 \/ 31 篇/);
  assert.match(html,/value="discovered-newest" selected/);
  for (const label of ['收录时间：最新优先','收录时间：最早优先','发表时间：最新优先','发表时间：最早优先']) assert.ok(html.includes(label));
  h.state.trackerArticlePages.unread=3;
  html = h.context.renderArticleGroup('unread','未读文章',articles);
  assert.deepEqual(ids(html),['0']); assert.match(html,/31–31 \/ 31 篇/);
});
test('empty result groups and event wiring retain original behaviour', () => {
  const h = harness(); assert.equal(h.context.renderArticleGroup('read','已读文章',[]),'');
  assert.match(source,/setTrackerArticleSort\(sortGroup, sortSelect.value\)/);
  assert.match(source,/trackerArticleSorts: \{ unread: 'discovered-newest', read: 'discovered-newest' \}/);
});
