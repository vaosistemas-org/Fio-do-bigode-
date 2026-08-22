begin;

-- =========================================================
-- FIO - EDICAO, ARQUIVO E LIXEIRA DE OBRAS
-- =========================================================

alter table public.works
  add column if not exists deleted_at timestamptz,
  add column if not exists trash_expires_at timestamptz;

create index if not exists works_deleted_idx
  on public.works(deleted_at, trash_expires_at)
  where deleted_at is not null;

-- Proprietario/gestor edita os dados principais sem permitir alterar o codigo.
create or replace function public.update_work_details(
  p_work_id uuid,
  p_client_name text,
  p_client_phone text,
  p_address text,
  p_project_order text default null,
  p_status text default 'agendada',
  p_progress integer default 0,
  p_next_visit_at timestamptz default null,
  p_notes text default null
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

  if not public.can_manage_work(p_work_id) then
    raise exception 'Somente proprietario ou gestor pode editar a obra.';
  end if;

  if nullif(btrim(p_client_name), '') is null then
    raise exception 'Informe o nome do cliente.';
  end if;
  if nullif(btrim(p_client_phone), '') is null then
    raise exception 'Informe o telefone do cliente.';
  end if;
  if nullif(btrim(p_address), '') is null then
    raise exception 'Informe o endereco da obra.';
  end if;
  if p_status not in ('agendada', 'em_andamento', 'aguardando_peca', 'aguardando_cliente', 'finalizada') then
    raise exception 'Status da obra invalido.';
  end if;
  if coalesce(p_progress, 0) < 0 or coalesce(p_progress, 0) > 100 then
    raise exception 'Percentual da obra deve estar entre 0 e 100.';
  end if;

  update public.works
  set client_name = btrim(p_client_name),
      client_phone = btrim(p_client_phone),
      address = btrim(p_address),
      project_order = nullif(btrim(p_project_order), ''),
      status = p_status,
      progress = coalesce(p_progress, 0),
      next_visit_at = p_next_visit_at,
      notes = nullif(btrim(p_notes), ''),
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_work_id
    and deleted_at is null;

  if not found then
    raise exception 'A obra nao esta disponivel para edicao.';
  end if;

  insert into public.work_events (
    work_id, event_type, title, description, actor_user_id, visibility, priority, metadata
  ) values (
    p_work_id,
    'OBRA_ATUALIZADA',
    'Dados da obra atualizados',
    'Informacoes principais da obra foram alteradas.',
    auth.uid(),
    'internal',
    'normal',
    jsonb_build_object('status', p_status, 'progress', p_progress)
  );
end;
$$;

-- Arquivo: retira da lista principal, mas continua acessivel e restauravel.
create or replace function public.archive_work(p_work_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_manage_work(p_work_id) then
    raise exception 'Somente proprietario ou gestor pode arquivar a obra.';
  end if;

  update public.works
  set archived_at = coalesce(archived_at, now()),
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_work_id
    and deleted_at is null;

  insert into public.work_events (work_id, event_type, title, description, actor_user_id, visibility, priority)
  values (p_work_id, 'OBRA_ARQUIVADA', 'Obra arquivada', 'A obra foi movida para o arquivo.', auth.uid(), 'internal', 'normal');
end;
$$;

create or replace function public.restore_archived_work(p_work_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_manage_work(p_work_id) then
    raise exception 'Somente proprietario ou gestor pode restaurar a obra.';
  end if;

  update public.works
  set archived_at = null,
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_work_id
    and deleted_at is null;

  insert into public.work_events (work_id, event_type, title, description, actor_user_id, visibility, priority)
  values (p_work_id, 'OBRA_RESTAURADA', 'Obra restaurada', 'A obra voltou para a lista principal.', auth.uid(), 'internal', 'normal');
end;
$$;

-- Lixeira: janela de recuperacao de 30 dias.
create or replace function public.move_work_to_trash(p_work_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expires timestamptz := now() + interval '30 days';
begin
  if not public.can_manage_work(p_work_id) then
    raise exception 'Somente proprietario ou gestor pode mover a obra para a lixeira.';
  end if;

  update public.works
  set deleted_at = now(),
      trash_expires_at = v_expires,
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_work_id
    and deleted_at is null;

  insert into public.work_events (work_id, event_type, title, description, actor_user_id, visibility, priority, metadata)
  values (p_work_id, 'OBRA_LIXEIRA', 'Obra enviada para a lixeira', 'A obra podera ser restaurada por 30 dias.', auth.uid(), 'internal', 'normal', jsonb_build_object('expires_at', v_expires));

  return v_expires;
end;
$$;

create or replace function public.restore_work_from_trash(p_work_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_manage_work(p_work_id) then
    raise exception 'Somente proprietario ou gestor pode restaurar a obra.';
  end if;

  if exists (select 1 from public.works where id = p_work_id and trash_expires_at <= now()) then
    raise exception 'O prazo de 30 dias para restaurar esta obra terminou.';
  end if;

  update public.works
  set deleted_at = null,
      trash_expires_at = null,
      archived_at = null,
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_work_id;

  insert into public.work_events (work_id, event_type, title, description, actor_user_id, visibility, priority)
  values (p_work_id, 'OBRA_RESTAURADA', 'Obra restaurada da lixeira', 'A obra voltou para a lista principal.', auth.uid(), 'internal', 'normal');
end;
$$;

-- Limpeza sob demanda: remove somente obras expiradas que o usuario administra.
-- A chamada pode ser feita ao abrir a tela da lixeira, sem depender de cron.
create or replace function public.purge_expired_work_trash()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with expired as (
    select w.id
    from public.works w
    where w.deleted_at is not null
      and w.trash_expires_at <= now()
      and public.can_manage_work(w.id)
  )
  delete from public.works w
  using expired e
  where w.id = e.id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.update_work_details(uuid, text, text, text, text, text, integer, timestamptz, text) from public;
revoke all on function public.archive_work(uuid) from public;
revoke all on function public.restore_archived_work(uuid) from public;
revoke all on function public.move_work_to_trash(uuid) from public;
revoke all on function public.restore_work_from_trash(uuid) from public;
revoke all on function public.purge_expired_work_trash() from public;

grant execute on function public.update_work_details(uuid, text, text, text, text, text, integer, timestamptz, text) to authenticated;
grant execute on function public.archive_work(uuid) to authenticated;
grant execute on function public.restore_archived_work(uuid) to authenticated;
grant execute on function public.move_work_to_trash(uuid) to authenticated;
grant execute on function public.restore_work_from_trash(uuid) to authenticated;
grant execute on function public.purge_expired_work_trash() to authenticated;

commit;
