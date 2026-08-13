-- =========================================================
-- FIO
-- COLABORADOR PODE ALIMENTAR A OPERACAO DOS AMBIENTES
-- =========================================================
--
-- OWNER / MANAGER / COLLABORATOR:
--   podem criar ambientes e registrar avancos.
--
-- VIEWER:
--   permanece somente leitura.
--
-- Ser responsavel por um ambiente indica atribuicao,
-- nao autorizacao de escrita.
-- =========================================================


-- =========================================================
-- PODE ATUALIZAR UM AMBIENTE
-- =========================================================

create or replace function public.can_update_environment(
  p_environment_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.environments e
    where e.id = p_environment_id
      and e.active = true
      and public.can_write_work(
        e.work_id
      )
  );
$$;

revoke all
on function public.can_update_environment(uuid)
from public;

grant execute
on function public.can_update_environment(uuid)
to authenticated;


-- =========================================================
-- CRIAR AMBIENTE
-- =========================================================

create or replace function public.create_environment(
  p_work_id uuid,
  p_category text,
  p_identifier text default null,
  p_custom_name text default null,
  p_responsible_user_id uuid default null,
  p_status text default 'nao_iniciado',
  p_progress integer default 0,
  p_weight numeric default 1,
  p_services_notes text default null,
  p_missing_items_notes text default null,
  p_notes text default null,
  p_client_visible boolean default false,
  p_preparation_min_photos integer default 0
)
returns table (
  environment_id uuid,
  environment_name text,
  work_progress integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_environment_id uuid;
  v_name text;
  v_progress integer;
  v_responsible_user_id uuid;
  v_work_progress integer;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception
      'Usuario nao autenticado.';
  end if;

  if not public.can_write_work(
    p_work_id
  ) then
    raise exception
      'Voce nao possui permissao para criar ambientes nesta obra.';
  end if;

  if p_status not in (
    'nao_iniciado',
    'em_andamento',
    'aguardando',
    'concluido',
    'cancelado'
  ) then
    raise exception
      'Status do ambiente invalido.';
  end if;

  v_progress :=
    coalesce(
      p_progress,
      0
    );

  if p_status = 'nao_iniciado' then
    v_progress := 0;
  end if;

  if p_status = 'concluido' then
    v_progress := 100;
  end if;

  if
    v_progress < 0
    or
    v_progress > 100
  then
    raise exception
      'Percentual deve estar entre 0 e 100.';
  end if;

  if
    p_weight is null
    or
    p_weight <= 0
  then
    raise exception
      'O peso do ambiente deve ser maior que zero.';
  end if;

  if
    coalesce(
      p_preparation_min_photos,
      0
    ) < 0
  then
    raise exception
      'Quantidade minima de fotos invalida.';
  end if;

  v_name :=
    public.build_environment_name(
      p_category,
      p_identifier,
      p_custom_name
    );

  if exists (
    select 1
    from public.environments e
    where e.work_id = p_work_id
      and e.active = true
      and lower(e.name) =
        lower(v_name)
  ) then
    raise exception
      'Ja existe um ambiente chamado "%". Adicione uma identificacao para diferencia-lo.',
      v_name;
  end if;

  v_responsible_user_id :=
    coalesce(
      p_responsible_user_id,
      v_user_id
    );

  if not exists (
    select 1
    from public.work_participants wp
    where wp.work_id = p_work_id
      and wp.user_id =
        v_responsible_user_id
      and wp.status = 'active'
      and wp.removed_at is null
      and wp.access_level in (
        'owner',
        'manager',
        'collaborator'
      )
  ) then
    raise exception
      'O responsavel precisa ter acesso operacional ativo a obra.';
  end if;

  v_environment_id :=
    gen_random_uuid();

  insert into public.environments (
    id,
    work_id,
    category,
    identifier,
    custom_name,
    name,
    responsible_user_id,
    status,
    progress,
    weight,
    services_notes,
    missing_items_notes,
    notes,
    client_visible,
    preparation_min_photos,
    active,
    created_by,
    updated_by
  )
  values (
    v_environment_id,
    p_work_id,
    p_category,
    nullif(
      btrim(p_identifier),
      ''
    ),
    nullif(
      btrim(p_custom_name),
      ''
    ),
    v_name,
    v_responsible_user_id,
    p_status,
    v_progress,
    p_weight,
    nullif(
      btrim(p_services_notes),
      ''
    ),
    nullif(
      btrim(p_missing_items_notes),
      ''
    ),
    nullif(
      btrim(p_notes),
      ''
    ),
    coalesce(
      p_client_visible,
      false
    ),
    coalesce(
      p_preparation_min_photos,
      0
    ),
    true,
    v_user_id,
    v_user_id
  );

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
    p_work_id,
    v_environment_id,
    'AMBIENTE_CRIADO',
    'Ambiente criado',
    v_name,
    v_user_id,
    'internal',
    jsonb_build_object(
      'environment_id',
      v_environment_id,
      'environment_name',
      v_name,
      'status',
      p_status,
      'progress',
      v_progress
    )
  );

  v_work_progress :=
    public.recalculate_work_progress(
      p_work_id
    );

  return query
  select
    v_environment_id,
    v_name,
    v_work_progress;
end;
$$;
