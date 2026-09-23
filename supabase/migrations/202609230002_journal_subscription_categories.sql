alter table public.journal_subscriptions
  add column if not exists category text not null default '';

comment on column public.journal_subscriptions.category is
  'User-defined category for organizing journal subscriptions.';
