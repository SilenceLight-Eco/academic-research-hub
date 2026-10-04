const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(process.argv[2] || '@electric-sql/pglite');
const user = '10000000-0000-0000-0000-000000000001';
const sub = '20000000-0000-0000-0000-000000000001';
async function main() {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create table journal_subscriptions(id uuid primary key,user_id uuid references auth.users(id) on delete cascade);
      create table journal_articles(id uuid primary key default gen_random_uuid(),subscription_id uuid references journal_subscriptions(id) on delete cascade,
        user_id uuid references auth.users(id) on delete cascade,article_key text not null,doi text,title text not null,url text not null default '',
        is_read boolean not null default false,read_at timestamptz,discovered_at timestamptz not null default now(),abstract text default '',unique(subscription_id,article_key));
      insert into auth.users values('${user}'); insert into journal_subscriptions values('${sub}','${user}');`);
    const files = ['202610020001_journal_read_dedup_history.sql','202610040001_journal_identity_aliases.sql','202610040002_journal_url_identities.sql'];
    for (const file of files) {
      const target = path.join(__dirname,'../supabase/migrations',file);
      if (file === files[2]) {
        await db.exec(`insert into journal_articles(subscription_id,user_id,article_key,title,url,is_read,read_at)
          values('${sub}','${user}','legacy','Short','https://nber.org/papers/w12340',true,now()-interval '4 days')`);
      }
      if (fs.existsSync(target)) await db.exec(fs.readFileSync(target,'utf8'));
    }
    const insert = (key,title,url) => db.query(`insert into journal_articles(subscription_id,user_id,article_key,title,url)
      values($1,$2,$3,$4,$5) on conflict(subscription_id,article_key) do update set url=excluded.url returning id`,[sub,user,key,title,url]);
    const count = async () => Number((await db.query('select count(*) n from journal_articles')).rows[0].n);
    await db.exec("delete from journal_articles where article_key='legacy'");
    await insert('legacy-replay','Changed','https://nber.org/papers/w12340.pdf');
    assert.equal(await count(),0,'upgrade must backfill existing read articles before cleanup');
    await insert('rss-date-1','Shipping to America','https://www.nber.org/papers/w12345?utm_source=rss#abstract');
    await insert('rss-date-2','Shipping to America revised','http://nber.org/system/files/working_papers/w12345/w12345.pdf');
    assert.equal(await count(),1,'NBER landing/PDF URLs and title/date changes must identify the same paper');
    await db.exec("update journal_articles set is_read=true,read_at=now()-interval '4 days'");
    await db.exec("delete from journal_articles where is_read and read_at<now()-interval '3 days'");
    await insert('rss-date-3','An entirely replaced paper title','https://nber.org/papers/w12345.rev2.pdf');
    assert.equal(await count(),0,'NBER number history must survive cleanup');
    await insert('other-nber','Shipping to America','https://nber.org/papers/w12346');
    assert.equal(await count(),1,'same short title with a different paper number must not be merged');
    await insert('short','Crime in Covid Times','https://example.org/article?id=21&utm_medium=rss');
    await insert('short-new','Updated short title','http://www.example.org/article?utm_source=mail&id=21#section');
    assert.equal(await count(),2,'tracking parameters must not duplicate a paper');
    await insert('different-id','Crime in Covid Times','https://example.org/article?id=22');
    assert.equal(await count(),3,'identity query parameters must not be discarded');
    await insert('case-sensitive','Another short title','https://example.org/Article?id=21');
    assert.equal(await count(),4,'URL paths must remain case sensitive');
    await db.exec("update journal_articles set is_read=true,read_at=now()-interval '4 days'");
    await db.exec("delete from journal_articles where is_read and read_at<now()-interval '3 days'");
    await insert('again','Changed after deletion','https://example.org/article?id=21');
    assert.equal(await count(),0,'generic article URL history must survive cleanup');
    const keys = async url => (await db.query('select public.journal_article_identity_keys(null,\'Short\',$1) keys',[url])).rows[0].keys;
    assert.deepEqual(await keys('https://example.org/'),[],'shared home pages are not article identities');
    assert.deepEqual(await keys('javascript:alert(1)'),[]);
    assert.deepEqual(await keys('https://nber.org.attacker.test/papers/w12345'),(await keys('https://nber.org.attacker.test/papers/w12345')).filter(k=>!k.startsWith('nber:')));
    assert.ok((await keys('https://nber.org/papers/t0123')).includes('nber:t0123'));
    assert.ok((await keys('https://doi.org/10.1234/EXAMPLE')).includes('doi:10.1234/example'));
    assert.deepEqual(await keys('https://example.org/articles/'),[],'shared listings are not article identities');
    await insert('manual-unread','Short','https://example.org/items/one');
    await db.exec("update journal_articles set is_read=true,read_at=now()");
    const upsert=await insert('manual-unread','Short','https://example.org/items/one');
    assert.equal(upsert.rows.length,1);
    assert.equal((await db.query('select is_read from journal_articles')).rows[0].is_read,true,'same-key metadata upserts must keep read state');
    await db.exec("update journal_articles set is_read=false,read_at=null");
    assert.equal(Number((await db.query("select count(*) n from journal_tracker_private.read_article_history where identity_key=any(public.journal_article_identity_keys(null,'Short','https://example.org/items/one'))")).rows[0].n),0,'explicit unread clears URL history');
    await db.exec('delete from journal_articles');
    await insert('manual-unread-again','Short','https://example.org/items/one');
    assert.equal(await count(),1,'manually unread articles may be rediscovered after removal');
    const migration=fs.readFileSync(path.join(__dirname,'../supabase/migrations/202610040002_journal_url_identities.sql'),'utf8');
    await db.exec(migration); await db.exec(migration);
    await db.exec('delete from journal_subscriptions');
    assert.equal(Number((await db.query('select count(*) n from journal_tracker_private.read_article_history')).rows[0].n),0);
    console.log('PASS: NBER IDs, PDFs/revisions, short-title isolation, tracking/query parameters, cleanup, URL path case, shared pages, DOI URLs and idempotent migration.');
  } finally { await db.close(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
