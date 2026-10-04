-- Preserve identities learned before reading as well as after reading.
-- No article content is removed or automatically marked read by this migration.
begin;

create table if not exists journal_tracker_private.article_identity_aliases (
  article_id uuid not null references public.journal_articles(id) on delete cascade,
  subscription_id uuid not null references public.journal_subscriptions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  identity_key text not null,
  primary key (article_id, identity_key)
);
alter table journal_tracker_private.article_identity_aliases enable row level security;
revoke all on journal_tracker_private.article_identity_aliases from public, anon, authenticated;
create index if not exists journal_article_alias_lookup_idx
  on journal_tracker_private.article_identity_aliases(subscription_id, user_id, identity_key);

insert into journal_tracker_private.article_identity_aliases(article_id, subscription_id, user_id, identity_key)
  select a.id, a.subscription_id, a.user_id, k.key from public.journal_articles a
  cross join lateral unnest(public.journal_article_identity_keys(a.doi, a.title)) k(key)
on conflict do nothing;

create or replace function public.remember_journal_article_read()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  keys text[];
begin
  if tg_op = 'DELETE' then
    -- Also covers direct SQL/cron cleanup; aliases cascade only AFTER this trigger.
    if old.is_read and old.read_at is not null
      and exists (select 1 from public.journal_subscriptions s join auth.users u on u.id=s.user_id
        where s.id=old.subscription_id and s.user_id=old.user_id) then
      insert into journal_tracker_private.read_article_history(subscription_id,user_id,identity_key,read_at)
        select old.subscription_id,old.user_id,k.key,old.read_at
        from unnest(public.journal_article_identity_keys(old.doi,old.title) || array(
          select x.identity_key from journal_tracker_private.article_identity_aliases x where x.article_id=old.id)) k(key)
        group by k.key
      on conflict (subscription_id,identity_key) do update
        set read_at=least(journal_tracker_private.read_article_history.read_at,excluded.read_at);
    end if;
    return old;
  end if;
  keys := public.journal_article_identity_keys(new.doi,new.title);
  if tg_op = 'UPDATE' then
    keys := keys || public.journal_article_identity_keys(old.doi,old.title);
  end if;
  insert into journal_tracker_private.article_identity_aliases(article_id,subscription_id,user_id,identity_key)
    select new.id,new.subscription_id,new.user_id,k.key from unnest(keys) k(key)
  on conflict do nothing;
  keys := array(select x.identity_key from journal_tracker_private.article_identity_aliases x where x.article_id=new.id);
  if new.is_read and new.read_at is not null then
    insert into journal_tracker_private.read_article_history(subscription_id,user_id,identity_key,read_at)
      select new.subscription_id,new.user_id,k.key,new.read_at from unnest(keys) k(key)
    on conflict (subscription_id,identity_key) do update
      set read_at=least(journal_tracker_private.read_article_history.read_at,excluded.read_at);
  elsif tg_op = 'UPDATE' then
    -- Only a real read -> unread transition is an explicit unread action.
    -- Metadata updates on unread rows must not erase independent read history.
    if old.is_read and not new.is_read then
      delete from journal_tracker_private.read_article_history h
        where h.subscription_id=new.subscription_id and h.user_id=new.user_id
          and h.identity_key=any(keys)
          and not exists (select 1 from public.journal_articles a
            where a.id<>new.id and a.subscription_id=new.subscription_id and a.user_id=new.user_id
              and a.is_read and a.read_at is not null
              and (h.identity_key=any(public.journal_article_identity_keys(a.doi,a.title))
                or exists (select 1 from journal_tracker_private.article_identity_aliases x
                  where x.article_id=a.id and x.identity_key=h.identity_key)));
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.prevent_journal_article_rediscovery()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  keys text[];
  existing_id uuid;
  existing_key text;
  existing_read_at timestamptz;
  remembered_at timestamptz;
begin
  if not exists (select 1 from public.journal_subscriptions s
    where s.id=new.subscription_id and s.user_id=new.user_id) then
    raise exception 'Article subscription does not belong to this user' using errcode='23514';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.subscription_id::text,0));
  keys := public.journal_article_identity_keys(new.doi,new.title);
  select a.id,a.article_key,case when a.is_read then a.read_at end
    into existing_id,existing_key,existing_read_at from public.journal_articles a
    where a.subscription_id=new.subscription_id and a.user_id=new.user_id
      and (a.article_key=new.article_key or public.journal_article_identity_keys(a.doi,a.title) && keys
        or exists (select 1 from journal_tracker_private.article_identity_aliases x
          where x.article_id=a.id and x.identity_key=any(keys)))
    order by (a.article_key=new.article_key) desc,a.is_read desc,a.discovered_at asc limit 1;
  if found then
    -- Do not discard incoming DOI/title identities when skipping a duplicate,
    -- even if the existing article has not yet been read.
    insert into journal_tracker_private.article_identity_aliases(article_id,subscription_id,user_id,identity_key)
      select existing_id,new.subscription_id,new.user_id,k.key from unnest(keys) k(key)
    on conflict do nothing;
    if existing_read_at is not null then
      insert into journal_tracker_private.read_article_history(subscription_id,user_id,identity_key,read_at)
        select new.subscription_id,new.user_id,k.key,existing_read_at from unnest(keys) k(key)
      on conflict (subscription_id,identity_key) do update
        set read_at=least(journal_tracker_private.read_article_history.read_at,excluded.read_at);
    end if;
    if existing_key<>new.article_key then return null; end if;
    return new;
  end if;
  select min(h.read_at) into remembered_at from journal_tracker_private.read_article_history h
    where h.subscription_id=new.subscription_id and h.user_id=new.user_id and h.identity_key=any(keys);
  if remembered_at is not null then
    -- Keep new aliases from a rediscovery attempt, not just its original keys.
    insert into journal_tracker_private.read_article_history(subscription_id,user_id,identity_key,read_at)
      select new.subscription_id,new.user_id,k.key,remembered_at from unnest(keys) k(key)
    on conflict (subscription_id,identity_key) do update
      set read_at=least(journal_tracker_private.read_article_history.read_at,excluded.read_at);
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists journal_article_remember_before_delete on public.journal_articles;
create trigger journal_article_remember_before_delete before delete on public.journal_articles
  for each row execute function public.remember_journal_article_read();

insert into journal_tracker_private.read_article_history(subscription_id,user_id,identity_key,read_at)
  select x.subscription_id,x.user_id,x.identity_key,min(a.read_at)
  from journal_tracker_private.article_identity_aliases x join public.journal_articles a on a.id=x.article_id
  where a.is_read and a.read_at is not null group by x.subscription_id,x.user_id,x.identity_key
on conflict (subscription_id,identity_key) do update
  set read_at=least(journal_tracker_private.read_article_history.read_at,excluded.read_at);

revoke all on function public.remember_journal_article_read() from public,anon,authenticated;
revoke all on function public.prevent_journal_article_rediscovery() from public,anon,authenticated;
comment on table journal_tracker_private.article_identity_aliases is
  'Private DOI/title fingerprints learned while an article is visible; read aliases survive three-day cleanup in read_article_history.';
commit;
