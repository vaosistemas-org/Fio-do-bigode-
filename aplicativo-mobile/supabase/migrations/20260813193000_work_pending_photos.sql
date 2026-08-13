-- =========================================================
-- FIO - FOTOS INTERNAS DE PENDENCIAS / PASTA B.O.
-- =========================================================
--
-- As evidencias ficam separadas da galeria da obra.
-- OWNER / MANAGER / COLLABORATOR podem visualizar e incluir.
-- VIEWER nao possui acesso nem a tabela nem ao Storage.
-- =========================================================

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'work-pending-photos',
  'work-pending-photos',
  false,
  15728640,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif'
  ]
)
on conflict (id)
do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.work_pending_photos (
  id uuid primary key default gen_random_uuid(),

  pending_item_id uuid not null
    references public.work_pending_items(id)
    on delete cascade,

  work_id uuid not null
    references public.works(id)
    on delete cascade,

  storage_path text not null unique,
  file_name text,
  mime_type text,
  size_bytes bigint
    check (size_bytes is null or size_bytes >= 0),
  taken_at timestamptz,

  created_by uuid
    references auth.users(id)
    on delete set null,

  created_at timestamptz not null default now()
);

create index if not exists work_pending_photos_work_idx
on public.work_pending_photos (work_id, created_at desc);

create index if not exists work_pending_photos_item_idx
on public.work_pending_photos (pending_item_id, created_at desc);

create or replace function public.validate_work_pending_photo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.work_pending_items wpi
    where wpi.id = new.pending_item_id
      and wpi.work_id = new.work_id
  ) then
    raise exception 'A pendencia informada nao pertence a esta obra.';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_work_pending_photo_trigger
on public.work_pending_photos;

create trigger validate_work_pending_photo_trigger
before insert or update on public.work_pending_photos
for each row execute function public.validate_work_pending_photo();

alter table public.work_pending_photos enable row level security;

drop policy if exists work_pending_photos_select
on public.work_pending_photos;

create policy work_pending_photos_select
on public.work_pending_photos
for select to authenticated
using (public.can_write_work(work_id));

drop policy if exists work_pending_photos_insert
on public.work_pending_photos;

create policy work_pending_photos_insert
on public.work_pending_photos
for insert to authenticated
with check (
  public.can_write_work(work_id)
  and created_by = (select auth.uid())
);

drop policy if exists work_pending_photos_update
on public.work_pending_photos;

create policy work_pending_photos_update
on public.work_pending_photos
for update to authenticated
using (
  public.can_manage_work(work_id)
  or (
    public.can_write_work(work_id)
    and created_by = (select auth.uid())
  )
)
with check (
  public.can_manage_work(work_id)
  or (
    public.can_write_work(work_id)
    and created_by = (select auth.uid())
  )
);

drop policy if exists work_pending_photos_delete
on public.work_pending_photos;

create policy work_pending_photos_delete
on public.work_pending_photos
for delete to authenticated
using (
  public.can_manage_work(work_id)
  or (
    public.can_write_work(work_id)
    and created_by = (select auth.uid())
  )
);

grant select, insert, update, delete
on public.work_pending_photos
to authenticated;

-- O primeiro diretorio do arquivo sempre e o work_id.

drop policy if exists work_pending_photos_storage_select
on storage.objects;

create policy work_pending_photos_storage_select
on storage.objects
for select to authenticated
using (
  bucket_id = 'work-pending-photos'
  and public.can_write_work(
    ((storage.foldername(name))[1])::uuid
  )
);

drop policy if exists work_pending_photos_storage_insert
on storage.objects;

create policy work_pending_photos_storage_insert
on storage.objects
for insert to authenticated
with check (
  bucket_id = 'work-pending-photos'
  and public.can_write_work(
    ((storage.foldername(name))[1])::uuid
  )
);

drop policy if exists work_pending_photos_storage_update
on storage.objects;

create policy work_pending_photos_storage_update
on storage.objects
for update to authenticated
using (
  bucket_id = 'work-pending-photos'
  and (
    public.can_manage_work(
      ((storage.foldername(name))[1])::uuid
    )
    or exists (
      select 1
      from public.work_pending_photos wpp
      where wpp.storage_path = storage.objects.name
        and wpp.created_by = (select auth.uid())
    )
  )
)
with check (
  bucket_id = 'work-pending-photos'
  and (
    public.can_manage_work(
      ((storage.foldername(name))[1])::uuid
    )
    or exists (
      select 1
      from public.work_pending_photos wpp
      where wpp.storage_path = storage.objects.name
        and wpp.created_by = (select auth.uid())
    )
  )
);

drop policy if exists work_pending_photos_storage_delete
on storage.objects;

create policy work_pending_photos_storage_delete
on storage.objects
for delete to authenticated
using (
  bucket_id = 'work-pending-photos'
  and (
    public.can_manage_work(
      ((storage.foldername(name))[1])::uuid
    )
    or exists (
      select 1
      from public.work_pending_photos wpp
      where wpp.storage_path = storage.objects.name
        and wpp.created_by = (select auth.uid())
    )
  )
);
