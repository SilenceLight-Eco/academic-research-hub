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
    panel: 'dashboard', trackerArticlePages: { unread: 1, read: 1 },
    trackerArticleSorts: { unread: 'discovered-newest', read: 'discovered-newest' },
    trackerCollapsedGroups: { unread: false, read: false },
    journalTrackerReadFilter: 'all', journalTrackerFilter: 'all', trackerJournalCategoryFilter: 'all',
    trackerDiscoveryRange: 'all', trackerPublicationRange: 'all'
  };
  const articles = Array.from({ length: 31 }, (_, i) => ({ id: 'u' + i, is_read: false }));
  articles.push(...Array.from({ length: 16 }, (_, i) => ({ id: 'r' + i, is_read: true })));
  const stored = new Map(); const scrolls = []; const loads = [];
  const list = { scrollTop: 880 }; let renders = 0;
  const context = vm.createContext({
    state, Date, escapeHtml: String, trackerDisplayPreferencesKey: 'prefs',
    localStorage: { getItem: k => stored.get(k) || null, setItem: (k, v) => stored.set(k, v) },
    trackerVisibleArticles: () => articles.filter(a => state.journalTrackerReadFilter === 'all' || (state.journalTrackerReadFilter === 'read' ? a.is_read : !a.is_read)),
    renderJournalTracker: () => { renders++; }, scrollTrackerArticleGroupToTop: group => scrolls.push(group),
    renderArticleCard: article => '<article data-id="' + article.id + '"></article>',
    $: () => list, $$: () => [], window: { scrollY: 0 }, scrollMemory: {},
    RETIRED_PANELS: [], PANEL_TITLES: {}, trackerArticleDetailId: '',
    staggerCards: () => {}, refreshUnreadBadges: () => {}, positionNavInk: () => {}, syncHash: () => {}, restoreScroll: () => {}, renderTodayBoard: () => {}, loadPeerReviewReminders: () => {},
    loadTrackerReferenceFolders: () => {}, startTrackerListPolling: () => {}, stopTrackerListPolling: () => {}, hideTrackerJournalSearchResults: () => {},
    loadJournalTracker: () => { loads.push({ ...state.trackerArticlePages }); }
  });
  const blocks = [
    block('  function normalizeTrackerArticleSort(', '  function renderJournalTracker()'),
    block('  function restoreTrackerDisplayPreferences()', '  restoreTrackerDisplayPreferences();'),
    block('  function showPanel(', '  function staggerCards('),
    block('    function renderArticleGroup(', '    if (visible.length)')
  ];
  if (source.includes('  function resetTrackerPagination()')) blocks.push(block('  function resetTrackerPagination()', '  function setTrackerArticleSort('));
  vm.runInContext(blocks.join('\n'), context);
  return { context, state, articles, stored, list, scrolls, loads, renders: () => renders };
}

test('legacy stored last pages are ignored while filters and sort preferences survive', () => {
  const h = harness();
  h.stored.set('prefs', JSON.stringify({ version: 2, pages: { unread: 40, read: 19 }, readFilter: 'unread', discoveryRange: '7days', sorts: { unread: 'oldest', read: 'newest' } }));
  h.context.restoreTrackerDisplayPreferences();
  assert.equal(h.state.trackerArticlePages.unread, 1);
  assert.equal(h.state.trackerArticlePages.read, 1);
  assert.equal(h.state.journalTrackerReadFilter, 'unread');
  assert.equal(h.state.trackerDiscoveryRange, '7days');
  assert.equal(h.state.trackerArticleSorts.unread, 'oldest');
});

test('pages are transient; restoring cloud preferences does not interrupt current navigation', () => {
  const h = harness(); h.state.trackerArticlePages = { unread: 3, read: 2 };
  h.context.saveTrackerDisplayPreferences();
  assert.equal(Object.hasOwn(JSON.parse(h.stored.get('prefs')), 'pages'), false);
  h.stored.set('prefs', JSON.stringify({ version: 2, pages: { unread: 40, read: 19 }, publicationRange: '30days' }));
  h.context.restoreTrackerDisplayPreferences();
  assert.equal(h.state.trackerArticlePages.unread, 3);
  assert.equal(h.state.trackerArticlePages.read, 2);
  assert.equal(h.state.trackerPublicationRange, '30days');
});

test('entering or returning to tracker starts at first page and list top before data loading', () => {
  const h = harness(); h.state.trackerArticlePages = { unread: 3, read: 2 };
  h.context.showPanel('journal-tracker');
  assert.deepEqual(h.loads[0], { unread: 1, read: 1 }); assert.equal(h.list.scrollTop, 0);
  h.state.trackerArticlePages.unread = 2; h.list.scrollTop = 300;
  h.context.showPanel('journal-tracker');
  assert.equal(h.state.trackerArticlePages.unread, 2); assert.equal(h.list.scrollTop, 300);
  h.context.showPanel('dashboard'); h.context.showPanel('journal-tracker');
  assert.equal(h.state.trackerArticlePages.unread, 1); assert.equal(h.list.scrollTop, 0);
});

test('first and last navigation are independent and scroll to their group without network loads', () => {
  const h = harness(); const before = JSON.stringify(h.articles);
  h.context.setTrackerArticlePage('unread', 'last');
  assert.equal(h.state.trackerArticlePages.unread, 3); assert.equal(h.state.trackerArticlePages.read, 1);
  h.context.setTrackerArticlePage('read', 'last'); assert.equal(h.state.trackerArticlePages.read, 2);
  h.context.setTrackerArticlePage('unread', 'first'); assert.equal(h.state.trackerArticlePages.unread, 1);
  assert.equal(h.state.trackerArticlePages.read, 2);
  assert.deepEqual(h.scrolls, ['unread', 'read', 'unread']); assert.equal(h.renders(), 3);
  assert.equal(h.loads.length, 0); assert.equal(JSON.stringify(h.articles), before);
});

test('jump and previous/next clamp pages, use filtered totals, and reject invalid groups', () => {
  const h = harness();
  for (const [requested, expected] of [[999, 3], [-1, 1], [2.8, 2], ['', 1], [Infinity, 1], ['invalid', 1]]) {
    h.context.setTrackerArticlePage('unread', requested); assert.equal(h.state.trackerArticlePages.unread, expected);
  }
  h.articles.splice(15, 16); h.context.setTrackerArticlePage('unread', 'last');
  assert.equal(h.state.trackerArticlePages.unread, 1);
  const count = h.renders(); h.context.setTrackerArticlePage('other', 'last'); assert.equal(h.renders(), count);
});

test('pager shows first/last, correct disabled boundaries, counts, and 15-item slices', () => {
  const h = harness(); const articles = h.articles.filter(a => !a.is_read);
  let html = h.context.renderArticleGroup('unread', '未读文章', articles);
  assert.match(html, /data-tracker-page-target="first" disabled>首页/);
  assert.match(html, /data-tracker-page-target="last">尾页/);
  assert.equal((html.match(/<article /g) || []).length, 15);
  h.context.setTrackerArticlePage('unread', 'last');
  html = h.context.renderArticleGroup('unread', '未读文章', articles);
  assert.match(html, /data-tracker-page-target="last" disabled>尾页/);
  assert.match(html, /data-tracker-page-target="first">首页/);
  assert.match(html, /第 3 \/ 3 页/); assert.match(html, /31–31 \/ 31 篇/);
  assert.equal((html.match(/<article /g) || []).length, 1);
  assert.match(html, /data-id="u30"/);
  assert.equal(h.context.renderArticleGroup('read', '已读文章', []), '');
  assert.ok(!h.context.renderArticleGroup('read', '已读文章', [{ id: 'only' }]).includes('tracker-article-pager'));
});

test('button and jump handlers use the same page helper; existing filter changes reset both groups', () => {
  assert.match(source, /setTrackerArticlePage\(jumpGroup, requestedPage\)/);
  assert.match(source, /setTrackerArticlePage\(pageGroup, pageButton.dataset.trackerPageTarget/);
  for (const id of ['trackerArticleSearch', 'trackerJournalFilter', 'trackerCategoryFilter', 'trackerReadFilter', 'trackerPublicationRange', 'trackerPublicationFrom', 'trackerPublicationTo']) {
    const line = source.split('\n').find(s => s.includes("$('#" + id + "').addEventListener("));
    assert.ok(line, id); assert.ok(line.includes('state.trackerArticlePages = { unread: 1, read: 1 }'), id);
  }
});
