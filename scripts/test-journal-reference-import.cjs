const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '../web/app.js'), 'utf8');
function block(start, end) {
  const offset = source.indexOf(start), stop = source.indexOf(end, offset);
  assert.ok(offset >= 0 && stop > offset, start);
  return source.slice(offset, stop);
}
function harness() {
  const articles = Array.from({ length: 32 }, (_, i) => ({ id: String(i), subscription_id: 'one', title: 'Paper ' + i,
    authors: ['Lee','Wang'], keywords: ['innovation','policy'], keyword_source: 'Author keywords',
    abstract: 'An actual abstract', abstract_source: 'Semantic Scholar', doi: '10.test/' + i, publication_date: '2026-01-01',
    discovered_at: new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString(), is_read: false }));
  const state = { journalTracker: { articles, subscriptions: [{ id: 'one', journal_title: 'Test Journal' }] },
    trackerSelectedArticleIds: [], trackerReferenceImporting: false,
    trackerArticlePages: { unread: 1, read: 1 }, trackerArticleSorts: { unread: 'discovered-newest', read: 'discovered-newest' },
    trackerCollapsedGroups: { unread: false, read: false } };
  const nodes = Object.fromEntries(['trackerSelectedCount','trackerImportSelected','trackerSelectPage','trackerClearSelection','trackerImportResult'].map(id => [id, { replaceChildren() {} }]));
  const toasts = [], calls = []; let reply = async () => ({ ok: false, error: 'Permission denied' });
  const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  const context = vm.createContext({ state, Date, Set, Promise, Error, escapeHtml,
    document: { querySelectorAll: () => [] }, $: selector => nodes[selector.slice(1)], toast: text => toasts.push(text),
    trackerVisibleArticles: () => state.journalTracker.articles,
    trackerSubscriptionMap: () => Object.fromEntries(state.journalTracker.subscriptions.map(item => [item.id, item])),
    api: (url, options) => { calls.push({ url, body: JSON.parse(options.body) }); return reply(); }
  });
  vm.runInContext(block('  function normalizeTrackerArticleSort(', '  function renderJournalTracker()') + '\n' +
    block('  function renderTrackerBulkSelection()', '  var trackerZoteroImportedKey'), context);
  return { state, context, nodes, calls, toasts, reply: next => { reply = next; },
    result: statuses => ({ ok: true, importVersion: 1, referenceLibrary: { items: [{ id: 'ref' }] },
      importResults: statuses.map(([articleId,status]) => ({ articleId, status, title: 'Paper ' + articleId, error: status === 'failed' ? '<unsafe>' : '' })) }) };
}
test('select page follows sorted 15-item slices, keeps other pages and avoids duplicate selections', () => {
  const h = harness(); h.context.selectTrackerCurrentPage();
  assert.deepEqual(Array.from(h.state.trackerSelectedArticleIds), Array.from({ length: 15 }, (_,i) => String(31-i)));
  h.context.selectTrackerCurrentPage(); assert.equal(h.state.trackerSelectedArticleIds.length, 15);
  h.state.trackerArticlePages.unread = 2; h.context.selectTrackerCurrentPage();
  assert.equal(h.state.trackerSelectedArticleIds.length, 30);
  assert.equal(h.nodes.trackerSelectedCount.textContent, '已选 30 篇（可跨页选择）');
  h.state.trackerCollapsedGroups.unread = true;
  assert.equal(h.context.trackerCurrentPageArticles().length, 0);
});
test('checkbox selection can remove a selection and refuses invisible IDs', () => {
  const h = harness(); h.context.selectTrackerArticle('1', true); h.context.selectTrackerArticle('missing', true);
  assert.deepEqual(Array.from(h.state.trackerSelectedArticleIds), ['1']);
  h.context.selectTrackerArticle('1', false); assert.equal(h.state.trackerSelectedArticleIds.length, 0);
  assert.equal(h.nodes.trackerImportSelected.disabled, true);
});
test('single and bulk imports preserve metadata and never change reading status', async () => {
  const h = harness(); const before = JSON.stringify(h.state.journalTracker.articles);
  h.reply(async () => h.result([['1','added']]));
  assert.equal(await h.context.saveTrackedArticleToLibrary('1'), true);
  const request = h.calls[0]; assert.equal(request.url, '/api/references'); assert.equal(request.body.action, 'import-tracked');
  assert.equal(request.body.items[0].abstractSource, 'Semantic Scholar');
  assert.equal(request.body.items[0].keywordsSource, 'Author keywords');
  assert.equal(request.body.items[0].authors, 'Lee；Wang');
  assert.equal(request.body.items[0].keywords, 'innovation，policy');
  assert.equal(request.body.items[0].source, 'Test Journal');
  assert.equal(JSON.stringify(h.state.journalTracker.articles), before);
});
test('a pending save disables actions and prevents duplicate submissions', async () => {
  const h = harness(); let release; h.reply(() => new Promise(resolve => { release = resolve; }));
  h.state.trackerSelectedArticleIds = ['1'];
  const first = h.context.importTrackedArticlesToLibrary(['1']);
  assert.equal(h.state.trackerReferenceImporting, true);
  assert.equal(h.nodes.trackerImportSelected.textContent, '正在保存…');
  assert.equal(h.nodes.trackerSelectPage.disabled, true);
  assert.equal(await h.context.importTrackedArticlesToLibrary(['1']), false);
  assert.equal(h.calls.length, 1);
  release(h.result([['1','added']])); await first;
  assert.equal(h.state.trackerReferenceImporting, false);
  assert.equal(h.state.trackerSelectedArticleIds.length, 0);
});
test('partial success clears completed selections and keeps failed entries for retry with escaped error output', async () => {
  const h = harness(); h.state.trackerSelectedArticleIds = ['1','2','3'];
  h.reply(async () => h.result([['1','added'],['2','duplicate'],['3','failed']]));
  assert.equal(await h.context.importTrackedArticlesToLibrary(['1','2','3']), true);
  assert.deepEqual(Array.from(h.state.trackerSelectedArticleIds), ['3']);
  assert.match(h.nodes.trackerImportResult.innerHTML, /新增 1 篇，已存在 1 篇，失败 1 篇/);
  assert.match(h.nodes.trackerImportResult.innerHTML, /&lt;unsafe&gt;/);
  assert.doesNotMatch(h.nodes.trackerImportResult.innerHTML, /<unsafe>/);
});
test('network failure keeps selection and permits a successful retry', async () => {
  const h = harness(); h.state.trackerSelectedArticleIds = ['1'];
  h.reply(async () => { throw new Error('Failed to fetch'); });
  assert.equal(await h.context.importTrackedArticlesToLibrary(['1']), false);
  assert.deepEqual(h.state.trackerSelectedArticleIds, ['1']); assert.equal(h.state.trackerReferenceImporting, false);
  assert.match(h.nodes.trackerImportResult.innerHTML, /失败/);
  h.reply(async () => h.result([['1','added']]));
  assert.equal(await h.context.importTrackedArticlesToLibrary(['1']), true);
});
test('outdated or mismatched save responses are not presented as success', async () => {
  for (const statuses of [[['wrong','added']], [['1','unknown']]]) {
    const h = harness(); h.state.trackerSelectedArticleIds = ['1']; h.reply(async () => h.result(statuses));
    assert.equal(await h.context.importTrackedArticlesToLibrary(['1']), false);
    assert.deepEqual(h.state.trackerSelectedArticleIds, ['1']); assert.equal(h.state.referenceLibrary, undefined);
  }
  const h = harness(); h.reply(async () => ({ ok: true, referenceLibrary: { items: [] } }));
  assert.equal(await h.context.importTrackedArticlesToLibrary(['1']), false);
});
test('missing articles, empty selections and over-limit imports do not send a request', async () => {
  const h = harness();
  for (const ids of [[], ['missing'], Array.from({ length: 201 }, (_, i) => String(i))]) assert.equal(await h.context.importTrackedArticlesToLibrary(ids), false);
  assert.equal(h.calls.length, 0);
  assert.match(source, /visibleIds\.has\(String\(id\)\)/);
  assert.ok(source.includes('selectTrackerArticle(selection.dataset.trackerSelect, selection.checked)'));
});
