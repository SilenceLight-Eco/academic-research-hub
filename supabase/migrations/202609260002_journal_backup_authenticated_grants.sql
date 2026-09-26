-- Allow the signed-in owner to export and merge-restore their own journal data.
-- Existing RLS policies on both tables still enforce auth.uid() = user_id.
-- Deliberately do not grant DELETE: restore is merge-only and must not purge rows.
grant select, insert, update on table public.journal_subscriptions to authenticated;
grant select, insert, update on table public.journal_articles to authenticated;
