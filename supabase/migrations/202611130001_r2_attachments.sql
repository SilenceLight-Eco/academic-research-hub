-- R2 binaries are private; only the authenticated Edge Function can register them.
begin;
alter table public.research_attachments add column if not exists storage_provider text not null default 'supabase';
alter table public.research_attachments drop constraint if exists research_attachments_storage_provider_check;
alter table public.research_attachments add constraint research_attachments_storage_provider_check check (storage_provider in ('supabase','r2'));
alter table public.research_attachments drop constraint if exists research_attachments_file_size_check;
alter table public.research_attachments add constraint research_attachments_file_size_check
  check (file_size >= 0 and file_size <= case when storage_provider = 'r2' then 5000000000000 else 52428800 end);
drop policy if exists research_attachments_insert_own on public.research_attachments;
create policy research_attachments_insert_own on public.research_attachments for insert to authenticated
  with check (user_id = (select auth.uid()) and storage_provider = 'supabase');
drop policy if exists research_attachments_delete_own on public.research_attachments;
create policy research_attachments_delete_own on public.research_attachments for delete to authenticated
  using (user_id = (select auth.uid()) and storage_provider = 'supabase');

create table if not exists public.r2_attachment_uploads (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  object_path text not null unique check (object_path like user_id::text || '/%'),
  context_kind text not null check (context_kind in ('knowledge','project','reference','paper')),
  context_id text not null check (context_id ~ '^[A-Za-z0-9_-]{1,120}$'),
  file_name text not null check (length(file_name) between 1 and 255),
  file_size bigint not null check (file_size between 0 and 5000000000000),
  content_type text not null,
  part_size bigint not null,
  upload_id text,
  status text not null default 'starting' check (status in ('starting','uploading','completing','complete','aborted')),
  created_at timestamptz not null default now()
);
alter table public.r2_attachment_uploads enable row level security;
revoke all on public.r2_attachment_uploads from anon, authenticated;
grant all on public.r2_attachment_uploads to service_role;
grant all on public.research_attachments to service_role;
commit;
