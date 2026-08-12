-- =========================================================
-- FIO
-- PARTICIPANTES DA OBRA
-- =========================================================
--
-- Regras:
-- - A equipe da empresa nao ganha acesso automatico a obra.
-- - Somente participantes ativos aparecem na obra.
-- - Owner e manager podem administrar participantes.
-- - Somente owner pode conceder/remover nivel manager.
-- - Owner da obra nao pode ser removido.
-- - Participante responsavel por ambiente ativo precisa ser
--   reatribuido antes de ser removido da obra.
-- - Historico e preservado com status = 'removed'.
-- =========================================================


-- =========================================================
-- LISTA CANONICA DE PARTICIPANTES DA OBRA
-- =========================================================

create or replace function public.get_work_participants(
  p_work_id uuid
)
returns table (
  participant_id uuid,
  user_id uuid,
  full_name text,
  job_title text,
  avatar_url text,
  role_title text,
  access_level text,
  company_id uuid,
  company_name text,
  is_current_user boolean,
  joined_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_work_participant(
    p_work_id
  ) then
    raise exception
      'Voce nao possui acesso a esta obra.';
  end if;

  return query
  select
    wp.id as participant_id,
    wp.user_id,

    coalesce(
      nullif(
        btrim(p.full_name),
        ''
      ),
      'Participante'
    ) as full_name,

    p.job_title,
    p.avatar_url,
    wp.role_title,
    wp.access_level,
    wp.company_id,
    c.name as company_name,

    wp.user_id = auth.uid()
      as is_current_user,

    wp.joined_at

  from public.work_participants wp

  left join public.profiles p
    on p.id = wp.user_id

  left join public.companies c
    on c.id = wp.company_id

  where wp.work_id = p_work_id
    and wp.status = 'active'
    and wp.removed_at is null

  order by
    case wp.access_level
      when 'owner' then 0
      when 'manager' then 1
      when 'collaborator' then 2
      when 'viewer' then 3
      else 4
    end,

    coalesce(
      nullif(
        btrim(p.full_name),
        ''
      ),
      'Participante'
    );
end;
$$;

revoke all
on function public.get_work_participants(uuid)
from public;

grant execute
on function public.get_work_participants(uuid)
to authenticated;


-- =========================================================
-- A FUNCAO DE RESPONSAVEIS DOS AMBIENTES PASSA A USAR
-- A LISTA CANONICA ACIMA
-- =========================================================

create or replace function public.get_work_participants_for_assignment(
  p_work_id uuid
)
returns table (
  participant_id uuid,
  user_id uuid,
  full_name text,
  role_title text,
  job_title text,
  access_level text,
  company_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    gp.participant_id,
    gp.user_id,
    gp.full_name,
    gp.role_title,
    gp.job_title,
    gp.access_level,
    gp.company_id

  from public.get_work_participants(
    p_work_id
  ) gp

  order by gp.full_name;
$$;

revoke all
on function public.get_work_participants_for_assignment(uuid)
from public;

grant execute
on function public.get_work_participants_for_assignment(uuid)
to authenticated;


-- =========================================================
-- CANDIDATOS PARA ENTRAR NA OBRA
--
-- Sao pessoas vinculadas as empresas ativas desta obra.
-- Nao concede acesso automaticamente: apenas disponibiliza
-- candidatos para escolha.
-- =========================================================

create or replace function public.get_work_participant_candidates(
  p_work_id uuid,
  p_search text default null
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
    nullif(
      btrim(
        coalesce(
          p_search,
          ''
        )
      ),
      ''
    );

  return query

  select *
  from (

    -- MEMBROS INTERNOS DAS EMPRESAS DA OBRA

    select
      cm.user_id,

      coalesce(
        nullif(
          btrim(p.full_name),
          ''
        ),
        'Profissional FIO'
      ) as full_name,

      p.job_title,
      p.avatar_url,

      coalesce(
        nullif(
          btrim(p.job_title),
          ''
        ),
        'Profissional'
      ) as suggested_role_title,

      cm.company_id,
      c.name as company_name,

      'member'::text
        as relationship_type

    from public.work_companies wc

    join public.companies c
      on c.id = wc.company_id
      and c.active = true

    join public.company_members cm
      on cm.company_id = wc.company_id
      and cm.status = 'active'

    left join public.profiles p
      on p.id = cm.user_id

    where wc.work_id = p_work_id
      and wc.status = 'active'

      and not exists (
        select 1
        from public.work_participants wp
        where wp.work_id = p_work_id
          and wp.user_id = cm.user_id
          and wp.status = 'active'
          and wp.removed_at is null
      )


    union all


    -- COLABORADORES PROFISSIONAIS DAS EMPRESAS DA OBRA

    select
      cc.user_id,

      coalesce(
        nullif(
          btrim(p.full_name),
          ''
        ),
        'Profissional FIO'
      ) as full_name,

      p.job_title,
      p.avatar_url,

      coalesce(
        nullif(
          btrim(cc.role_title),
          ''
        ),
        nullif(
          btrim(p.job_title),
          ''
        ),
        'Profissional'
      ) as suggested_role_title,

      cc.company_id,
      c.name as company_name,

      'collaborator'::text
        as relationship_type

    from public.work_companies wc

    join public.companies c
      on c.id = wc.company_id
      and c.active = true

    join public.company_collaborators cc
      on cc.company_id = wc.company_id
      and cc.status = 'approved'

    left join public.profiles p
      on p.id = cc.user_id

    where wc.work_id = p_work_id
      and wc.status = 'active'

      and not exists (
        select 1
        from public.company_members cm
        where cm.company_id = cc.company_id
          and cm.user_id = cc.user_id
          and cm.status = 'active'
      )

      and not exists (
        select 1
        from public.work_participants wp
        where wp.work_id = p_work_id
          and wp.user_id = cc.user_id
          and wp.status = 'active'
          and wp.removed_at is null
      )

  ) candidates

  where
    v_search is null

    or candidates.full_name ilike
      '%' || v_search || '%'

    or coalesce(
      candidates.job_title,
      ''
    ) ilike
      '%' || v_search || '%'

    or coalesce(
      candidates.suggested_role_title,
      ''
    ) ilike
      '%' || v_search || '%'

    or candidates.company_name ilike
      '%' || v_search || '%'

  order by
    candidates.company_name,
    candidates.full_name;
end;
$$;

revoke all
on function public.get_work_participant_candidates(uuid, text)
from public;

grant execute
on function public.get_work_participant_candidates(uuid, text)
to authenticated;


-- =========================================================
-- ADICIONAR / REATIVAR PARTICIPANTE
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
      'Somente o proprietario da obra pode adicionar administradores da obra.';
  end if;

  if p_user_id is null then
    raise exception
      'Profissional invalido.';
  end if;

  if p_company_id is null then
    raise exception
      'Informe a empresa pela qual o profissional participa da obra.';
  end if;

  if not exists (
    select 1
    from public.work_companies wc
    join public.companies c
      on c.id = wc.company_id
    where wc.work_id = p_work_id
      and wc.company_id = p_company_id
      and wc.status = 'active'
      and c.active = true
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

  select
    coalesce(
      nullif(
        btrim(p.full_name),
        ''
      ),
      'Profissional FIO'
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
    on cc.company_id = p_company_id
    and cc.user_id = p_user_id
    and cc.status = 'approved'
  where p.id = p_user_id
  limit 1;

  if v_full_name is null then
    raise exception
      'Profissional nao encontrado.';
  end if;

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


-- =========================================================
-- ATUALIZAR FUNCAO / NIVEL DE ACESSO
-- =========================================================

create or replace function public.update_work_participant(
  p_participant_id uuid,
  p_role_title text,
  p_access_level text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requester_id uuid;
  v_requester_access text;

  v_work_id uuid;
  v_target_user_id uuid;
  v_target_access text;
  v_target_name text;

  v_role_title text;
begin
  v_requester_id := auth.uid();

  if v_requester_id is null then
    raise exception
      'Usuario nao autenticado.';
  end if;

  select
    wp.work_id,
    wp.user_id,
    wp.access_level,

    coalesce(
      nullif(
        btrim(p.full_name),
        ''
      ),
      'Participante'
    )

  into
    v_work_id,
    v_target_user_id,
    v_target_access,
    v_target_name

  from public.work_participants wp

  left join public.profiles p
    on p.id = wp.user_id

  where wp.id = p_participant_id
    and wp.status = 'active'
    and wp.removed_at is null;

  if v_work_id is null then
    raise exception
      'Participante ativo nao encontrado.';
  end if;

  if not public.can_manage_work(
    v_work_id
  ) then
    raise exception
      'Voce nao possui permissao para administrar participantes desta obra.';
  end if;

  select wp.access_level
  into v_requester_access
  from public.work_participants wp
  where wp.work_id = v_work_id
    and wp.user_id = v_requester_id
    and wp.status = 'active'
    and wp.removed_at is null;

  if v_target_access = 'owner' then
    raise exception
      'O proprietario da obra nao pode ser alterado por esta funcao.';
  end if;

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
    and (
      v_target_access = 'manager'
      or p_access_level = 'manager'
    )
  then
    raise exception
      'Somente o proprietario da obra pode alterar administradores da obra.';
  end if;

  v_role_title :=
    nullif(
      btrim(
        coalesce(
          p_role_title,
          ''
        )
      ),
      ''
    );

  if v_role_title is null then
    raise exception
      'Informe a funcao do participante na obra.';
  end if;

  update public.work_participants
  set
    role_title = v_role_title,
    access_level = p_access_level,
    updated_at = now()
  where id = p_participant_id;

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
    v_work_id,
    'PARTICIPANTE_ATUALIZADO',
    'Participante atualizado',
    v_target_name || ' teve sua participacao atualizada.',
    v_requester_id,
    'internal',
    jsonb_build_object(
      'participant_user_id',
      v_target_user_id,
      'role_title',
      v_role_title,
      'access_level',
      p_access_level
    )
  );

  return true;
end;
$$;

revoke all
on function public.update_work_participant(
  uuid,
  text,
  text
)
from public;

grant execute
on function public.update_work_participant(
  uuid,
  text,
  text
)
to authenticated;


-- =========================================================
-- REMOVER PARTICIPANTE
-- =========================================================

create or replace function public.remove_work_participant(
  p_participant_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requester_id uuid;
  v_requester_access text;

  v_work_id uuid;
  v_target_user_id uuid;
  v_target_access text;
  v_target_name text;
begin
  v_requester_id := auth.uid();

  if v_requester_id is null then
    raise exception
      'Usuario nao autenticado.';
  end if;

  select
    wp.work_id,
    wp.user_id,
    wp.access_level,

    coalesce(
      nullif(
        btrim(p.full_name),
        ''
      ),
      'Participante'
    )

  into
    v_work_id,
    v_target_user_id,
    v_target_access,
    v_target_name

  from public.work_participants wp

  left join public.profiles p
    on p.id = wp.user_id

  where wp.id = p_participant_id
    and wp.status = 'active'
    and wp.removed_at is null;

  if v_work_id is null then
    raise exception
      'Participante ativo nao encontrado.';
  end if;

  if not public.can_manage_work(
    v_work_id
  ) then
    raise exception
      'Voce nao possui permissao para administrar participantes desta obra.';
  end if;

  select wp.access_level
  into v_requester_access
  from public.work_participants wp
  where wp.work_id = v_work_id
    and wp.user_id = v_requester_id
    and wp.status = 'active'
    and wp.removed_at is null;

  if v_target_access = 'owner' then
    raise exception
      'O proprietario da obra nao pode ser removido.';
  end if;

  if
    v_requester_access <> 'owner'
    and v_target_access = 'manager'
  then
    raise exception
      'Somente o proprietario da obra pode remover administradores da obra.';
  end if;

  if exists (
    select 1
    from public.environments e
    where e.work_id = v_work_id
      and e.responsible_user_id = v_target_user_id
      and e.active = true
      and e.archived_at is null
  ) then
    raise exception
      'Reatribua os ambientes deste profissional antes de remove-lo da obra.';
  end if;

  update public.work_participants
  set
    status = 'removed',
    removed_at = now(),
    updated_at = now()
  where id = p_participant_id;

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
    v_work_id,
    'PARTICIPANTE_REMOVIDO',
    'Participante removido',
    v_target_name || ' foi removido da obra.',
    v_requester_id,
    'internal',
    jsonb_build_object(
      'participant_user_id',
      v_target_user_id,
      'previous_access_level',
      v_target_access
    )
  );

  return true;
end;
$$;

revoke all
on function public.remove_work_participant(uuid)
from public;

grant execute
on function public.remove_work_participant(uuid)
to authenticated;
