const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
const test = require('node:test');

const root = path.join(__dirname, '..');
const edgeSource = stripTypeScriptTypes(fs.readFileSync(path.join(root, 'supabase/functions/journal-tracker/index.ts'), 'utf8'));
const appSource = fs.readFileSync(path.join(root, 'web/app.js'), 'utf8');
const subscription = { id: 'test-journal', user_id: 'test-user', issn: '1234-5678', journal_title: 'Test Journal', publisher: 'Test Publisher', feed_url: 'https://example.org/rss', enabled: true, last_checked_at: null };

function edgeHarness({ feed = [], feedError, crossrefError } = {}) {
  const writes = [];
  let crossrefCalls = 0;
  const context = vm.createContext({
    Deno: { env: { get: () => '' }, serve() {} },
    URL, Response, AbortSignal, TextDecoder, TextEncoder, crypto, console, Error,
    feedValue: feed, feedError, crossrefError,
    mockRest: async (url, init = {}) => { if (init.body) writes.push({ url, body: JSON.parse(init.body) }); return []; },
    mockCrossref: async () => { crossrefCalls++; if (crossrefError) throw new Error(crossrefError); return { items: [{ title: ['Fallback article'], abstract: 'Crossref abstract', DOI: '10.1234/test', type: 'journal-article' }] }; }
  });
  vm.runInContext(edgeSource, context);
  vm.runInContext(`
    rest = mockRest;
    fetchFeed = async () => { if (feedError) throw new Error(feedError); return feedValue; };
    crossref = mockCrossref;
    semanticScholarByDois = async () => new Map();
    openAlexWorksByDoi = async () => new Map();
    crossrefWorksByDoi = async () => new Map();
    fetchArticlePageMetadata = async () => ({ abstract: '', keywords: [] });
  `, context);
  return { context, writes, crossrefCalls: () => crossrefCalls };
}

for (const kind of ['rss', 'atom']) {
  test(`${kind} success persists the actual discovery source and abstract provenance`, async () => {
    const harness = edgeHarness({ feed: [{ title: 'Original article', abstract: 'Publisher abstract', feed_kind: kind }] });
    const result = await harness.context.refreshSubscription(subscription);
    assert.equal(result.ok, true);
    assert.equal(result.details.discovery_source, kind);
    assert.equal(result.details.status, 'success');
    assert.equal(harness.crossrefCalls(), 0);
    const article = harness.writes.find(write => write.url.startsWith('journal_articles')).body[0];
    assert.equal(article.abstract_source, kind === 'atom' ? '期刊官网 Atom' : '期刊官网 RSS');
    const stored = harness.writes.find(write => write.url.startsWith('journal_subscriptions')).body;
    assert.equal(stored.last_error, null);
    assert.equal(stored.last_sync_details.discovery_source, kind);
    assert.ok(stored.last_success_at);
    await harness.context.recordRefreshLogs([subscription], [result], 'manual');
    const log = harness.writes.find(write => write.url === 'journal_tracker_refresh_logs').body[0];
    assert.equal(log.source, 'manual');
    assert.equal(log.details.discovery_source, kind);
    assert.equal(log.article_count, 1);
  });
}

test('a valid empty NBER feed is successful and never invokes Crossref', async () => {
  const harness = edgeHarness();
  const result = await harness.context.refreshSubscription({ ...subscription, issn: 'NBER-WP' });
  assert.equal(result.ok, true);
  assert.equal(result.processed, 0);
  assert.equal(harness.crossrefCalls(), 0);
});

test('RSS failure followed by Crossref success is a warning, not a failed subscription', async () => {
  const harness = edgeHarness({ feedError: '期刊 RSS 返回 429' });
  const result = await harness.context.refreshSubscription(subscription);
  assert.equal(result.ok, true);
  assert.equal(result.details.status, 'fallback');
  assert.equal(result.details.discovery_source, 'crossref');
  assert.match(result.warning, /429/);
  const stored = harness.writes.find(write => write.url.startsWith('journal_subscriptions')).body;
  assert.equal(stored.last_error, null);
  assert.equal(stored.last_sync_details.status, 'fallback');
  assert.equal(harness.writes.find(write => write.url.startsWith('journal_articles')).body[0].abstract_source, 'Crossref');
});

test('complete source failure preserves the previous success timestamp', async () => {
  const harness = edgeHarness({ feedError: 'RSS 返回 403', crossrefError: 'Crossref 返回 503' });
  const result = await harness.context.refreshSubscription({ ...subscription, last_success_at: '2026-09-28T00:00:00Z' });
  assert.equal(result.ok, false);
  assert.equal(result.details.status, 'error');
  const stored = harness.writes.find(write => write.url.startsWith('journal_subscriptions')).body;
  assert.ok(!Object.hasOwn(stored, 'last_success_at'));
  assert.match(stored.last_error, /403.*Crossref.*503/);
});

test('empty Atom feed keeps its source identity', async () => {
  const harness = edgeHarness();
  const atom = harness.context.parseFeed('<feed xmlns="http://www.w3.org/2005/Atom"><title>Empty feed</title></feed>');
  harness.context.feedValue = atom;
  const result = await harness.context.refreshSubscription(subscription);
  assert.equal(result.ok, true);
  assert.equal(result.details.discovery_source, 'atom');
  assert.equal(result.processed, 0);
  assert.equal(harness.crossrefCalls(), 0);
});

function appHarness() {
  const state = { journalTracker: { subscriptions: [], refreshLogs: [] } };
  const context = vm.createContext({ state, escapeHtml: text => String(text).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character])) });
  const start = appSource.indexOf('  function trackerRefreshIsBusy()');
  const end = appSource.indexOf('  var trackerEasyScholarSettingsKey', start);
  vm.runInContext(appSource.slice(start, end), context);
  context.trackerDateLabel = () => '今天 08:00';
  return context;
}

test('legacy fallback records and pending records retain truthful status', () => {
  const context = appHarness();
  assert.equal(context.trackerSyncState({}).status, 'pending');
  assert.equal(context.trackerSyncState({ last_error: 'RSS 失败，后备成功', last_checked_at: '2026-09-28T00:00:00Z', last_success_at: '2026-09-28T00:00:00Z' }).status, 'fallback');
  assert.equal(context.trackerSyncState({ last_error: 'RSS 失败', last_checked_at: '2026-09-29T00:00:00Z', last_success_at: '2026-09-28T00:00:00Z' }).status, 'error');
});

test('per-journal diagnostics expose retry and escape source errors', () => {
  const context = appHarness();
  const html = context.renderTrackerSyncDetails({ id: 'test', last_sync_details: { status: 'fallback', discovery_source: 'crossref', processed: 40, warning: '<script>bad</script> 429' } }, false);
  assert.match(html, /后备更新成功/);
  assert.match(html, /更新来源：Crossref/);
  assert.match(html, /本次处理 40 篇/);
  assert.match(html, /立即重试/);
  assert.ok(!html.includes('<script>'));
  assert.match(html, /限流/);
});

test('unknown historical sources are not inferred from configured URLs', () => {
  const context = appHarness();
  const html = context.renderTrackerSyncDetails({ id: 'test', feed_url: 'https://example.org/rss', last_success_at: '2026-09-28T00:00:00Z' }, false);
  assert.match(html, /更新来源：尚未记录/);
  assert.ok(!html.includes('本次处理'));
});
