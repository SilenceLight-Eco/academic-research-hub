-- Keep read journal-tracker articles for three full days, then purge them hourly.
create extension if not exists pg_cron;

create index if not exists journal_articles_expired_read_idx
  on public.journal_articles (read_at)
  where is_read = true and read_at is not null;

select cron.schedule(
  'journal-read-retention-hourly',
  '0 * * * *',
  $$
    delete from public.journal_articles
    where is_read = true
      and read_at is not null
      and read_at < now() - interval '3 days';
  $$
);
