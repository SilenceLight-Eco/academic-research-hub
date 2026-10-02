-- Keep only compact identities after the three-day read-article cleanup.
-- Database triggers cover both the hourly cron and Edge Function cleanup paths.
begin;

create schema if not exists journal_tracker_private;
revoke all on schema journal_tracker_private from public, anon, authenticated;

create table if not exists journal_tracker_private.read_article_history (
  subscription_id uuid not null references public.journal_subscriptions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  identity_key text not null,
  read_at timestamptz not null,
  primary key (subscription_id, identity_key)
);
alter table journal_tracker_private.read_article_history enable row level security;
revoke all on journal_tracker_private.read_article_history from public, anon, authenticated;

create or replace function public.journal_article_identity_keys(article_doi text, article_title text)
returns text[] language sql immutable set search_path = '' as $$
  select array_remove(array[
    case when btrim(coalesce(article_doi, '')) <> '' then
      'doi:' || lower(regexp_replace(btrim(article_doi), '^https?://(dx\.)?doi\.org/|^doi:\s*', '', 'i'))
    end,
    case when length(regexp_replace(lower(normalize(coalesce(article_title, ''), NFKC)), '[^[:alnum:]]', '', 'g')) >= 20 then
      'title:' || md5(regexp_replace(lower(normalize(article_title, NFKC)), '[^[:alnum:]]', '', 'g'))
    end
  ], null);
$$;

create index if not exists journal_articles_identity_keys_idx
  on public.journal_articles using gin (public.journal_article_identity_keys(doi, title));

-- Reading is remembered immediately, not only when an article is deleted.
-- Explicitly marking a visible article unread removes its corresponding history.
create or replace function public.remember_journal_article_read()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  keys text[];
begin
  keys := public.journal_article_identity_keys(new.doi, new.title);
  if new.is_read and new.read_at is not null then
    insert into journal_tracker_private.read_article_history(subscription_id, user_id, identity_key, read_at)
      select new.subscription_id, new.user_id, key, new.read_at from unnest(keys) as key
    on conflict (subscription_id, identity_key) do update
      set read_at = least(journal_tracker_private.read_article_history.read_at, excluded.read_at);
  elsif tg_op = 'UPDATE' and not new.is_read then
    delete from journal_tracker_private.read_article_history
      where subscription_id = new.subscription_id and user_id = new.user_id
        and identity_key = any(keys || public.journal_article_identity_keys(old.doi, old.title));
  end if;
  return new;
end;
$$;

create or replace function public.prevent_journal_article_rediscovery()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  keys text[];
  existing_key text;
  existing_read_at timestamptz;
begin
  -- Also prevents a client from borrowing another user's subscription ID.
  if not exists (select 1 from public.journal_subscriptions s
    where s.id = new.subscription_id and s.user_id = new.user_id) then
    raise exception 'Article subscription does not belong to this user' using errcode = '23514';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.subscription_id::text, 0));
  keys := public.journal_article_identity_keys(new.doi, new.title);
  select a.article_key, case when a.is_read then a.read_at end
    into existing_key, existing_read_at from public.journal_articles a
    where a.subscription_id = new.subscription_id and a.user_id = new.user_id
      and (a.article_key = new.article_key
        or public.journal_article_identity_keys(a.doi, a.title) && keys)
    order by (a.article_key = new.article_key) desc, a.is_read desc, a.discovered_at asc
    limit 1;
  if found then
    if existing_read_at is not null then
      -- Remember newly discovered DOI/title aliases as well as the original key.
      insert into journal_tracker_private.read_article_history(subscription_id, user_id, identity_key, read_at)
        select new.subscription_id, new.user_id, key, existing_read_at from unnest(keys) as key
      on conflict (subscription_id, identity_key) do update
        set read_at = least(journal_tracker_private.read_article_history.read_at, excluded.read_at);
    end if;
    -- Exact keys can still upsert richer metadata without resetting read state.
    -- Alternate keys (DOI added later, date changes, punctuation changes) must
    -- not create a second visible row, including within the same insert batch.
    if existing_key <> new.article_key then return null; end if;
    return new;
  end if;
  if exists (select 1 from journal_tracker_private.read_article_history h
    where h.subscription_id = new.subscription_id and h.user_id = new.user_id
      and h.identity_key = any(keys)) then
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists journal_article_remember_read on public.journal_articles;
create trigger journal_article_remember_read
  after insert or update on public.journal_articles
  for each row execute function public.remember_journal_article_read();
drop trigger if exists journal_article_prevent_rediscovery on public.journal_articles;
create trigger journal_article_prevent_rediscovery
  before insert on public.journal_articles
  for each row execute function public.prevent_journal_article_rediscovery();

insert into journal_tracker_private.read_article_history(subscription_id, user_id, identity_key, read_at)
  select a.subscription_id, a.user_id, k.key, min(a.read_at)
  from public.journal_articles a
  cross join lateral unnest(public.journal_article_identity_keys(a.doi, a.title)) as k(key)
  where a.is_read and a.read_at is not null
  group by a.subscription_id, a.user_id, k.key
on conflict (subscription_id, identity_key) do update
  set read_at = least(journal_tracker_private.read_article_history.read_at, excluded.read_at);

revoke all on function public.remember_journal_article_read() from public, anon, authenticated;
revoke all on function public.prevent_journal_article_rediscovery() from public, anon, authenticated;
comment on table journal_tracker_private.read_article_history is
  'Compact read-article identities retained after 3-day cleanup to prevent rediscovery. Cleared when subscription/account is deleted.';
commit;
