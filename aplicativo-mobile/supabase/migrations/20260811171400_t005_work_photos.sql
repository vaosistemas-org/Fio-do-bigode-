-- =========================================================
-- T005 - FOTOS DE OBRAS E AMBIENTES
-- =========================================================


-- ---------------------------------------------------------
-- BUCKET PRIVADO
-- ---------------------------------------------------------

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'work-photos',
  'work-photos',
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


-- ---------------------------------------------------------
-- TABELA DE FOTOS
-- ---------------------------------------------------------

create table if not exists public.work_photos (
  id uuid primary key default gen_random_uuid(),

  work_id uuid not null
    references public.works(id)
    on delete cascade,

  environment_id uuid
    references public.environments(id)
    on delete set null,

  storage_path text not null unique,

  file_name text,

  mime_type text,

  size_bytes bigint
    check (
      size_bytes is null
      or size_bytes >= 0
    ),

  caption text,

  taken_at timestamptz,

  created_by uuid
    references auth.users(id)
    on delete set null,

  created_at timestamptz
    not null default now()
);


create index if not exists
  work_photos_work_id_idx
on public.work_photos (
  work_id,
  created_at desc
);


create index if not exists
  work_photos_environment_id_idx
on public.work_photos (
  environment_id,
  created_at desc
);


-- ---------------------------------------------------------
-- GARANTIR QUE O AMBIENTE PERTENCE À MESMA OBRA
-- ---------------------------------------------------------

create or replace function public.validate_work_photo_environment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin

  if new.environment_id is not null then

    if not exists (
      select 1
      from public.environments e
      where e.id = new.environment_id
        and e.work_id = new.work_id
    ) then
      raise exception
        'O ambiente informado nao pertence a esta obra.';
    end if;

  end if;

  return new;

end;
$function$;


drop trigger if exists
  validate_work_photo_environment_trigger
on public.work_photos;


create trigger
  validate_work_photo_environment_trigger
before insert or update
on public.work_photos
for each row
execute function
  public.validate_work_photo_environment();


-- ---------------------------------------------------------
-- HISTÓRICO AUTOMÁTICO
-- ---------------------------------------------------------

create or replace function public.log_work_photo_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid;
begin

  v_actor := auth.uid();


  if tg_op = 'INSERT' then

    insert into public.work_events (
      work_id,
      environment_id,
      event_type,
      title,
      description,
      actor_user_id,
      visibility,
      metadata
    )
    values (
      new.work_id,
      new.environment_id,
      'FOTO_ADICIONADA',
      'Foto adicionada',
      coalesce(
        new.caption,
        new.file_name,
        'Foto registrada'
      ),
      coalesce(
        new.created_by,
        v_actor
      ),
      'internal',
      jsonb_build_object(
        'photo_id',
        new.id,
        'storage_path',
        new.storage_path,
        'file_name',
        new.file_name
      )
    );

    return new;

  end if;


  if tg_op = 'DELETE' then

    -- Evita problema durante exclusão completa da obra
    if exists (
      select 1
      from public.works w
      where w.id = old.work_id
    ) then

      insert into public.work_events (
        work_id,
        environment_id,
        event_type,
        title,
        description,
        actor_user_id,
        visibility,
        metadata
      )
      values (
        old.work_id,
        old.environment_id,
        'FOTO_REMOVIDA',
        'Foto removida',
        coalesce(
          old.caption,
          old.file_name,
          'Foto removida'
        ),
        v_actor,
        'internal',
        jsonb_build_object(
          'photo_id',
          old.id,
          'storage_path',
          old.storage_path,
          'file_name',
          old.file_name
        )
      );

    end if;

    return old;

  end if;


  return null;

end;
$function$;


drop trigger if exists
  log_work_photo_insert_trigger
on public.work_photos;


create trigger
  log_work_photo_insert_trigger
after insert
on public.work_photos
for each row
execute function
  public.log_work_photo_event();


drop trigger if exists
  log_work_photo_delete_trigger
on public.work_photos;


create trigger
  log_work_photo_delete_trigger
after delete
on public.work_photos
for each row
execute function
  public.log_work_photo_event();


-- ---------------------------------------------------------
-- RLS DA TABELA
-- ---------------------------------------------------------

alter table public.work_photos
enable row level security;


drop policy if exists
  "work_photos_select"
on public.work_photos;


create policy
  "work_photos_select"
on public.work_photos
for select
to authenticated
using (
  public.is_work_participant(
    work_id
  )
);


drop policy if exists
  "work_photos_insert"
on public.work_photos;


create policy
  "work_photos_insert"
on public.work_photos
for insert
to authenticated
with check (
  public.is_work_participant(
    work_id
  )
  and created_by = auth.uid()
);


drop policy if exists
  "work_photos_update"
on public.work_photos;


create policy
  "work_photos_update"
on public.work_photos
for update
to authenticated
using (
  public.is_work_participant(
    work_id
  )
)
with check (
  public.is_work_participant(
    work_id
  )
);


drop policy if exists
  "work_photos_delete"
on public.work_photos;


create policy
  "work_photos_delete"
on public.work_photos
for delete
to authenticated
using (
  public.can_manage_work(
    work_id
  )
  or created_by = auth.uid()
);


grant select, insert, update, delete
on public.work_photos
to authenticated;


-- ---------------------------------------------------------
-- STORAGE
--
-- Estrutura dos arquivos:
--
-- work-photos/
--   WORK_ID/
--     ENVIRONMENT_ID/
--       arquivo.jpg
--
-- Para foto geral:
--
-- work-photos/
--   WORK_ID/
--     general/
--       arquivo.jpg
-- ---------------------------------------------------------


drop policy if exists
  "work_photos_storage_select"
on storage.objects;


create policy
  "work_photos_storage_select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'work-photos'
  and public.is_work_participant(
    ((storage.foldername(name))[1])::uuid
  )
);


drop policy if exists
  "work_photos_storage_insert"
on storage.objects;


create policy
  "work_photos_storage_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'work-photos'
  and public.is_work_participant(
    ((storage.foldername(name))[1])::uuid
  )
);


drop policy if exists
  "work_photos_storage_update"
on storage.objects;


create policy
  "work_photos_storage_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'work-photos'
  and public.is_work_participant(
    ((storage.foldername(name))[1])::uuid
  )
)
with check (
  bucket_id = 'work-photos'
  and public.is_work_participant(
    ((storage.foldername(name))[1])::uuid
  )
);


drop policy if exists
  "work_photos_storage_delete"
on storage.objects;


create policy
  "work_photos_storage_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'work-photos'
  and public.is_work_participant(
    ((storage.foldername(name))[1])::uuid
  )
);