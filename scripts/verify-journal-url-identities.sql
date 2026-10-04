-- Production verification: article insertion probes are rolled back, never committed.
-- First set the target account UUID in this SQL Editor session:
-- select set_config('journal_tracker.verify_user_id','<ACCOUNT_UUID>',false);
begin;
do $$ begin
  if nullif(current_setting('journal_tracker.verify_user_id',true),'') is null then
    raise exception 'Set journal_tracker.verify_user_id to the account UUID before running the probe';
  end if;
end $$;
create temporary table journal_identity_probe_result(label text, result text) on commit drop;
with samples as (
  select a.* from public.journal_articles a join auth.users u on u.id=a.user_id
  where u.id=nullif(current_setting('journal_tracker.verify_user_id',true),'')::uuid and a.title in ('Shipping to America','Crime in Covid Times')
), replay as (
  insert into public.journal_articles(subscription_id,user_id,article_key,title,url)
  select subscription_id,user_id,'__url_identity_probe__'||id::text,'Short replay',url from samples
  returning id
)
insert into journal_identity_probe_result
  select 'Duplicate insertions (expected 0)',count(*)::text from replay;
insert into journal_identity_probe_result
select 'Real short-title samples',count(*)::text
  from public.journal_articles a join auth.users u on u.id=a.user_id
  where u.id=nullif(current_setting('journal_tracker.verify_user_id',true),'')::uuid and a.title in ('Shipping to America','Crime in Covid Times');
insert into journal_identity_probe_result
select 'Missing current aliases (expected 0)',count(*)::text
  from public.journal_articles a
  cross join lateral unnest(public.journal_article_identity_keys(a.doi,a.title,a.url)) k(key)
  where not exists (select 1 from journal_tracker_private.article_identity_aliases x
    where x.article_id=a.id and x.identity_key=k.key);
insert into journal_identity_probe_result
select 'Missing read history (expected 0)',count(*)::text
  from public.journal_articles a
  cross join lateral unnest(public.journal_article_identity_keys(a.doi,a.title,a.url)) k(key)
  where a.is_read and a.read_at is not null and not exists (
    select 1 from journal_tracker_private.read_article_history h
    where h.subscription_id=a.subscription_id and h.user_id=a.user_id and h.identity_key=k.key);
insert into journal_identity_probe_result
select 'NBER PDF / landing identity matches',
  (public.journal_article_identity_keys(null,'Short','https://nber.org/papers/w12345') &&
   public.journal_article_identity_keys(null,'Different','https://nber.org/system/files/working_papers/w12345/w12345.pdf'))::text;
select * from journal_identity_probe_result;
rollback;
