// Exercise the real import flow; no live Zotero library or user data is modified.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '../web/app.js'), 'utf8');
const importSource = source.slice(source.indexOf('  function importTrackedArticleToZoteroDesktop('), source.indexOf('  function handleTrackerArticleAction('));
const readSource = source.slice(source.indexOf('  function saveTrackedArticleRead('), source.indexOf('  function setTrackedArticleRead('));

function harness({ isRead = false, importFailure, saveFailure, collectionApplied = true } = {}) {
  const article = { id: 'article-1', doi: '10.1234/test', is_read: isRead, read_at: isRead ? '2026-10-01T08:00:00Z' : null };
  const button = { disabled: false, textContent: '导入Zotero' };
  const messages = [], requests = [], confirmed = {};
  let acknowledge;
  const context = vm.createContext({
    state: { journalTracker: { articles: [article] }, trackerCollapsedGroups: {} },
    trackerZoteroPendingImports: {}, trackerZoteroImported: confirmed,
    CSS: { escape: value => value }, document: { querySelector: () => button },
    localStorage: { setItem() {} },
    createTrackedZoteroItem: item => ({ title: 'Test', DOI: item.doi }),
    requestTrackerZoteroBridge: (type, payload) => {
      requests.push({ type, payload });
      return new Promise((resolve, reject) => { acknowledge = () => importFailure ? reject(new Error(importFailure)) : resolve({ collectionApplied }); });
    },
    persistTrackerZoteroImport: (key, value) => { confirmed[key] = value; },
    toast: message => messages.push(message),
    renderJournalTracker: () => { button.disabled = false; button.textContent = confirmed['desktop:10.1234/test'] ? '重新导入' : '导入Zotero'; },
    saveTrackerDisplayPreferences() {},
    journalTrackerRequest: async payload => {
      requests.push({ type: 'read', payload });
      if (saveFailure) throw new Error(saveFailure);
      return { readStateVersion: 1, articles: [{ ...article, is_read: true, read_at: '2026-10-02T08:00:00Z' }] };
    },
    applyJournalTrackerData: result => { context.state.journalTracker.articles = result.articles; context.renderJournalTracker(); }
  });
  vm.runInContext(readSource + importSource, context);
  return { context, button, messages, requests, confirmed, acknowledge: () => acknowledge() };
}

test('unread article is marked read only after Zotero confirms import, with cloud persistence and collapse', async () => {
  const h = harness();
  const pending = h.context.importTrackedArticleToZoteroDesktop('article-1', h.button, 'collection-9');
  assert.equal(h.button.disabled, true);
  assert.equal(h.requests.length, 1);
  assert.equal(h.context.state.journalTracker.articles[0].is_read, false);
  assert.equal(h.requests[0].payload.target, 'collection-9');
  h.acknowledge(); await pending;
  assert.equal(h.requests[1].payload.action, 'set-read');
  assert.equal(h.requests[1].payload.id, 'article-1');
  assert.equal(h.requests[1].payload.isRead, true);
  assert.equal(h.context.state.journalTracker.articles[0].is_read, true);
  assert.equal(h.context.state.trackerCollapsedGroups.read, true);
  assert.match(h.messages[0], /已自动标记为已读/);
  assert.equal(h.context.trackerZoteroPendingImports['article-1'], undefined);
});
test('failed import leaves an unread article unread and clears the pending lock', async () => {
  const h = harness({ importFailure: 'Zotero 未启动' });
  const pending = h.context.importTrackedArticleToZoteroDesktop('article-1', h.button, 'library');
  h.acknowledge(); await pending;
  assert.equal(h.requests.length, 1);
  assert.equal(h.context.state.journalTracker.articles[0].is_read, false);
  assert.equal(Object.keys(h.confirmed).length, 0);
  assert.equal(h.button.disabled, false);
  assert.equal(h.context.trackerZoteroPendingImports['article-1'], undefined);
});
test('cloud save failure preserves confirmed import and gives a separate actionable warning', async () => {
  const h = harness({ saveFailure: '网络断开' });
  const pending = h.context.importTrackedArticleToZoteroDesktop('article-1', h.button, 'library');
  h.acknowledge(); await pending;
  assert.equal(h.confirmed['desktop:10.1234/test'].status, 'confirmed');
  assert.equal(h.button.textContent, '重新导入');
  assert.equal(h.context.state.journalTracker.articles[0].is_read, false);
  assert.match(h.messages[0], /已导入 Zotero，但自动标记已读失败：网络断开/);
});
test('re-import of an already-read article does not extend its retention time', async () => {
  const h = harness({ isRead: true });
  const before = h.context.state.journalTracker.articles[0].read_at;
  const pending = h.context.importTrackedArticleToZoteroDesktop('article-1', h.button, 'library');
  h.acknowledge(); await pending;
  assert.equal(h.requests.length, 1);
  assert.equal(h.context.state.journalTracker.articles[0].read_at, before);
});
test('classification failure still marks read because Zotero received the item', async () => {
  const h = harness({ collectionApplied: false });
  const pending = h.context.importTrackedArticleToZoteroDesktop('article-1', h.button, 'library');
  h.acknowledge(); await pending;
  assert.equal(h.context.state.journalTracker.articles[0].is_read, true);
  assert.match(h.messages[0], /分类移动失败.*已自动标记为已读/);
});
test('duplicate clicks during import produce one import and one read-state write', async () => {
  const h = harness();
  const pending = h.context.importTrackedArticleToZoteroDesktop('article-1', h.button, 'library');
  h.context.importTrackedArticleToZoteroDesktop('article-1', h.button, 'library');
  h.acknowledge(); await pending;
  assert.equal(h.requests.length, 2);
});
