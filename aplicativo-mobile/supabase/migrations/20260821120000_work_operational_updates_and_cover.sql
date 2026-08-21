begin;

-- =========================================================
-- FIO - ATUALIZACAO OPERACIONAL E FOTO DE CAPA DA OBRA
-- =========================================================

alter table public.works
add column if not exists cover_photo_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'works_cover_photo_id_fkey'
      and conrelid = 'public.works'::regclass
  ) then
    alter table public.works
    add constraint works_cover_photo_id_fkey
    foreign key (cover_photo_id)
    references public.work_photos(id)
    on delete set null;
  end if;
end;
$$;

create index if not exists works_cover_photo_id_idx
on public.works(cover_photo_id)
where cover_photo_id is not null;

comment on column public.works.cover_photo_id is
'Foto compartilhada escolhida como capa da obra. O arquivo continua armazenado somente em work_photos.';


-- =========================================================
-- PRIMEIRA FOTO GERAL COMPARTILHADA PODE VIRAR CAPA
-- =========================================================

create or replace function public.set_first_work_cover_photo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.collection = 'work'
    and new.environment_id is null
    and new.photo_type = 'general'
    and new.visibility = 'shared'
  then
    update public.works
    set
      cover_photo_id = new.id,
      updated_at = now()
    where id = new.work_id
      and cover_photo_id is null;
  end if;

  return new;
end;
$$;

drop trigger if exists set_first_work_cover_photo_trigger
on public.work_photos;

create trigger set_first_work_cover_photo_trigger
after insert on public.work_photos
for each row
execute function public.set_first_work_cover_photo();


-- =========================================================
-- OWNER / GESTOR DEFINE OU REMOVE A CAPA
-- =========================================================

create or replace function public.set_work_cover_photo(
  p_work_id uuid,
  p_photo_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_file_name text;
begin
  if auth.uid() is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  if not public.can_manage_work(p_work_id) then
    raise exception 'Somente proprietario ou gestor pode definir a capa da obra.';
  end if;

  if p_photo_id is not null then
    select wp.file_name
    into v_file_name
    from public.work_photos wp
    where wp.id = p_photo_id
      and wp.work_id = p_work_id
      and wp.collection = 'work'
      and wp.photo_type = 'general'
      and wp.visibility = 'shared';

    if not found then
      raise exception 'Escolha uma foto compartilhada da galeria desta obra.';
    end if;
  end if;

  update public.works
  set
    cover_photo_id = p_photo_id,
    updated_by = auth.uid(),
    updated_at = now()
  where id = p_work_id;

  insert into public.work_events (
    work_id,
    event_type,
    title,
    description,
    actor_user_id,
    visibility,
    priority,
    metadata
  ) values (
    p_work_id,
    'CAPA_OBRA_ATUALIZADA',
    case when p_photo_id is null then 'Capa da obra removida' else 'Capa da obra atualizada' end,
    v_file_name,
    auth.uid(),
    'internal',
    'normal',
    jsonb_build_object('photo_id', p_photo_id)
  );
end;
$$;

revoke all
on function public.set_work_cover_photo(uuid, uuid)
from public;

grant execute
on function public.set_work_cover_photo(uuid, uuid)
to authenticated;


-- =========================================================
-- ATUALIZACAO OPERACIONAL DA OBRA
-- =========================================================

create or replace function public.record_work_operational_update(
  p_work_id uuid,
  p_environment_id uuid default null,
  p_status text default null,
  p_done_today text default null,
  p_next_steps text default null,
  p_blockers text default null,
  p_visibility text default 'internal',
  p_priority text default 'normal'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_event_id uuid;
  v_current_status text;
  v_status text;
  v_done_today text;
  v_next_steps text;
  v_blockers text;
  v_visibility text;
  v_priority text;
  v_description text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  if not public.can_write_work(p_work_id) then
    raise exception 'Voce nao possui permissao para registrar atualizacoes nesta obra.';
  end if;

  select w.status
  into v_current_status
  from public.works w
  where w.id = p_work_id;

  if not found then
    raise exception 'Obra nao encontrada.';
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

  v_status := nullif(btrim(p_status), '');
  v_done_today := nullif(btrim(p_done_today), '');
  v_next_steps := nullif(btrim(p_next_steps), '');
  v_blockers := nullif(btrim(p_blockers), '');
  v_visibility := coalesce(nullif(btrim(p_visibility), ''), 'internal');
  v_priority := coalesce(nullif(btrim(p_priority), ''), 'normal');

  if v_visibility not in ('internal', 'shared') then
    raise exception 'Visibilidade invalida.';
  end if;

  if v_priority not in ('normal', 'important', 'urgent') then
    raise exception 'Prioridade invalida.';
  end if;

  if v_status is not null then
    if v_status not in (
      'agendada',
      'em_andamento',
      'aguardando_peca',
      'aguardando_cliente',
      'finalizada'
    ) then
      raise exception 'Status da obra invalido.';
    end if;

    if not public.can_manage_work(p_work_id) then
      raise exception 'Somente proprietario ou gestor pode alterar o status geral da obra.';
    end if;
  end if;

  if v_done_today is null
    and v_next_steps is null
    and v_blockers is null
    and (v_status is null or v_status = v_current_status)
  then
    raise exception 'Informe o que foi feito, os proximos passos, um bloqueio ou altere o status.';
  end if;

  if v_status is not null and v_status is distinct from v_current_status then
    update public.works
    set
      status = v_status,
      updated_by = v_user_id,
      updated_at = now()
    where id = p_work_id;
  end if;

  v_description := concat_ws(
    E'\n\n',
    case when v_done_today is not null then 'Feito hoje: ' || v_done_today end,
    case when v_next_steps is not null then 'Proximos passos: ' || v_next_steps end,
    case when v_blockers is not null then 'Bloqueios: ' || v_blockers end
  );

  insert into public.work_events (
    work_id,
    environment_id,
    event_type,
    title,
    description,
    actor_user_id,
    visibility,
    priority,
    metadata
  ) values (
    p_work_id,
    p_environment_id,
    'ATUALIZACAO_OPERACIONAL',
    case
      when p_environment_id is null then 'Atualizacao do dia na obra'
      else 'Atualizacao do dia no ambiente'
    end,
    nullif(v_description, ''),
    v_user_id,
    v_visibility,
    v_priority,
    jsonb_build_object(
      'source', 'operational_update',
      'previous_status', v_current_status,
      'status', coalesce(v_status, v_current_status),
      'done_today', v_done_today,
      'next_steps', v_next_steps,
      'blockers', v_blockers
    )
  )
  returning id into v_event_id;

  return v_event_id;
end;
$$;

revoke all
on function public.record_work_operational_update(
  uuid, uuid, text, text, text, text, text, text
)
from public;

grant execute
on function public.record_work_operational_update(
  uuid, uuid, text, text, text, text, text, text
)
to authenticated;

commit;
