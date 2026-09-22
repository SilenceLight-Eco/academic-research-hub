-- Existing tracked articles remain read; newly discovered articles start unread.
alter table public.journal_articles
  add column if not exists is_read boolean not null default true;

alter table public.journal_articles
  add column if not exists read_at timestamptz;

update public.journal_articles
set read_at = coalesce(read_at, updated_at, discovered_at)
where is_read = true and read_at is null;

alter table public.journal_articles
  alter column is_read set default false;
