begin;

-- =========================================================
-- FIO - ACESSO UNICO A DOCUMENTOS E ESCOPO DOS RELATORIOS
-- =========================================================
-- A mesma autorizacao passa a controlar lista, arquivo, FIO e
-- notificacoes. Relatorio completo existe apenas para owner/manager.

alter table public.work_documents
add column if not exists report_type text;

update public.work_documents
set report_type = case
  when lower(title) like '%completo%' then 'complete'
  when lower(title) like '%vistoria%' or lower(title) like '%entrega%' then 'delivery'
  else 'daily'
end
where category = 'report'
  and report_type is null;

alter table public.work_documents
drop constraint if exists work_documents_report_type_check;

alter table public.work_documents
add constraint work_documents_report_type_check
check (
  (
    category = 'report'
    and report_type is not null
    and report_type in ('daily', 'delivery', 'complete')
  )
  or (category <> 'report' and report_type is null)
);


create or replace function public.validate_work_report_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.category <> 'report' then
    if new.report_type is not null then
      raise exception 'Tipo de relatorio permitido somente em relatorios.';
    end if;
    return new;
  end if;

  if new.report_type is null then
    raise exception 'Use o modulo Gerar relatorio para criar este documento.';
  end if;

  if new.report_type = 'complete' then
    if not public.can_manage_work(new.work_id) then
      raise exception 'Somente proprietario ou gestor pode gerar o relatorio completo.';
    end if;
  elsif not public.can_write_work(new.work_id) then
    raise exception 'Voce nao possui permissao para gerar este relatorio.';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_work_report_scope_trigger
on public.work_documents;

create trigger validate_work_report_scope_trigger
before insert or update on public.work_documents
for each row execute function public.validate_work_report_scope();


create or replace function public.create_work_report_document(
  p_work_id uuid,
  p_title text,
  p_description text,
  p_report_type text,
  p_visibility text default 'professionals',
  p_allow_download boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_document_id uuid;
  v_title text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  if p_report_type not in ('daily', 'delivery', 'complete') then
    raise exception 'Tipo de relatorio invalido.';
  end if;

  if p_report_type = 'complete' then
    if not public.can_manage_work(p_work_id) then
      raise exception 'Somente proprietario ou gestor pode gerar o relatorio completo.';
    end if;
  elsif not public.can_write_work(p_work_id) then
    raise exception 'Voce nao possui permissao para gerar este relatorio.';
  end if;

  if p_visibility not in ('fio_general', 'professionals') then
    raise exception 'Visibilidade do relatorio invalida.';
  end if;

  v_title := nullif(btrim(p_title), '');
  if v_title is null then
    raise exception 'Informe o titulo do relatorio.';
  end if;
  if char_length(v_title) > 180 then
    raise exception 'O titulo deve possuir no maximo 180 caracteres.';
  end if;

  insert into public.work_documents (
    work_id,
    environment_id,
    owner_company_id,
    title,
    description,
    category,
    report_type,
    visibility,
    allow_download,
    created_by,
    updated_by
  ) values (
    p_work_id,
    null,
    null,
    v_title,
    nullif(btrim(p_description), ''),
    'report',
    p_report_type,
    p_visibility,
    coalesce(p_allow_download, true),
    v_user_id,
    v_user_id
  )
  returning id into v_document_id;

  return v_document_id;
end;
$$;

revoke all on function public.create_work_report_document(
  uuid, text, text, text, text, boolean
) from public;

grant execute on function public.create_work_report_document(
  uuid, text, text, text, text, boolean
) to authenticated;


create or replace function public.can_access_work_document(
  p_document_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.work_documents d
    where d.id = p_document_id
      and d.active = true
      and public.is_work_participant(d.work_id)
      and (
        d.visibility = 'fio_general'
        or (
          d.visibility = 'professionals'
          and public.can_write_work(d.work_id)
        )
        or (
          d.visibility = 'company_internal'
          and d.owner_company_id is not null
          and public.can_write_work(d.work_id)
          and public.can_use_company_context(d.owner_company_id)
        )
      )
      and (
        d.category <> 'report'
        or d.report_type <> 'complete'
        or public.can_manage_work(d.work_id)
      )
  );
$$;

revoke all on function public.can_access_work_document(uuid) from public;
grant execute on function public.can_access_work_document(uuid) to authenticated;


create or replace function public.can_access_work_event(
  p_event_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.work_events we
    where we.id = p_event_id
      and (
        coalesce(we.event_type, '') not like 'DOCUMENTO_%'
        or exists (
          select 1
          from public.work_documents d
          where d.id::text = we.metadata ->> 'document_id'
            and public.can_access_work_document(d.id)
        )
      )
  );
$$;

revoke all on function public.can_access_work_event(uuid) from public;
grant execute on function public.can_access_work_event(uuid) to authenticated;


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
    and public.can_access_work_event(we.id)
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
    and public.can_access_work_event(we.id)
  order by we.created_at desc
  limit least(greatest(coalesce(p_limit, 60), 1), 200);
$$;

revoke all on function public.get_my_fio_feed(integer) from public;
grant execute on function public.get_my_fio_feed(integer) to authenticated;


drop policy if exists fio_notifications_select
on public.fio_notifications;

create policy fio_notifications_select
on public.fio_notifications
for select to authenticated
using (
  user_id = auth.uid()
  and (
    event_id is null
    or public.can_access_work_event(event_id)
  )
);

create or replace function public.get_my_notifications()
returns table (
  id uuid,
  work_id uuid,
  title text,
  description text,
  read_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select n.id, n.work_id, n.title, n.description, n.read_at, n.created_at
  from public.fio_notifications n
  where n.user_id = auth.uid()
    and (
      n.event_id is null
      or public.can_access_work_event(n.event_id)
    )
  order by n.created_at desc
  limit 50;
$$;

revoke all on function public.get_my_notifications() from public;
grant execute on function public.get_my_notifications() to authenticated;

create or replace function public.get_my_notification_unread_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.fio_notifications n
  where n.user_id = auth.uid()
    and n.read_at is null
    and (
      n.event_id is null
      or public.can_access_work_event(n.event_id)
    );
$$;

revoke all on function public.get_my_notification_unread_count() from public;
grant execute on function public.get_my_notification_unread_count() to authenticated;


create or replace function public.protect_emitted_work_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.category = 'report'
    and old.current_version > 0
    and (
      new.work_id is distinct from old.work_id
      or new.environment_id is distinct from old.environment_id
      or new.owner_company_id is distinct from old.owner_company_id
      or new.title is distinct from old.title
      or new.description is distinct from old.description
      or new.category is distinct from old.category
      or new.report_type is distinct from old.report_type
      or new.visibility is distinct from old.visibility
      or new.allow_download is distinct from old.allow_download
      or new.active is distinct from old.active
      or new.archived_at is distinct from old.archived_at
    )
  then
    raise exception 'Relatorio emitido nao pode ser alterado. Gere uma nova versao.';
  end if;

  return new;
end;
$$;

commit;
