-- Private, per-account research files. Binary content stays in Storage; only
-- lightweight labels and module links live in the database.
insert into storage.buckets (id, name, public, file_size_limit)
values ('research-attachments', 'research-attachments', false, 52428800)
on conflict (id) do nothing;

create table if not exists public.research_attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  context_kind text not null check (context_kind in ('knowledge', 'project', 'reference', 'paper')),
  context_id text not null check (length(context_id) between 1 and 120),
  object_path text not null unique,
  file_name text not null check (length(file_name) between 1 and 255),
  file_size bigint not null check (file_size between 0 and 52428800),
  content_type text,
  created_at timestamptz not null default now(),
  constraint research_attachments_own_path check (object_path like user_id::text || '/%')
);

create index if not exists research_attachments_context_idx
  on public.research_attachments (user_id, context_kind, context_id, created_at desc);

alter table public.research_attachments enable row level security;
grant select, insert, delete on public.research_attachments to authenticated;

drop policy if exists research_attachments_select_own on public.research_attachments;
create policy research_attachments_select_own on public.research_attachments
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists research_attachments_insert_own on public.research_attachments;
create policy research_attachments_insert_own on public.research_attachments
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists research_attachments_delete_own on public.research_attachments;
create policy research_attachments_delete_own on public.research_attachments
  for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists research_attachment_objects_select_own on storage.objects;
create policy research_attachment_objects_select_own on storage.objects
  for select to authenticated using (
    bucket_id = 'research-attachments'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists research_attachment_objects_insert_own on storage.objects;
create policy research_attachment_objects_insert_own on storage.objects
  for insert to authenticated with check (
    bucket_id = 'research-attachments'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists research_attachment_objects_delete_own on storage.objects;
create policy research_attachment_objects_delete_own on storage.objects
  for delete to authenticated using (
    bucket_id = 'research-attachments'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
