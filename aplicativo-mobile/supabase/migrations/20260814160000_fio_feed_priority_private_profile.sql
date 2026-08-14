-- =========================================================
-- FIO - FEED GLOBAL, PRIORIDADE E PERFIL PRIVADO
-- =========================================================
--
-- O feed global replica as mesmas regras de leitura da Central da obra.
-- Uma prioridade altera somente a apresentacao; nunca amplia o acesso.
-- =========================================================

alter table public.work_events
add column if not exists priority text not null default 'normal';

alter table public.work_events
drop constraint if exists work_events_priority_check;

alter table public.work_events
add constraint work_events_priority_check
check (priority in ('normal', 'important', 'urgent'));

alter table public.profiles
add column if not exists professional_profile_enabled boolean not null default false;

create or replace function public.set_my_professional_profile_enabled(
  p_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  update public.profiles
  set
    professional_profile_enabled = coalesce(p_enabled, false),
    updated_at = now()
  where id = auth.uid();
end;
$$;

revoke all
on function public.set_my_professional_profile_enabled(boolean)
from public;

grant execute
on function public.set_my_professional_profile_enabled(boolean)
to authenticated;

-- Pendencias continuam usando os valores historicos da tabela
-- (normal/high/urgent). No FIO, high recebe o nome Importante.
create or replace function public.log_work_pending_item_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_type text;
  v_event_title text;
  v_priority text;
begin
  if tg_op = 'INSERT' then
    v_event_type := 'PENDENCIA_CRIADA';
    v_event_title := 'Pendencia criada';
  elsif old.status is distinct from new.status then
    if new.status = 'completed' then
      v_event_type := 'PENDENCIA_CONCLUIDA';
      v_event_title := 'Pendencia concluida';
    else
      v_event_type := 'PENDENCIA_REABERTA';
      v_event_title := 'Pendencia reaberta';
    end if;
  elsif old.title is distinct from new.title
    or old.description is distinct from new.description
    or old.priority is distinct from new.priority
    or old.responsible_user_id is distinct from new.responsible_user_id
    or old.due_date is distinct from new.due_date
    or old.blocks_delivery is distinct from new.blocks_delivery
    or old.environment_id is distinct from new.environment_id
  then
    v_event_type := 'PENDENCIA_ATUALIZADA';
    v_event_title := 'Pendencia atualizada';
  else
    return new;
  end if;

  v_priority := case new.priority
    when 'urgent' then 'urgent'
    when 'high' then 'important'
    else 'normal'
  end;

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
    new.work_id,
    new.environment_id,
    v_event_type,
    v_event_title,
    new.title,
    auth.uid(),
    'internal',
    v_priority,
    jsonb_build_object(
      'pending_item_id', new.id,
      'priority', new.priority,
      'status', new.status,
      'blocks_delivery', new.blocks_delivery,
      'due_date', new.due_date,
      'responsible_user_id', new.responsible_user_id
    )
  );

  return new;
end;
$$;

drop function if exists public.create_work_diary_entry(
  uuid,
  uuid,
  text,
  text,
  text
);

create function public.create_work_diary_entry(
  p_work_id uuid,
  p_environment_id uuid default null,
  p_title text default null,
  p_description text default null,
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
  v_title text;
  v_description text;
  v_visibility text;
  v_priority text;
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
  v_priority := coalesce(nullif(btrim(p_priority), ''), 'normal');

  if v_title is null then
    raise exception 'Informe um titulo para a atualizacao.';
  end if;

  if char_length(v_title) > 160 then
    raise exception 'O titulo deve possuir no maximo 160 caracteres.';
  end if;

  if v_visibility not in ('internal', 'shared') then
    raise exception 'Visibilidade invalida para o Diario/FIO.';
  end if;

  if v_priority not in ('normal', 'important', 'urgent') then
    raise exception 'Prioridade invalida para o Diario/FIO.';
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
    priority,
    metadata
  ) values (
    p_work_id,
    p_environment_id,
    'DIARIO_REGISTRO_MANUAL',
    v_title,
    v_description,
    v_user_id,
    v_visibility,
    v_priority,
    jsonb_build_object('source', 'manual')
  )
  returning id into v_event_id;

  return v_event_id;
end;
$$;

revoke all
on function public.create_work_diary_entry(uuid, uuid, text, text, text, text)
from public;

grant execute
on function public.create_work_diary_entry(uuid, uuid, text, text, text, text)
to authenticated;

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
  priority text,
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
    coalesce(nullif(btrim(p.full_name), ''), 'Usuario do FIO'),
    we.visibility,
    we.priority,
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
    )
  from public.work_events we
  left join public.environments e on e.id = we.environment_id
  left join public.profiles p on p.id = we.actor_user_id
  where we.work_id = p_work_id
    and (
      we.visibility = 'shared'
      or (we.visibility = 'internal' and v_can_write)
      or (
        we.visibility = 'company'
        and v_can_write
        and we.company_id is not null
        and public.can_use_company_context(we.company_id)
      )
    )
    and (
      v_can_write
      or coalesce(we.event_type, '') not like 'DOCUMENTO_%'
      or exists (
        select 1
        from public.work_documents d
        where d.id::text = we.metadata ->> 'document_id'
          and d.active = true
          and d.visibility = 'fio_general'
      )
    )
  order by we.created_at desc
  limit 300;
end;
$$;

revoke all on function public.get_work_timeline(uuid) from public;
grant execute on function public.get_work_timeline(uuid) to authenticated;

create or replace function public.get_my_fio_feed(
  p_limit integer default 60
)
returns table (
  id uuid,
  work_id uuid,
  work_code text,
  work_name text,
  environment_id uuid,
  environment_name text,
  event_type text,
  title text,
  description text,
  actor_user_id uuid,
  actor_full_name text,
  visibility text,
  priority text,
  target_section text,
  created_at timestamptz,
  photos jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    we.id,
    we.work_id,
    w.code,
    w.client_name,
    we.environment_id,
    e.name,
    we.event_type,
    we.title,
    we.description,
    we.actor_user_id,
    coalesce(nullif(btrim(p.full_name), ''), 'Usuario do FIO'),
    we.visibility,
    we.priority,
    case
      when coalesce(we.event_type, '') like 'PENDENCIA_%' then 'pending'
      when coalesce(we.event_type, '') like 'FOTO_%' then 'photos'
      when coalesce(we.event_type, '') like 'DOCUMENTO_%' then 'documents'
      when coalesce(we.event_type, '') like '%AMBIENTE%' then 'environments'
      else 'fio'
    end,
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
          and (
            public.can_write_work(we.work_id)
            or wp.visibility = 'shared'
          )
      ),
      '[]'::jsonb
    )
  from public.work_events we
  join public.works w on w.id = we.work_id
  left join public.environments e on e.id = we.environment_id
  left join public.profiles p on p.id = we.actor_user_id
  where auth.uid() is not null
    and public.is_work_participant(we.work_id)
    and (
      we.visibility = 'shared'
      or (
        we.visibility = 'internal'
        and public.can_write_work(we.work_id)
      )
      or (
        we.visibility = 'company'
        and public.can_write_work(we.work_id)
        and we.company_id is not null
        and public.can_use_company_context(we.company_id)
      )
    )
    and (
      public.can_write_work(we.work_id)
      or coalesce(we.event_type, '') not like 'DOCUMENTO_%'
      or exists (
        select 1
        from public.work_documents d
        where d.id::text = we.metadata ->> 'document_id'
          and d.active = true
          and d.visibility = 'fio_general'
      )
    )
  order by we.created_at desc
  limit least(greatest(coalesce(p_limit, 60), 1), 200);
$$;

revoke all on function public.get_my_fio_feed(integer) from public;
grant execute on function public.get_my_fio_feed(integer) to authenticated;

revoke select on public.work_events from public;
revoke select on public.work_events from anon, authenticated;
