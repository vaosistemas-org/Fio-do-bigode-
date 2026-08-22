-- =========================================================
-- FIO - MEDICOES TECNICAS POR AMBIENTE
-- =========================================================
-- Primeira versao manual. A foto fica intacta no Storage e
-- linhas, pontos e textos ficam como objetos proporcionais.

alter table public.work_photos
drop constraint if exists work_photos_collection_check;

alter table public.work_photos
add constraint work_photos_collection_check
check (collection in ('work', 'assistance', 'damaged_piece', 'measurement'));

create table if not exists public.work_measurement_photos (
  id uuid primary key default gen_random_uuid(),

  work_id uuid not null
    references public.works(id) on delete cascade,

  environment_id uuid not null
    references public.environments(id) on delete cascade,

  photo_id uuid not null unique
    references public.work_photos(id) on delete cascade,

  created_by uuid
    references auth.users(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists work_measurement_photos_environment_idx
on public.work_measurement_photos(environment_id, created_at desc);

create table if not exists public.work_measurement_annotations (
  id uuid primary key default gen_random_uuid(),

  measurement_photo_id uuid not null
    references public.work_measurement_photos(id) on delete cascade,

  type text not null
    check (type in ('measurement', 'point', 'text')),

  start_x numeric(7, 6) not null
    check (start_x >= 0 and start_x <= 1),

  start_y numeric(7, 6) not null
    check (start_y >= 0 and start_y <= 1),

  end_x numeric(7, 6)
    check (end_x is null or (end_x >= 0 and end_x <= 1)),

  end_y numeric(7, 6)
    check (end_y is null or (end_y >= 0 and end_y <= 1)),

  value_mm integer
    check (value_mm is null or value_mm >= 0),

  marker_type text
    check (
      marker_type is null
      or marker_type in (
        'outlet',
        'switch',
        'hydraulic',
        'gas',
        'valve',
        'door',
        'window',
        'furniture_start',
        'furniture_end',
        'other'
      )
    ),

  text text,

  source text not null default 'manual'
    check (source in ('manual', 'lidar', 'ai')),

  confirmed boolean not null default true,

  created_by uuid
    references auth.users(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists work_measurement_annotations_photo_idx
on public.work_measurement_annotations(measurement_photo_id, created_at);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

drop trigger if exists touch_work_measurement_photos_updated_at
on public.work_measurement_photos;

create trigger touch_work_measurement_photos_updated_at
before update on public.work_measurement_photos
for each row execute function public.touch_updated_at();

drop trigger if exists touch_work_measurement_annotations_updated_at
on public.work_measurement_annotations;

create trigger touch_work_measurement_annotations_updated_at
before update on public.work_measurement_annotations
for each row execute function public.touch_updated_at();

create or replace function public.validate_work_measurement_photo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not exists (
    select 1
    from public.environments e
    where e.id = new.environment_id
      and e.work_id = new.work_id
  ) then
    raise exception 'O ambiente informado nao pertence a esta obra.';
  end if;

  if not exists (
    select 1
    from public.work_photos p
    where p.id = new.photo_id
      and p.work_id = new.work_id
      and p.environment_id = new.environment_id
      and p.collection = 'measurement'
  ) then
    raise exception 'A foto de medicao precisa pertencer ao mesmo ambiente.';
  end if;

  return new;
end;
$function$;

drop trigger if exists validate_work_measurement_photo_trigger
on public.work_measurement_photos;

create trigger validate_work_measurement_photo_trigger
before insert or update on public.work_measurement_photos
for each row execute function public.validate_work_measurement_photo();

create or replace function public.log_work_measurement_photo_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
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
      'MEDICAO_FOTO_ADICIONADA',
      'Medição adicionada',
      'Foto de medição técnica adicionada ao ambiente.',
      coalesce(new.created_by, auth.uid()),
      'internal',
      jsonb_build_object(
        'measurement_photo_id', new.id,
        'photo_id', new.photo_id,
        'source', 'manual'
      )
    );

    return new;
  end if;

  return new;
end;
$function$;

drop trigger if exists log_work_measurement_photo_insert_trigger
on public.work_measurement_photos;

create trigger log_work_measurement_photo_insert_trigger
after insert on public.work_measurement_photos
for each row execute function public.log_work_measurement_photo_event();

create or replace function public.work_measurement_annotation_work_id(
  p_measurement_photo_id uuid
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select mp.work_id
  from public.work_measurement_photos mp
  where mp.id = p_measurement_photo_id;
$$;

create or replace function public.work_measurement_annotation_environment_id(
  p_measurement_photo_id uuid
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select mp.environment_id
  from public.work_measurement_photos mp
  where mp.id = p_measurement_photo_id;
$$;

alter table public.work_measurement_photos
enable row level security;

alter table public.work_measurement_annotations
enable row level security;

drop policy if exists work_measurement_photos_select
on public.work_measurement_photos;

create policy work_measurement_photos_select
on public.work_measurement_photos
for select to authenticated
using (public.is_work_participant(work_id));

drop policy if exists work_measurement_photos_insert
on public.work_measurement_photos;

create policy work_measurement_photos_insert
on public.work_measurement_photos
for insert to authenticated
with check (
  created_by = auth.uid()
  and public.can_update_environment(environment_id)
);

drop policy if exists work_measurement_photos_update
on public.work_measurement_photos;

create policy work_measurement_photos_update
on public.work_measurement_photos
for update to authenticated
using (public.can_update_environment(environment_id))
with check (public.can_update_environment(environment_id));

drop policy if exists work_measurement_photos_delete
on public.work_measurement_photos;

create policy work_measurement_photos_delete
on public.work_measurement_photos
for delete to authenticated
using (public.can_update_environment(environment_id));

drop policy if exists work_measurement_annotations_select
on public.work_measurement_annotations;

create policy work_measurement_annotations_select
on public.work_measurement_annotations
for select to authenticated
using (
  public.is_work_participant(
    public.work_measurement_annotation_work_id(measurement_photo_id)
  )
);

drop policy if exists work_measurement_annotations_insert
on public.work_measurement_annotations;

create policy work_measurement_annotations_insert
on public.work_measurement_annotations
for insert to authenticated
with check (
  created_by = auth.uid()
  and public.can_update_environment(
    public.work_measurement_annotation_environment_id(measurement_photo_id)
  )
);

drop policy if exists work_measurement_annotations_update
on public.work_measurement_annotations;

create policy work_measurement_annotations_update
on public.work_measurement_annotations
for update to authenticated
using (
  public.can_update_environment(
    public.work_measurement_annotation_environment_id(measurement_photo_id)
  )
)
with check (
  public.can_update_environment(
    public.work_measurement_annotation_environment_id(measurement_photo_id)
  )
);

drop policy if exists work_measurement_annotations_delete
on public.work_measurement_annotations;

create policy work_measurement_annotations_delete
on public.work_measurement_annotations
for delete to authenticated
using (
  public.can_update_environment(
    public.work_measurement_annotation_environment_id(measurement_photo_id)
  )
);

grant select, insert, update, delete
on public.work_measurement_photos
to authenticated;

grant select, insert, update, delete
on public.work_measurement_annotations
to authenticated;

grant execute on function public.work_measurement_annotation_work_id(uuid)
to authenticated;

grant execute on function public.work_measurement_annotation_environment_id(uuid)
to authenticated;

comment on table public.work_measurement_photos is
'Fotos usadas no modulo de medicoes tecnicas por ambiente.';

comment on table public.work_measurement_annotations is
'Linhas, pontos e textos proporcionais sobre fotos de medicao. Fonte preparada para manual, lidar ou ai.';
