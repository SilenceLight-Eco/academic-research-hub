create table if not exists public.feishu_oauth_states (
  state_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists feishu_oauth_states_expires_at_idx
  on public.feishu_oauth_states (expires_at);

create table if not exists public.feishu_user_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  refresh_expires_at timestamptz,
  open_id text,
  tenant_key text,
  scope text,
  updated_at timestamptz not null default now()
);

alter table public.feishu_oauth_states enable row level security;
alter table public.feishu_user_tokens enable row level security;

revoke all on table public.feishu_oauth_states from anon, authenticated;
revoke all on table public.feishu_user_tokens from anon, authenticated;
grant all on table public.feishu_oauth_states to service_role;
grant all on table public.feishu_user_tokens to service_role;

comment on table public.feishu_oauth_states is
  'Short-lived, hashed OAuth state values; only service-role Edge Functions can access this table.';
comment on table public.feishu_user_tokens is
  'Feishu OAuth tokens; only service-role Edge Functions can access this table.';
