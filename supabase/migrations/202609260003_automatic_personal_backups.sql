-- Opt-in daily snapshots for each account. Binary attachment contents are not duplicated.
create table if not exists public.automatic_backup_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.automatic_backups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  workspace_bytes bigint not null default 0,
  subscription_count integer not null default 0,
  article_count integer not null default 0,
  attachment_count integer not null default 0,
  payload jsonb not null
);

create index if not exists automatic_backups_user_created_idx
  on public.automatic_backups (user_id, created_at desc);

alter table public.automatic_backup_preferences enable row level security;
alter table public.automatic_backups enable row level security;

grant select, insert, update on public.automatic_backup_preferences to authenticated;
grant select on public.automatic_backups to authenticated;

drop policy if exists automatic_backup_preferences_select_own on public.automatic_backup_preferences;
create policy automatic_backup_preferences_select_own on public.automatic_backup_preferences
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists automatic_backup_preferences_insert_own on public.automatic_backup_preferences;
create policy automatic_backup_preferences_insert_own on public.automatic_backup_preferences
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists automatic_backup_preferences_update_own on public.automatic_backup_preferences;
create policy automatic_backup_preferences_update_own on public.automatic_backup_preferences
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists automatic_backups_select_own on public.automatic_backups;
create policy automatic_backups_select_own on public.automatic_backups
  for select to authenticated using (user_id = (select auth.uid()));

comment on table public.automatic_backup_preferences is 'Per-account opt-in for daily automatic workspace snapshots.';
comment on table public.automatic_backups is 'Daily JSON snapshots; attachment binaries remain in the original private bucket and are not copied.';

-- Reuse the existing journal-tracker cron secret stored in Vault and Edge Function Secrets.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'journal_tracker_cron_secret') then
    raise exception 'Missing Vault secret journal_tracker_cron_secret; configure the existing journal tracker cron secret first.';
  end if;
end;
$$;

select cron.unschedule(jobid)
from cron.job
where jobname = 'academic-research-daily-backup';

select cron.schedule(
  'academic-research-daily-backup',
  '0 0 * * *',
  $$
    select net.http_post(
      url := 'https://gqopwqpysoixcgdacurx.supabase.co/functions/v1/automatic-backup',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'journal_tracker_cron_secret')
      ),
      body := '{"action":"cron"}'::jsonb,
      timeout_milliseconds := 120000
    ) as request_id;
  $$
);
