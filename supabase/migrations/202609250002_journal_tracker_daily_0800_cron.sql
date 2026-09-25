-- Run the authenticated journal-tracker cron endpoint daily at 08:00 China time.
-- Supabase cron interprets schedules in UTC, so 00:00 UTC is 08:00 Asia/Shanghai.
-- The shared credential is provisioned separately in Edge Function Secrets and Vault.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (
    select 1 from vault.secrets where name = 'journal_tracker_cron_secret'
  ) then
    raise exception 'Missing Vault secret journal_tracker_cron_secret; provision the shared cron secret before applying this migration.';
  end if;
end;
$$;

select cron.unschedule(jobid)
from cron.job
where jobname = 'journal-tracker-auto-refresh';

select cron.schedule(
  'journal-tracker-auto-refresh',
  '0 0 * * *',
  $$
    select net.http_post(
      url := 'https://gqopwqpysoixcgdacurx.supabase.co/functions/v1/journal-tracker',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'journal_tracker_cron_secret')
      ),
      body := '{"action":"cron"}'::jsonb,
      timeout_milliseconds := 120000
    ) as request_id;
  $$
);
