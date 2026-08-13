-- =========================================================
-- FIO - VISIBILIDADE E FOTOS ANEXADAS AO DIARIO
-- =========================================================
--
-- Registros internos ficam disponiveis somente para quem possui
-- acesso operacional. O modo de visualizacao recebe apenas itens
-- explicitamente compartilhados.
-- =========================================================

alter table public.work_events
drop constraint if exists work_events_visibility_check;

alter table public.work_events
add constraint work_events_visibility_check
check (visibility in ('internal', 'shared'));

alter table public.work_photos
add column if not exists visibility text
not null default 'shared';

alter table public.work_photos
drop constraint if exists work_photos_visibility_check;

alter table public.work_photos
add constraint work_photos_visibility_check
check (visibility in ('internal', 'shared'));

alter table public.work_photos
add column if not exists diary_event_id uuid
references public.work_events(id)
on delete set null;

create index if not exists work_photos_diary_event_idx
on public.work_photos(diary_event_id, created_at);

comment on column public.work_photos.visibility is
'internal = somente equipe operacional; shared = tambem visivel no modo de visualizacao.';

comment on column public.work_photos.diary_event_id is
'Vincula a foto ao registro manual que a originou no Diario/FIO.';

-- As fotos comuns da galeria ja eram visiveis para todo participante.
-- O backfill preserva esse comportamento para o historico existente.
update public.work_events
set visibility = 'shared'
where event_type in ('FOTO_ADICIONADA', 'FOTO_REMOVIDA');

-- =========================================================
-- VALIDACAO DA FOTO E DO REGISTRO DO DIARIO
-- =========================================================

create or replace function public.validate_work_photo_environment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.environment_id is not null
    and not exists (
      select 1
      from public.environments e
      where e.id = new.environment_id
        and e.work_id = new.work_id
    )
  then
    raise exception 'O ambiente informado nao pertence a esta obra.';
  end if;

  if new.diary_event_id is not null
    and not exists (
      select 1
      from public.work_events we
      where we.id = new.diary_event_id
        and we.work_id = new.work_id
        and we.event_type = 'DIARIO_REGISTRO_MANUAL'
        and we.environment_id is not distinct from new.environment_id
        and we.visibility = new.visibility
        and new.collection = 'work'
        and (
          we.actor_user_id = auth.uid()
          or public.can_manage_work(new.work_id)
        )
    )
  then
    raise exception 'O registro do Diario nao corresponde a esta foto.';
  end if;

  return new;
end;
$function$;

-- Uma foto anexada ao registro manual nao cria outro card na linha do
-- tempo. Fotos adicionadas diretamente na galeria continuam gerando o
-- evento automatico habitual.
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
    if new.diary_event_id is not null then
      return new;
    end if;

    insert into public.work_events (
      work_id,
      environment_id,
      event_type,
      title,
      description,
      actor_user_id,
      visibility,
      metadata
    ) values (
      new.work_id,
      new.environment_id,
      'FOTO_ADICIONADA',
      'Foto adicionada',
      coalesce(new.caption, new.file_name, 'Foto registrada'),
      coalesce(new.created_by, v_actor),
      new.visibility,
      jsonb_build_object(
        'photo_id', new.id,
        'storage_path', new.storage_path,
        'file_name', new.file_name
      )
    );

    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.diary_event_id is not null then
      return old;
    end if;

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
      ) values (
        old.work_id,
        old.environment_id,
        'FOTO_REMOVIDA',
        'Foto removida',
        coalesce(old.caption, old.file_name, 'Foto removida'),
        v_actor,
        old.visibility,
        jsonb_build_object(
          'photo_id', old.id,
          'storage_path', old.storage_path,
          'file_name', old.file_name
        )
      );
    end if;

    return old;
  end if;

  return null;
end;
$function$;

-- =========================================================
-- FOTOS: RLS E STORAGE RESPEITAM A VISIBILIDADE
-- =========================================================

drop policy if exists work_photos_select
on public.work_photos;

create policy work_photos_select
on public.work_photos
for select to authenticated
using (
  public.can_write_work(work_id)
  or (
    visibility = 'shared'
    and public.is_work_participant(work_id)
  )
);

drop policy if exists work_photos_storage_select
on storage.objects;

create policy work_photos_storage_select
on storage.objects
for select to authenticated
using (
  bucket_id = 'work-photos'
  and (
    public.can_write_work(((storage.foldername(name))[1])::uuid)
    or exists (
      select 1
      from public.work_photos wp
      where wp.storage_path = storage.objects.name
        and wp.visibility = 'shared'
        and public.is_work_participant(wp.work_id)
    )
  )
);

-- =========================================================
-- LINHA DO TEMPO COM PRIVACIDADE E ANEXOS
-- =========================================================

drop function if exists public.get_work_timeline(uuid);

create function public.get_work_timeline(
  p_work_id uuid
)
returns table (
  id uuid,
  environment_id uuid,
  environment_name text,
  event_type text,
  title text,
  description text,
  actor_user_id uuid,
  actor_full_name text,
  visibility text,
  created_at timestamptz,
  photos jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_can_write boolean;
begin
  if auth.uid() is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  if not public.is_work_participant(p_work_id) then
    raise exception 'Voce nao possui acesso a esta obra.';
  end if;

  v_can_write := public.can_write_work(p_work_id);

  return query
  select
    we.id,
    we.environment_id,
    e.name as environment_name,
    we.event_type,
    we.title,
    we.description,
    we.actor_user_id,
    coalesce(nullif(btrim(p.full_name), ''), 'Usuario do FIO')
      as actor_full_name,
    we.visibility,
    we.created_at,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', wp.id,
            'storage_path', wp.storage_path,
            'file_name', wp.file_name
          )
          order by wp.created_at
        )
        from public.work_photos wp
        where wp.work_id = we.work_id
          and (
            wp.diary_event_id = we.id
            or wp.id::text = we.metadata ->> 'photo_id'
          )
          and (v_can_write or wp.visibility = 'shared')
      ),
      '[]'::jsonb
    ) as photos
  from public.work_events we
  left join public.environments e on e.id = we.environment_id
  left join public.profiles p on p.id = we.actor_user_id
  where we.work_id = p_work_id
    and (v_can_write or we.visibility = 'shared')
  order by we.created_at desc
  limit 300;
end;
$$;

revoke all on function public.get_work_timeline(uuid) from public;
grant execute on function public.get_work_timeline(uuid) to authenticated;

-- Evita que uma consulta direta contorne a regra aplicada pela funcao.
revoke select on public.work_events from public;
revoke select on public.work_events from anon, authenticated;

drop function if exists public.create_work_diary_entry(
  uuid,
  uuid,
  text,
  text
);

create or replace function public.create_work_diary_entry(
  p_work_id uuid,
  p_environment_id uuid default null,
  p_title text default null,
  p_description text default null,
  p_visibility text default 'internal'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_event_id uuid;
  v_title text;
  v_description text;
  v_visibility text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  if not public.can_write_work(p_work_id) then
    raise exception 'Voce nao possui permissao para registrar no Diario/FIO.';
  end if;

  v_title := nullif(btrim(p_title), '');
  v_description := nullif(btrim(p_description), '');
  v_visibility := coalesce(nullif(btrim(p_visibility), ''), 'internal');

  if v_title is null then
    raise exception 'Informe um titulo para a atualizacao.';
  end if;

  if char_length(v_title) > 160 then
    raise exception 'O titulo deve possuir no maximo 160 caracteres.';
  end if;

  if v_visibility not in ('internal', 'shared') then
    raise exception 'Visibilidade invalida para o Diario/FIO.';
  end if;

  if p_environment_id is not null
    and not exists (
      select 1
      from public.environments e
      where e.id = p_environment_id
        and e.work_id = p_work_id
        and e.active = true
    )
  then
    raise exception 'O ambiente informado nao pertence a esta obra.';
  end if;

  insert into public.work_events (
    work_id,
    environment_id,
    event_type,
    title,
    description,
    actor_user_id,
    visibility,
    metadata
  ) values (
    p_work_id,
    p_environment_id,
    'DIARIO_REGISTRO_MANUAL',
    v_title,
    v_description,
    v_user_id,
    v_visibility,
    jsonb_build_object('source', 'manual')
  )
  returning id into v_event_id;

  return v_event_id;
end;
$$;

revoke all
on function public.create_work_diary_entry(uuid, uuid, text, text, text)
from public;

grant execute
on function public.create_work_diary_entry(uuid, uuid, text, text, text)
to authenticated;
