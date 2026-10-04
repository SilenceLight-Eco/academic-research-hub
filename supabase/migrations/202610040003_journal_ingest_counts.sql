-- Count actual writes atomically, using the same identities and locks as rediscovery prevention.
begin;
create or replace function public.ingest_journal_articles(p_subscription_id uuid, p_user_id uuid, p_articles jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  item jsonb;
  incoming public.journal_articles%rowtype;
  previous public.journal_articles%rowtype;
  enriched public.journal_articles%rowtype;
  identity_keys text[];
  inserted_id uuid;
  added_count integer := 0;
  enriched_count integer := 0;
  duplicate_count integer := 0;
  read_blocked_count integer := 0;
  content_changed boolean;
begin
  if jsonb_typeof(p_articles) is distinct from 'array' or jsonb_array_length(p_articles)>200 then
    raise exception 'Expected at most 200 article rows' using errcode='22023';
  end if;
  if not exists (select 1 from public.journal_subscriptions s where s.id=p_subscription_id and s.user_id=p_user_id) then
    raise exception 'Article subscription does not belong to this user' using errcode='23514';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_subscription_id::text,0));
  for item in select value from jsonb_array_elements(p_articles) loop
    incoming := jsonb_populate_record(null::public.journal_articles,item);
    if incoming.subscription_id is distinct from p_subscription_id or incoming.user_id is distinct from p_user_id
      or nullif(btrim(incoming.article_key),'') is null or nullif(btrim(incoming.title),'') is null then
      raise exception 'Invalid article ownership or identity' using errcode='23514';
    end if;
    identity_keys := public.journal_article_identity_keys(incoming.doi,incoming.title,incoming.url);
    select a.* into previous from public.journal_articles a
      where a.subscription_id=p_subscription_id and a.user_id=p_user_id
        and (a.article_key=incoming.article_key or public.journal_article_identity_keys(a.doi,a.title,a.url) && identity_keys
          or exists (select 1 from journal_tracker_private.article_identity_aliases x
            where x.article_id=a.id and x.identity_key=any(identity_keys)))
      order by (a.article_key=incoming.article_key) desc,a.is_read desc,a.discovered_at asc limit 1 for update;
    -- Always run the existing insertion trigger: even skipped rows may teach new aliases.
    insert into public.journal_articles(subscription_id,user_id,article_key,doi,title,authors,abstract,abstract_source,
      keywords,keyword_source,publication_date,url,metadata_sources,updated_at)
      values(p_subscription_id,p_user_id,incoming.article_key,incoming.doi,incoming.title,coalesce(incoming.authors,'{}'),
        coalesce(incoming.abstract,''),coalesce(incoming.abstract_source,''),coalesce(incoming.keywords,'{}'),
        coalesce(incoming.keyword_source,''),incoming.publication_date,coalesce(incoming.url,''),
        coalesce(incoming.metadata_sources,'{}'),coalesce(incoming.updated_at,now()))
      on conflict(subscription_id,article_key) do nothing returning id into inserted_id;
    if inserted_id is not null then
      added_count := added_count+1;
    elsif previous.id is null then
      duplicate_count := duplicate_count+1;
      read_blocked_count := read_blocked_count+1;
    else
      enriched := previous;
      enriched.doi := coalesce(nullif(btrim(previous.doi),''),nullif(btrim(incoming.doi),''));
      if coalesce(cardinality(previous.authors),0)=0 then enriched.authors := coalesce(incoming.authors,'{}'); end if;
      if btrim(previous.abstract)='' and btrim(coalesce(incoming.abstract,''))<>'' then
        enriched.abstract := incoming.abstract;
        enriched.abstract_source := coalesce(incoming.abstract_source,'');
      end if;
      if coalesce(cardinality(previous.keywords),0)=0 and coalesce(cardinality(incoming.keywords),0)>0 then
        enriched.keywords := incoming.keywords;
        enriched.keyword_source := coalesce(incoming.keyword_source,'');
      end if;
      enriched.publication_date := coalesce(previous.publication_date,incoming.publication_date);
      if btrim(previous.url)='' then enriched.url := coalesce(incoming.url,''); end if;
      enriched.metadata_sources := array(select distinct s.source from unnest(
        coalesce(previous.metadata_sources,'{}') || coalesce(incoming.metadata_sources,'{}')) s(source) order by s.source);
      content_changed := row(previous.doi,previous.authors,previous.abstract,previous.abstract_source,
        previous.keywords,previous.keyword_source,previous.publication_date,previous.url) is distinct from
        row(enriched.doi,enriched.authors,enriched.abstract,enriched.abstract_source,
        enriched.keywords,enriched.keyword_source,enriched.publication_date,enriched.url);
      if content_changed or previous.metadata_sources is distinct from enriched.metadata_sources then
        update public.journal_articles set doi=enriched.doi,authors=enriched.authors,abstract=enriched.abstract,
          abstract_source=enriched.abstract_source,keywords=enriched.keywords,keyword_source=enriched.keyword_source,
          publication_date=enriched.publication_date,url=enriched.url,metadata_sources=enriched.metadata_sources,updated_at=now()
          where id=previous.id;
      end if;
      if content_changed then enriched_count := enriched_count+1;
      else
        duplicate_count := duplicate_count+1;
        if previous.is_read then read_blocked_count := read_blocked_count+1; end if;
      end if;
    end if;
  end loop;
  return jsonb_build_object('processed',added_count+enriched_count+duplicate_count,'added',added_count,
    'enriched',enriched_count,'duplicates',duplicate_count,'read_blocked',read_blocked_count);
end;
$$;
revoke all on function public.ingest_journal_articles(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.ingest_journal_articles(uuid,uuid,jsonb) to service_role;
comment on function public.ingest_journal_articles(uuid,uuid,jsonb) is
  'Backend-only atomic ingest: added / missing metadata enriched / duplicates skipped. Keeps reading status and provenance.';
notify pgrst,'reload schema';
commit;
