-- =========================================================
-- FIO - DIARIO E LINHA DO TEMPO DA OBRA
-- =========================================================

create or replace function public.get_work_timeline(
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
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  if not public.is_work_participant(p_work_id) then
    raise exception 'Voce nao possui acesso a esta obra.';
  end if;

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
    we.created_at
  from public.work_events we
  left join public.environments e on e.id = we.environment_id
  left join public.profiles p on p.id = we.actor_user_id
  where we.work_id = p_work_id
  order by we.created_at desc
  limit 300;
end;
$$;

revoke all on function public.get_work_timeline(uuid) from public;
grant execute on function public.get_work_timeline(uuid) to authenticated;

create or replace function public.create_work_diary_entry(
  p_work_id uuid,
  p_environment_id uuid default null,
  p_title text default null,
  p_description text default null
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

  if v_title is null then
    raise exception 'Informe um titulo para a atualizacao.';
  end if;

  if char_length(v_title) > 160 then
    raise exception 'O titulo deve possuir no maximo 160 caracteres.';
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
    'internal',
    jsonb_build_object('source', 'manual')
  )
  returning id into v_event_id;

  return v_event_id;
end;
$$;

revoke all
on function public.create_work_diary_entry(uuid, uuid, text, text)
from public;

grant execute
on function public.create_work_diary_entry(uuid, uuid, text, text)
to authenticated;
