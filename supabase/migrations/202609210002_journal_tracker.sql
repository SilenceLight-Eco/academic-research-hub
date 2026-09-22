create extension if not exists pgcrypto;

create table if not exists public.journal_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  issn text not null,
  journal_title text not null,
  publisher text not null default '',
  feed_url text not null default '',
  enabled boolean not null default true,
  last_checked_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, issn)
);

alter table public.journal_subscriptions
  add column if not exists feed_url text not null default '';

create table if not exists public.journal_articles (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.journal_subscriptions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  article_key text not null,
  doi text,
  title text not null,
  authors text[] not null default '{}',
  abstract text not null default '',
  abstract_source text not null default '',
  keywords text[] not null default '{}',
  keyword_source text not null default '',
  publication_date date,
  url text not null default '',
  metadata_sources text[] not null default '{}',
  discovered_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subscription_id, article_key)
);

create index if not exists journal_subscriptions_user_id_idx
  on public.journal_subscriptions (user_id, created_at desc);
create index if not exists journal_articles_user_date_idx
  on public.journal_articles (user_id, publication_date desc nulls last, discovered_at desc);
create index if not exists journal_articles_subscription_idx
  on public.journal_articles (subscription_id, publication_date desc nulls last);

alter table public.journal_subscriptions enable row level security;
alter table public.journal_articles enable row level security;

drop policy if exists "Users manage their journal subscriptions" on public.journal_subscriptions;
create policy "Users manage their journal subscriptions"
  on public.journal_subscriptions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users manage their tracked articles" on public.journal_articles;
create policy "Users manage their tracked articles"
  on public.journal_articles
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

comment on table public.journal_subscriptions is 'Per-user academic journal tracking subscriptions.';
comment on table public.journal_articles is 'Articles discovered by the daily journal tracker.';
