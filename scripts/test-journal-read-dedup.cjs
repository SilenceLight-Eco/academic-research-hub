// Run with: node scripts/test-journal-read-dedup.cjs <path-to-pglite-module>
// Tests execute the actual migration and SQL triggers in an isolated PostgreSQL.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(process.argv[2] || '@electric-sql/pglite');
const title = 'Political career incentives and the environmental costs: Evidence from China’s promotion tournaments';
const user = '10000000-0000-0000-0000-000000000001';
const sub = '20000000-0000-0000-0000-000000000001';
const otherSub = '20000000-0000-0000-0000-000000000002';

async function main() {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create table auth.users(id uuid primary key);
      create table public.journal_subscriptions(id uuid primary key, user_id uuid references auth.users(id) on delete cascade);
      create table public.journal_articles(
        id uuid primary key default gen_random_uuid(), subscription_id uuid references public.journal_subscriptions(id) on delete cascade,
        user_id uuid references auth.users(id) on delete cascade, article_key text not null, doi text, title text not null, url text not null default '',
        is_read boolean not null default false, read_at timestamptz, discovered_at timestamptz not null default now(),
        abstract text default '', unique(subscription_id, article_key));
      insert into auth.users values('${user}');
      insert into journal_subscriptions values('${sub}', '${user}'), ('${otherSub}', '${user}');
    `);
    const migration = ['202610020001_journal_read_dedup_history.sql', '202610040001_journal_identity_aliases.sql', '202610040002_journal_url_identities.sql']
      .map(file => fs.readFileSync(path.join(__dirname, '../supabase/migrations', file), 'utf8')).join('\n');
    await db.exec(migration);
    const insert = (key, doi, text = title, sid = sub) => db.query(`
      insert into journal_articles(subscription_id,user_id,article_key,doi,title)
      values($1,$2,$3,$4,$5)
      on conflict(subscription_id,article_key) do update set abstract = 'Updated metadata'
      returning id,is_read,read_at`, [sid,user,key,doi,text]);
    const count = async () => Number((await db.query('select count(*) as n from journal_articles')).rows[0].n);
    await insert('original-title|2025-01-01', null);
    await insert('new-title|2026-10-02', null, title.replace('China’s', "China's"));
    await insert('10.1234/example', '10.1234/example');
    assert.equal(await count(), 1, 'date/punctuation/DOI changes must not duplicate visible articles');
    await db.query(`update journal_articles set is_read=true,read_at=now()-interval '4 days' where subscription_id=$1`, [sub]);
    const before = (await db.query('select read_at from journal_articles')).rows[0].read_at;
    await insert('10.1234/example', '10.1234/example');
    await insert('original-title|2025-01-01', null);
    assert.equal((await db.query('select is_read from journal_articles')).rows[0].is_read, true);
    assert.deepEqual((await db.query('select read_at from journal_articles')).rows[0].read_at, before);
    // The production cron and Edge Function use this same hard cleanup condition.
    await db.exec("delete from journal_articles where is_read and read_at < now()-interval '3 days'");
    assert.equal(await count(), 0);
    await insert('original-title|2025-01-01', null);
    await insert('10.1234/example', '10.1234/example', title.replace('China’s', "China's"));
    await insert('10.1234/example', 'https://doi.org/10.1234/EXAMPLE', 'A publisher completely replaced this title');
    assert.equal(await count(), 0, 'cleaned read articles must not reappear as unread');
    await insert('new-paper', '10.1234/new', 'A genuinely different and newly published academic paper');
    assert.equal(await count(), 1, 'new papers must still be collected');
    await db.exec("update journal_articles set is_read=true,read_at=now()");
    await db.exec("update journal_articles set is_read=false,read_at=null");
    assert.equal(Number((await db.query("select count(*) n from journal_tracker_private.read_article_history where identity_key='doi:10.1234/new'")).rows[0].n), 0);
    await insert('other-journal', null, title, otherSub);
    assert.equal(await count(), 2, 'history must not leak between subscriptions');
    const normalized = (await db.query("select public.journal_article_identity_keys($1,$2) as keys", ['https://doi.org/10.1234/NEW', '中文期刊中的环境政策与企业绿色创新及其经济后果研究'])).rows[0].keys;
    assert.ok(normalized.includes('doi:10.1234/new'));
    assert.ok(normalized.some(key => key.startsWith('title:')), 'Chinese titles must have identities');
    await db.exec("update journal_articles set is_read=true,read_at=now()");
    // Add pre-existing duplicates, then rerun the backfill/migration safely.
    await db.exec('alter table journal_articles disable trigger journal_article_prevent_rediscovery');
    await insert('legacy-copy', '10.1234/new', 'A genuinely different and newly published academic paper');
    await db.exec("update journal_articles set is_read=true,read_at=now()");
    await db.exec(migration);
    await db.exec(migration);
    await db.query('delete from journal_subscriptions where id=$1', [sub]);
    assert.equal(Number((await db.query('select count(*) n from journal_tracker_private.read_article_history where subscription_id=$1',[sub])).rows[0].n), 0);
    await db.query('insert into journal_subscriptions values($1,$2)', [sub,user]);
    await insert('fresh-subscription', null);
    assert.equal(await count(), 2, 'explicit cancellation/re-subscription resets that subscription history');
    console.log('PASS: cleanup + rediscovery, DOI/title/date aliases, read-state preservation, new papers, unread override, Chinese titles, isolation, repeated backfill and cancellation.');
  } finally { await db.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
