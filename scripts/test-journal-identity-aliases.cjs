// Exercises the deployed SQL migrations against an isolated PostgreSQL.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(process.argv[2] || '@electric-sql/pglite');
const user = '10000000-0000-0000-0000-000000000001';
const sub = '20000000-0000-0000-0000-000000000001';
const title = 'A long original journal article title about environmental policy';

async function main() {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create table journal_subscriptions(id uuid primary key, user_id uuid references auth.users(id));
      create table journal_articles(
        id uuid primary key default gen_random_uuid(), subscription_id uuid references journal_subscriptions(id) on delete cascade,
        user_id uuid references auth.users(id), article_key text not null, doi text, title text not null,
        is_read boolean not null default false, read_at timestamptz, discovered_at timestamptz not null default now(),
        abstract text default '', unique(subscription_id,article_key));
      insert into auth.users values('${user}'); insert into journal_subscriptions values('${sub}','${user}');
    `);
    for (const file of ['202610020001_journal_read_dedup_history.sql', '202610040001_journal_identity_aliases.sql']) {
      const target = path.join(__dirname, '../supabase/migrations', file);
      if (fs.existsSync(target)) await db.exec(fs.readFileSync(target, 'utf8'));
    }
    const insert = (key, doi, text = title) => db.query(`
      insert into journal_articles(subscription_id,user_id,article_key,doi,title) values($1,$2,$3,$4,$5)
      on conflict(subscription_id,article_key) do update set abstract='Enriched'
      returning id`, [sub,user,key,doi,text]);
    const count = async () => Number((await db.query('select count(*) n from journal_articles')).rows[0].n);
    await insert('rss-title|2026-10-01', null);
    await insert('10.1234/late-doi', '10.1234/late-doi');
    assert.equal(await count(), 1);
    // A DOI discovered BEFORE reading must not be discarded when its duplicate row is skipped.
    await db.exec("update journal_articles set is_read=true,read_at=now()-interval '4 days'");
    await db.exec("delete from journal_articles where is_read and read_at < now()-interval '3 days'");
    await insert('10.1234/late-doi', '10.1234/late-doi', 'A completely renamed publisher title for the same academic paper');
    assert.equal(await count(), 0, 'DOI learned before reading must survive cleanup and a title change');
    // A later title alias learned from history must also persist.
    await insert('renamed|new-date', null, 'A completely renamed publisher title for the same academic paper');
    assert.equal(await count(), 0, 'new aliases of an already cleaned read paper must be remembered');
    await insert('fresh', '10.1234/fresh', 'An entirely new and unrelated academic journal article');
    assert.equal(await count(), 1);
    // An unrelated metadata update on an unread legacy row must not erase read history.
    await db.query(`insert into journal_tracker_private.read_article_history values($1,$2,'doi:10.1234/fresh',now())`, [sub,user]);
    await db.exec("update journal_articles set abstract='New metadata'");
    assert.equal(Number((await db.query("select count(*) n from journal_tracker_private.read_article_history where identity_key='doi:10.1234/fresh'")).rows[0].n), 1);
    // Explicit unread still works and clears aliases, not just the current DOI/title.
    await insert('10.1234/fresh-alias', '10.1234/fresh-alias', 'An entirely new and unrelated academic journal article');
    await db.exec("update journal_articles set is_read=true,read_at=now()");
    await db.exec("update journal_articles set is_read=false,read_at=null");
    assert.equal(Number((await db.query("select count(*) n from journal_tracker_private.read_article_history where identity_key like 'doi:10.1234/fresh%'")).rows[0].n), 0);
    await db.exec('alter table journal_articles disable trigger journal_article_remember_read');
    await db.exec("update journal_articles set is_read=true,read_at=now()-interval '4 days'");
    await db.exec("delete from journal_articles where is_read and read_at < now()-interval '3 days'");
    await db.exec('alter table journal_articles enable trigger journal_article_remember_read');
    await insert('10.1234/fresh-alias', '10.1234/fresh-alias', 'A second publisher title that changed entirely after reading');
    assert.equal(await count(), 0, 'before-delete trigger independently preserves read aliases');
    await assert.rejects(db.query(`insert into journal_articles(subscription_id,user_id,article_key,title)
      values($1,'10000000-0000-0000-0000-000000000002','borrowed','An unrelated article belonging to another user')`,[sub]),
      /subscription does not belong/);
    // Reported production example: a previously read paper reappeared on Oct 3
    // without any surviving read history. Once restored, successive refreshes
    // and the three-day cleanup must not turn it into a new unread article.
    const reportedTitle = 'Does innovation success need advocacy? Stakeholder involvement in firm innovation';
    const reportedDoi = '10.1002/smj.70127';
    await insert(reportedDoi, reportedDoi, reportedTitle);
    await db.exec("update journal_articles set is_read=true,read_at=now()-interval '4 days'");
    const restoredAt = (await db.query('select read_at from journal_articles')).rows[0].read_at;
    for (let refresh = 0; refresh < 3; refresh++) {
      await insert(reportedDoi, reportedDoi, reportedTitle);
      const article = (await db.query('select is_read,read_at from journal_articles')).rows[0];
      assert.equal(article.is_read, true, 'a refresh must preserve the reported article reading status');
      assert.deepEqual(article.read_at, restoredAt, 'a refresh must not extend its read retention');
    }
    await db.exec("delete from journal_articles where is_read and read_at < now()-interval '3 days'");
    for (let refresh = 0; refresh < 3; refresh++) {
      await insert(reportedDoi, reportedDoi, reportedTitle);
      await insert('rss-date-change|' + refresh, null, reportedTitle.replace('?', ':'));
      assert.equal(await count(), 0, 'the reported article must stay absent after cleanup and repeated rediscovery');
    }
    // Alias storage is private and cannot link another user's data.
    assert.equal((await db.query("select has_table_privilege('authenticated','journal_tracker_private.article_identity_aliases','SELECT') allowed")).rows[0].allowed, false);
    const migration = fs.readFileSync(path.join(__dirname, '../supabase/migrations/202610040001_journal_identity_aliases.sql'), 'utf8');
    await db.exec(migration);
    await db.exec(migration);
    await db.exec('delete from journal_subscriptions');
    assert.equal(Number((await db.query('select count(*) n from journal_tracker_private.article_identity_aliases')).rows[0].n), 0);
    console.log('PASS: aliases learned before reading, cleanup, title changes, history alias expansion, metadata-only updates, explicit unread, private access and repeated migration.');
  } finally { await db.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
