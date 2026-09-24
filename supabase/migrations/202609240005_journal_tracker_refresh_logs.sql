-- Keep a short, per-user audit trail of journal refresh attempts.
create table if not exists public.journal_tracker_refresh_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subscription_id uuid not null references public.journal_subscriptions(id) on delete cascade,
  checked_at timestamptz not null default now(),
  source text not null default 'manual',
  ok boolean not null,
  article_count integer not null default 0 check (article_count >= 0),
  error text
);

create index if not exists journal_tracker_refresh_logs_user_checked_idx
  on public.journal_tracker_refresh_logs (user_id, checked_at desc);

alter table public.journal_tracker_refresh_logs enable row level security;
grant select on public.journal_tracker_refresh_logs to authenticated;
grant all on public.journal_tracker_refresh_logs to service_role;

drop policy if exists journal_tracker_refresh_logs_select_own on public.journal_tracker_refresh_logs;
create policy journal_tracker_refresh_logs_select_own
  on public.journal_tracker_refresh_logs
  for select to authenticated
  using (auth.uid() = user_id);
