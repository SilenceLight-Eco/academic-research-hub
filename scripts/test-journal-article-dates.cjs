const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
process.env.TZ = 'Asia/Shanghai';
const source = fs.readFileSync(path.join(__dirname,'../web/app.js'),'utf8');
function block(start,end) {
  const from = source.indexOf(start); const to = source.indexOf(end,from);
  assert.ok(from >= 0 && to > from, start); return source.slice(from,to);
}
function harness() {
  const article = { id:'one', title:'Research paper', is_read:true, subscription_id:'journal',
    publication_date:'2020-01-01', discovered_at:'2026-10-03T16:02:03Z', updated_at:'2026-10-04T10:00:00Z',
    read_at:'2026-10-04T01:00:00Z', authors:['Author'], keywords:[], metadata_sources:['RSS'] };
  const elements = Object.fromEntries(['#trackerArticleDetail','#trackerHero','#trackerStats','#trackerLayout'].map(id=>[id,{innerHTML:'',hidden:false}]));
  const journal = { journal_title:'Journal' };
  const context = vm.createContext({ Date, trackerArticleDetailId:'one', state:{journalTracker:{articles:[article]}},
    escapeHtml:value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
    $:id=>elements[id], trackerSubscriptionMap:()=>({journal}), subscriptionById:{journal},
    trackerTitleNeedsTranslation:()=>false, trackerArticleCategoryMarkup:()=>'', trackerEasyScholarRankMarkup:()=>'',
    trackerZoteroImported:{}, scheduleTrackerTitleTranslation:()=>{}
  });
  vm.runInContext([
    block('  function trackerArticleDatesMarkup(', '  function openTrackerArticleDetail('),
    block('  function trackerLocalDateKey(', '  function trackerDateDaysAgoKey('),
    block('    function renderArticleCard(', '    function renderArticleGroup(')
  ].join('\n'),context);
  return {context, article, elements};
}
test('first ingestion uses local time and has a machine-readable UTC timestamp',()=>{
  const h=harness(); const html=h.context.trackerArticleDatesMarkup(h.article);
  assert.match(html,/发表：2020-01-01/); assert.match(html,/首次收录：<time datetime="2026-10-03T16:02:03.000Z">2026-10-04 00:02<\/time>/);
  assert.match(html,/当前设备时区/);
});
test('missing or invalid ingestion is never substituted with publication, updated or read dates',()=>{
  const h=harness();
  for(const value of [undefined,null,'','invalid','<script>alert(1)</script>']) {
    const html=h.context.trackerArticleDatesMarkup({...h.article,discovered_at:value});
    assert.match(html,/首次收录：时间暂缺/); assert.ok(!html.includes('<time')); assert.ok(!html.includes('<script>'));
  }
});
test('missing publication is explicit and potentially unsafe text is escaped',()=>{
  const h=harness();
  assert.match(h.context.trackerArticleDatesMarkup({...h.article,publication_date:null}),/发表：日期暂缺/);
  const html=h.context.trackerArticleDatesMarkup({...h.article,publication_date:'<img src=x onerror=alert(1)>'});
  assert.ok(!html.includes('<img')); assert.match(html,/&lt;img/);
});
test('card and detail use identical date markup without mutating state',()=>{
  const h=harness(); const before=JSON.stringify(h.article); Object.freeze(h.article);
  const dates=h.context.trackerArticleDatesMarkup(h.article);
  assert.ok(h.context.renderArticleCard(h.article).includes(dates));
  h.context.renderTrackerArticleDetail();
  assert.ok(h.elements['#trackerArticleDetail'].innerHTML.includes(dates));
  assert.equal(JSON.stringify(h.article),before);
});
test('enrichment and reading do not alter the displayed first-ingestion date',()=>{
  const h=harness(); const original=h.context.trackerArticleDatesMarkup(h.article);
  assert.equal(h.context.trackerArticleDatesMarkup({...h.article,updated_at:'2026-10-10',read_at:'2026-10-10',abstract:'new'}),original);
});
test('year boundaries use full local dates and zero-padded time',()=>{
  const h=harness(); const html=h.context.trackerArticleDatesMarkup({...h.article,discovered_at:'2025-12-31T16:03:00Z'});
  assert.match(html,/>2026-01-01 00:03<\/time>/);
});
