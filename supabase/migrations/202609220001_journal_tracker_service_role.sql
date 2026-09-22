-- The journal tracker Edge Function uses service_role for PostgREST writes.
-- RLS bypass does not replace SQL table privileges.
grant select, insert, update, delete on table public.journal_subscriptions to service_role;
grant select, insert, update, delete on table public.journal_articles to service_role;
