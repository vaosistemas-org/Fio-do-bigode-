-- =========================================================
-- FIO
-- BUSCA GLOBAL DE PERFIS PARA PARTICIPANTES DA OBRA
-- =========================================================
--
-- A busca passa a procurar perfis cadastrados no FIO,
-- e nao apenas pessoas ja vinculadas a empresa da obra.
--
-- Se o perfil possuir vinculo com uma empresa que participa
-- da obra, esse contexto e sugerido automaticamente.
--
-- Se nao possuir, ele ainda pode entrar como participante
-- pessoal da obra, com company_id = null.
-- =========================================================


-- =========================================================
-- BUSCAR PERFIS DO FIO
-- =========================================================

create or replace function public.search_work_participant_profiles(
  p_work_id uuid,
  p_search text
)
returns table (
  user_id uuid,
  full_name text,
  job_title text,
  avatar_url text,
  suggested_role_title text,
  company_id uuid,
  company_name text,
  relationship_type text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_search text;
begin
  if not public.can_manage_work(
    p_work_id
  ) then
    raise exception
      'Voce nao possui permissao para administrar participantes desta obra.';
  end if;

  v_search :=
    btrim(
      coalesce(
        p_search,
        ''
      )
    );

  if char_length(v_search) < 2 then
    return;
  end if;

  return query
  select
    p.id as user_id,

    coalesce(
      nullif(
        btrim(p.full_name),
        ''
      ),
      'Usuario do FIO'
    ) as full_name,

    p.job_title,
    p.avatar_url,

    coalesce(
      nullif(
        btrim(rel.role_title),
        ''
      ),
      nullif(
        btrim(p.job_title),
        ''
      ),
      'Participante da obra'
    ) as suggested_role_title,

    rel.company_id,
    rel.company_name,

    coalesce(
      rel.relationship_type,
      'fio_profile'
    ) as relationship_type

  from public.profiles p

  left join lateral (
    select
      links.company_id,
      links.company_name,
      links.relationship_type,
      links.role_title

    from (
      -- MEMBRO INTERNO DE EMPRESA QUE PARTICIPA DA OBRA
      select
        cm.company_id,
        c.name as company_name,
        'member'::text
          as relationship_type,
        null::text
          as role_title,
        0 as priority

      from public.work_companies wc

      join public.companies c
        on c.id = wc.company_id
        and c.active = true

      join public.company_members cm
        on cm.company_id = wc.company_id
        and cm.user_id = p.id
        and cm.status = 'active'

      where wc.work_id = p_work_id
        and wc.status = 'active'


      union all


      -- COLABORADOR DE EMPRESA QUE PARTICIPA DA OBRA
      select
        cc.company_id,
        c.name as company_name,
        'collaborator'::text
          as relationship_type,
        cc.role_title,
        1 as priority

      from public.work_companies wc

      join public.companies c
        on c.id = wc.company_id
        and c.active = true

      join public.company_collaborators cc
        on cc.company_id = wc.company_id
        and cc.user_id = p.id
        and cc.status = 'approved'

      where wc.work_id = p_work_id
        and wc.status = 'active'
    ) links

    order by
      links.priority,
      links.company_name

    limit 1
  ) rel
    on true

  where
    (
      coalesce(
        p.full_name,
        ''
      ) ilike
        '%' || v_search || '%'

      or

      coalesce(
        p.job_title,
        ''
      ) ilike
        '%' || v_search || '%'
    )

    and not exists (
      select 1
      from public.work_participants wp
      where wp.work_id = p_work_id
        and wp.user_id = p.id
        and wp.status = 'active'
        and wp.removed_at is null
    )

  order by
    p.full_name

  limit 30;
end;
$$;

revoke all
on function public.search_work_participant_profiles(
  uuid,
  text
)
from public;

grant execute
on function public.search_work_participant_profiles(
  uuid,
  text
)
to authenticated;


-- =========================================================
-- ADICIONAR PARTICIPANTE
--
-- company_id passa a ser opcional.
--
-- Se houver empresa:
-- valida se ela participa da obra e se o profissional possui
-- vinculo ativo com ela.
--
-- Sem empresa:
-- o participante entra em contexto pessoal.
-- =========================================================

create or replace function public.add_work_participant(
  p_work_id uuid,
  p_user_id uuid,
  p_company_id uuid,
  p_role_title text default null,
  p_access_level text default 'collaborator'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requester_id uuid;
  v_requester_access text;

  v_participant_id uuid;
  v_existing_status text;

  v_role_title text;
  v_full_name text;
begin
  v_requester_id := auth.uid();

  if v_requester_id is null then
    raise exception
      'Usuario nao autenticado.';
  end if;

  if not public.can_manage_work(
    p_work_id
  ) then
    raise exception
      'Voce nao possui permissao para administrar participantes desta obra.';
  end if;

  select wp.access_level
  into v_requester_access
  from public.work_participants wp
  where wp.work_id = p_work_id
    and wp.user_id = v_requester_id
    and wp.status = 'active'
    and wp.removed_at is null;

  if p_access_level not in (
    'manager',
    'collaborator',
    'viewer'
  ) then
    raise exception
      'Nivel de acesso invalido.';
  end if;

  if
    v_requester_access <> 'owner'
    and p_access_level = 'manager'
  then
    raise exception
      'Somente o proprietario da obra pode adicionar gestores da obra.';
  end if;

  if p_user_id is null then
    raise exception
      'Profissional invalido.';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
  ) then
    raise exception
      'Perfil do FIO nao encontrado.';
  end if;


  -- =====================================================
  -- SE HOUVER EMPRESA, VALIDAR O CONTEXTO
  -- =====================================================

  if p_company_id is not null then

    if not exists (
      select 1
      from public.work_companies wc

      join public.companies c
        on c.id = wc.company_id
        and c.active = true

      where wc.work_id = p_work_id
        and wc.company_id = p_company_id
        and wc.status = 'active'
    ) then
      raise exception
        'Esta empresa nao participa ativamente da obra.';
    end if;

    if not (
      exists (
        select 1
        from public.company_members cm
        where cm.company_id = p_company_id
          and cm.user_id = p_user_id
          and cm.status = 'active'
      )

      or

      exists (
        select 1
        from public.company_collaborators cc
        where cc.company_id = p_company_id
          and cc.user_id = p_user_id
          and cc.status = 'approved'
      )
    ) then
      raise exception
        'O profissional nao possui vinculo ativo com esta empresa.';
    end if;

  end if;


  -- =====================================================
  -- NOME E FUNCAO
  -- =====================================================

  select
    coalesce(
      nullif(
        btrim(p.full_name),
        ''
      ),
      'Usuario do FIO'
    ),

    coalesce(
      nullif(
        btrim(p_role_title),
        ''
      ),

      nullif(
        btrim(cc.role_title),
        ''
      ),

      nullif(
        btrim(p.job_title),
        ''
      ),

      'Participante da obra'
    )

  into
    v_full_name,
    v_role_title

  from public.profiles p

  left join public.company_collaborators cc
    on p_company_id is not null
    and cc.company_id = p_company_id
    and cc.user_id = p_user_id
    and cc.status = 'approved'

  where p.id = p_user_id

  limit 1;


  -- =====================================================
  -- PARTICIPACAO EXISTENTE
  -- =====================================================

  select
    wp.id,
    wp.status

  into
    v_participant_id,
    v_existing_status

  from public.work_participants wp

  where wp.work_id = p_work_id
    and wp.user_id = p_user_id

  limit 1;


  if
    v_participant_id is not null
    and v_existing_status = 'active'
  then
    raise exception
      'Este profissional ja participa da obra.';
  end if;


  -- =====================================================
  -- CRIAR OU REATIVAR
  -- =====================================================

  if v_participant_id is null then

    insert into public.work_participants (
      work_id,
      user_id,
      company_id,
      role_title,
      access_level,
      status,
      invited_by,
      joined_at,
      removed_at
    )
    values (
      p_work_id,
      p_user_id,
      p_company_id,
      v_role_title,
      p_access_level,
      'active',
      v_requester_id,
      now(),
      null
    )
    returning id
    into v_participant_id;

  else

    update public.work_participants
    set
      company_id = p_company_id,
      role_title = v_role_title,
      access_level = p_access_level,
      status = 'active',
      invited_by = v_requester_id,
      joined_at = now(),
      removed_at = null,
      updated_at = now()

    where id = v_participant_id;

  end if;


  -- =====================================================
  -- HISTORICO
  -- =====================================================

  insert into public.work_events (
    work_id,
    event_type,
    title,
    description,
    actor_user_id,
    visibility,
    metadata
  )
  values (
    p_work_id,
    'PARTICIPANTE_ADICIONADO',
    'Participante adicionado',
    v_full_name || ' foi adicionado a obra.',
    v_requester_id,
    'internal',

    jsonb_build_object(
      'participant_user_id',
      p_user_id,
      'company_id',
      p_company_id,
      'role_title',
      v_role_title,
      'access_level',
      p_access_level
    )
  );

  return v_participant_id;
end;
$$;

revoke all
on function public.add_work_participant(
  uuid,
  uuid,
  uuid,
  text,
  text
)
from public;

grant execute
on function public.add_work_participant(
  uuid,
  uuid,
  uuid,
  text,
  text
)
to authenticated;
