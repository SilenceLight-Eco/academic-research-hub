-- Persist the actual discovery source and outcome of each subscription check.
alter table public.journal_subscriptions
  add column if not exists last_sync_details jsonb not null default '{}'::jsonb;

alter table public.journal_tracker_refresh_logs
  add column if not exists details jsonb not null default '{}'::jsonb;

comment on column public.journal_subscriptions.last_sync_details is
  'Latest check: actual discovery source, success/fallback/error, processed count, completion time and duration.';
comment on column public.journal_tracker_refresh_logs.details is
  'Discovery diagnostics for this check; source remains the trigger (scheduled/manual/etc).';
