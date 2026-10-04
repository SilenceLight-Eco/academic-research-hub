const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
process.env.TZ = 'Asia/Shanghai';
const source = fs.readFileSync(path.join(__dirname,'../web/app.js'),'utf8');
const fixedNow = Date.parse('2026-10-04T04:00:00Z');
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [fixedNow])); }
  static now() { return fixedNow; }
}
function harness() {
  const state = {
    journalTracker: { subscriptions: [{ id:'one',category:'Economics' },{ id:'two',category:'Finance' }],articles:[] },
    journalTrackerFilter:'all',trackerJournalCategoryFilter:'all',journalTrackerReadFilter:'all',journalTrackerQuery:'',
    trackerPublicationRange:'all',trackerPublicationFrom:'',trackerPublicationTo:'',trackerDiscoveryRange:'all',
    trackerArticlePages:{ unread:1,read:1 },trackerArticleSorts:{ unread:'newest',read:'newest' },trackerCollapsedGroups:{ unread:false,read:false }
  };
  const stored = new Map(); const list = { scrollTop:99 }; let renders=0;
  const context=vm.createContext({ state,Date:FixedDate,trackerDisplayPreferencesKey:'prefs',
    localStorage:{ getItem:key=>stored.get(key)||null,setItem:(key,value)=>stored.set(key,value) },
    trackerSubscriptionMap:()=>Object.fromEntries(state.journalTracker.subscriptions.map(s=>[s.id,s])),
    $:()=>list,renderJournalTracker:()=>{ renders++; },escapeHtml:String,
    renderArticleCard:article=>'<article data-id="'+article.id+'"></article>'
  });
  const prefs=source.slice(source.indexOf('  function restoreTrackerDisplayPreferences()'),source.indexOf('  restoreTrackerDisplayPreferences();'));
  const filters=source.slice(source.indexOf('  function trackerPublicationDateKey('),source.indexOf('  function renderJournalTracker()'));
  const setterStart=source.indexOf('  function setTrackerDiscoveryRange(');
  const setter=source.slice(setterStart,source.indexOf('  function saveTrackedArticleToLibrary(',setterStart));
  const group=source.slice(source.indexOf('    function renderArticleGroup('),source.indexOf('    if (visible.length)'));
  vm.runInContext(prefs+'\n'+filters+'\n'+setter+'\n'+group,context);
  const article=(id,time,extras={})=>({ id,subscription_id:'one',title:id,authors:['Lee'],keywords:['Innovation'],abstract:'',
    publication_date:'2020-01-01',discovered_at:time,is_read:false,...extras });
  state.journalTracker.articles=[
    article('today','2026-10-03T16:00:00Z'),
    article('yesterday','2026-10-03T15:59:59Z'),
    article('seven-day-boundary','2026-09-27T16:00:00Z'),
    article('too-old','2026-09-27T15:59:59Z'),
    article('recent-publication-only','2026-09-01T00:00:00Z',{ publication_date:'2026-10-04',updated_at:'2026-10-04T01:00:00Z' }),
    article('read-today','2026-10-04T01:00:00Z',{ is_read:true,subscription_id:'two' }),
    article('missing',null),article('invalid','not-a-date'),article('future','2026-10-04T04:01:00Z')
  ];
  return { context,state,stored,list,article,renders:()=>renders,ids:()=>Array.from(context.trackerVisibleArticles(),a=>a.id) };
}
test('today uses local first-ingestion midnight, not publication or last update',()=>{
  const h=harness(); h.state.trackerDiscoveryRange='today';
  assert.deepEqual(h.ids(),['today','read-today']);
  assert.equal(h.context.trackerDateDaysAgoKey(0),'2026-10-04');
});
test('seven days means today and six previous calendar days, inclusive at midnight',()=>{
  const h=harness(); h.state.trackerDiscoveryRange='7days';
  assert.deepEqual(h.ids(),['today','yesterday','seven-day-boundary','read-today']);
});
test('all discovery dates preserves legacy articles with missing dates',()=>{
  const h=harness(); assert.equal(h.ids().length,9);
});
test('read, journal, category, text and publication filters compose with discovery',()=>{
  const h=harness(); h.state.trackerDiscoveryRange='today';
  h.state.journalTrackerReadFilter='unread'; assert.deepEqual(h.ids(),['today']);
  h.state.journalTrackerReadFilter='read'; assert.deepEqual(h.ids(),['read-today']);
  h.state.journalTrackerReadFilter='all'; h.state.trackerJournalCategoryFilter='Economics'; assert.deepEqual(h.ids(),['today']);
  h.state.trackerJournalCategoryFilter='all'; h.state.journalTrackerFilter='two'; assert.deepEqual(h.ids(),['read-today']);
  h.state.journalTrackerFilter='all'; h.state.journalTrackerQuery='today'; assert.equal(h.ids().length,2);
  h.state.trackerPublicationRange='7days'; assert.equal(h.ids().length,0,'newly ingested older papers need not have a recent publication date');
});
test('selection resets both pages and scroll, persists, renders without fetching',()=>{
  const h=harness(); h.state.trackerArticlePages={ unread:9,read:4 };
  h.context.setTrackerDiscoveryRange('7days');
  assert.equal(h.state.trackerArticlePages.unread,1); assert.equal(h.state.trackerArticlePages.read,1);
  assert.equal(h.list.scrollTop,0); assert.equal(h.renders(),1);
  assert.equal(JSON.parse(h.stored.get('prefs')).discoveryRange,'7days');
  h.state.trackerDiscoveryRange='all'; h.context.restoreTrackerDisplayPreferences();
  assert.equal(h.state.trackerDiscoveryRange,'7days');
  h.context.setTrackerDiscoveryRange('unknown'); assert.equal(h.state.trackerDiscoveryRange,'all');
});
test('old and invalid preference records do not invent a collection-date filter',()=>{
  const h=harness(); h.stored.set('prefs',JSON.stringify({ version:2,publicationRange:'30days' }));
  h.context.restoreTrackerDisplayPreferences(); assert.equal(h.state.trackerDiscoveryRange,'all');
  h.stored.set('prefs',JSON.stringify({ discoveryRange:'invalid' }));
  h.context.restoreTrackerDisplayPreferences(); assert.equal(h.state.trackerDiscoveryRange,'all');
});
test('filtered groups paginate the matching rows at 15 per page with exact totals',()=>{
  const h=harness(); h.state.trackerDiscoveryRange='today';
  h.state.journalTracker.articles=Array.from({length:31},(_,i)=>h.article('new-'+i,'2026-10-04T01:00:00Z'));
  h.state.journalTracker.articles.push(h.article('old','2026-09-01T00:00:00Z'));
  const visible=h.context.trackerVisibleArticles(); assert.equal(visible.length,31);
  let html=h.context.renderArticleGroup('unread','未读文章',visible);
  assert.equal((html.match(/<article /g)||[]).length,15); assert.match(html,/第 1 \/ 3 页/); assert.match(html,/1–15 \/ 31 篇/);
  h.state.trackerArticlePages.unread=3; html=h.context.renderArticleGroup('unread','未读文章',visible);
  assert.equal((html.match(/<article /g)||[]).length,1); assert.match(html,/31–31 \/ 31 篇/);
  assert.ok(!html.includes('data-id="old"'));
});
test('HTML control and event use the same persisted filter; mark-all scope states ingestion range',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../web/workbench.html'),'utf8');
  assert.match(html,/id="trackerDiscoveryRange"[^>]*aria-label="按首次收录时间筛选"/);
  assert.match(source,/\$\('#trackerDiscoveryRange'\)\.addEventListener\('change', function \(\) \{ setTrackerDiscoveryRange\(this.value\)/);
  assert.match(source,/scope.push\('收录时间：今日新增'\)/);
  assert.match(source,/scope.push\('收录时间：最近 7 天新增'\)/);
});
