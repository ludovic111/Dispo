-- 1.0 : partitions de groupe hébergées (table + bucket privé + RLS).

-- Cast uuid tolérant pour les chemins Storage (évite une erreur de cast
-- si un chemin inattendu traîne dans le bucket).
create or replace function public.try_uuid(value text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return value::uuid;
exception when others then
  return null;
end;
$$;

-- Table des partitions partagées d'un groupe.
create table public.group_docs (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.music_groups(id) on delete cascade,
  title text not null,
  path text not null,
  ext text not null default 'pdf',
  added_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index group_docs_group_id_idx on public.group_docs (group_id);
create index group_docs_added_by_idx on public.group_docs (added_by);

alter table public.group_docs enable row level security;

create policy group_docs_select_member on public.group_docs
  for select to authenticated
  using (public.is_group_member(group_id));

create policy group_docs_insert_member on public.group_docs
  for insert to authenticated
  with check (public.is_group_member(group_id) and added_by = (select auth.uid()));

create policy group_docs_delete_uploader_or_leader on public.group_docs
  for delete to authenticated
  using (added_by = (select auth.uid()) or public.is_group_leader(group_id));

-- Realtime : les partitions arrivent chez les membres sans relancer l'app.
alter publication supabase_realtime add table public.group_docs;

-- Bucket PRIVÉ des partitions (20 Mo max ; PDF, images, texte).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'group-docs', 'group-docs', false, 20971520,
  array['application/pdf','image/jpeg','image/png','image/heic','text/plain']
)
on conflict (id) do nothing;

-- Storage RLS : chemin `<groupID>/<fichier>` — accès réservé aux membres
-- du groupe ; suppression par l'auteur du fichier ou le leader.
create policy group_docs_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'group-docs'
    and public.is_group_member(public.try_uuid((storage.foldername(name))[1]))
  );

create policy group_docs_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'group-docs'
    and public.is_group_member(public.try_uuid((storage.foldername(name))[1]))
  );

create policy group_docs_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'group-docs'
    and (
      owner_id = (select auth.uid())::text
      or public.is_group_leader(public.try_uuid((storage.foldername(name))[1]))
    )
  );
