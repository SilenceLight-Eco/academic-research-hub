const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(process.argv[2] || '@electric-sql/pglite');
const user = '10000000-0000-0000-0000-000000000001';
const other = '10000000-0000-0000-0000-000000000002';
const sub = '20000000-0000-0000-0000-000000000001';
async function main() {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
      create table auth.users(id uuid primary key);
      create table journal_subscriptions(id uuid primary key,user_id uuid references auth.users(id) on delete cascade);
      create table journal_articles(id uuid primary key default gen_random_uuid(),subscription_id uuid references journal_subscriptions(id) on delete cascade,
        user_id uuid references auth.users(id) on delete cascade,article_key text not null,doi text,title text not null,
        authors text[] not null default '{}',abstract text not null default '',abstract_source text not null default '',
        keywords text[] not null default '{}',keyword_source text not null default '',publication_date date,url text not null default '',
        metadata_sources text[] not null default '{}',updated_at timestamptz not null default now(),
        is_read boolean not null default false,read_at timestamptz,discovered_at timestamptz not null default now(),unique(subscription_id,article_key));
      insert into auth.users values('${user}'),('${other}'); insert into journal_subscriptions values('${sub}','${user}');`);
    for (const file of ['202610020001_journal_read_dedup_history.sql','202610040001_journal_identity_aliases.sql',
      '202610040002_journal_url_identities.sql','202610040003_journal_ingest_counts.sql']) {
      await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations',file),'utf8'));
    }
    const row = { subscription_id: sub, user_id: user, article_key: 'rss-a', title: 'Short', url: 'https://nber.org/papers/w12345',
      authors: [], abstract: '', abstract_source: '', keywords: [], keyword_source: '', metadata_sources: ['RSS'] };
    const second = { ...row, article_key: 'rss-b', title: 'Crime in Covid Times', url: 'https://example.org/items/two' };
    const ingest = async rows => (await db.query('select public.ingest_journal_articles($1,$2,$3) counts',[sub,user,JSON.stringify(rows)])).rows[0].counts;
    const counts = (processed, added, enriched, duplicates, read_blocked=0) => ({ processed, added, enriched, duplicates, read_blocked });
    assert.deepEqual(await ingest([row,second,{...row,article_key:'rss-a-duplicate'}]),counts(3,2,0,1),'duplicates inside a batch are counted without conflict errors');
    const stamp = (await db.query("select updated_at from journal_articles where article_key='rss-a'")).rows[0].updated_at;
    assert.deepEqual(await ingest([row,second]),counts(2,0,0,2));
    assert.deepEqual((await db.query("select updated_at from journal_articles where article_key='rss-a'")).rows[0].updated_at,stamp,'unchanged rediscovery does not bump modification time');
    const better = { ...row, article_key:'doi-later', doi:'10.1234/new', title:'A changed long title for the exact same academic paper',
      url:'https://nber.org/papers/w12345.pdf', authors:['Researcher'],abstract:'Publisher abstract',abstract_source:'Publisher',
      keywords:['Innovation'],keyword_source:'Publisher author keywords',metadata_sources:['Crossref','RSS'] };
    assert.deepEqual(await ingest([better]),counts(1,0,1,0),'identity aliases enrich the existing article rather than insert a duplicate');
    const saved = (await db.query("select * from journal_articles where article_key='rss-a'")).rows[0];
    assert.equal(saved.abstract,'Publisher abstract'); assert.equal(saved.keyword_source,'Publisher author keywords');
    assert.equal(saved.title,row.title); assert.equal(saved.url,row.url);
    const poorer = { ...row, abstract:'Replacement abstract',abstract_source:'Guess',keywords:['Classification'],keyword_source:'Wrong' };
    assert.deepEqual(await ingest([poorer]),counts(1,0,0,1));
    assert.equal((await db.query("select abstract from journal_articles where article_key='rss-a'")).rows[0].abstract,'Publisher abstract','nonempty saved metadata must not be overwritten');
    await db.exec("update journal_articles set is_read=true,read_at=now()-interval '4 days' where article_key='rss-a'");
    const readAt = (await db.query("select read_at from journal_articles where article_key='rss-a'")).rows[0].read_at;
    assert.deepEqual(await ingest([better]),counts(1,0,0,1,1));
    assert.deepEqual((await db.query("select read_at from journal_articles where article_key='rss-a'")).rows[0].read_at,readAt,'metadata checks must not extend retention');
    await db.exec("delete from journal_articles where is_read and read_at<now()-interval '3 days'");
    assert.deepEqual(await ingest([{...better,article_key:'rediscovered'}]),counts(1,0,0,1,1),'cleaned read history is counted as blocked, not added');
    assert.equal(Number((await db.query('select count(*) n from journal_articles')).rows[0].n),1);
    await assert.rejects(ingest([{...row,article_key:'safe-new',url:'https://nber.org/papers/w55555'}, {...row,user_id:other}]),/ownership/);
    assert.equal(Number((await db.query('select count(*) n from journal_articles')).rows[0].n),1,'mixed-owner batch must fully roll back');
    await assert.rejects(ingest(Array(201).fill(row)),/at most 200/);
    assert.deepEqual(await ingest([]),counts(0,0,0,0));
    const privileges=(await db.query("select has_function_privilege('authenticated','public.ingest_journal_articles(uuid,uuid,jsonb)','EXECUTE') app,has_function_privilege('anon','public.ingest_journal_articles(uuid,uuid,jsonb)','EXECUTE') anon,has_function_privilege('service_role','public.ingest_journal_articles(uuid,uuid,jsonb)','EXECUTE') backend")).rows[0];
    assert.deepEqual(privileges,{ app:false,anon:false,backend:true });
    await db.exec('set role authenticated');
    await assert.rejects(ingest([]),/permission denied/);
    await db.exec('reset role; set role service_role');
    assert.deepEqual(await ingest([]),counts(0,0,0,0),'only the existing backend service can call this RPC');
    await db.exec('reset role');
    await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/202610040003_journal_ingest_counts.sql'),'utf8'));
    assert.deepEqual(await ingest([second]),counts(1,0,0,1));
    console.log('PASS: actual counts, batch duplicates, metadata enrichment and provenance, unchanged timestamps, read retention/history, atomic ownership validation, RPC access and repeat migration.');
  } finally { await db.close(); }
}
main().catch(error => { console.error(error); process.exitCode=1; });
