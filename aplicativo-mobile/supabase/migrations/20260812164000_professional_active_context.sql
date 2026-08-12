-- =========================================================
-- FIO
-- CONTEXTO PROFISSIONAL ATIVO
-- =========================================================
--
-- O usuário pode participar de várias empresas.
--
-- active_company_id representa a empresa em cujo contexto
-- profissional ele está atuando naquele momento.
--
-- Isso NÃO concede acesso a obras.
-- O acesso às obras continua sendo controlado
-- exclusivamente por work_participants.
-- =========================================================


-- =========================================================
-- EMPRESA ATIVA DO USUÁRIO
-- =========================================================

alter table public.profiles
  add column if not exists active_company_id uuid
    references public.companies(id)
    on delete set null;


create index if not exists
  profiles_active_company_id_idx
on public.profiles(active_company_id);


-- =========================================================
-- VERIFICA SE O USUÁRIO PODE ATUAR PELA EMPRESA
-- =========================================================

create or replace function public.can_use_company_context(
  p_company_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.companies c
    where c.id = p_company_id
      and c.active = true

      and (
        exists (
          select 1
          from public.company_members cm
          where cm.company_id = c.id
            and cm.user_id = auth.uid()
            and cm.status = 'active'
        )

        or

        exists (
          select 1
          from public.company_collaborators cc
          where cc.company_id = c.id
            and cc.user_id = auth.uid()
            and cc.status = 'approved'
        )
      )
  );
$$;


revoke all
on function public.can_use_company_context(uuid)
from public;

grant execute
on function public.can_use_company_context(uuid)
to authenticated;


-- =========================================================
-- LISTA DE CONTEXTOS PROFISSIONAIS DO USUÁRIO
-- =========================================================

create or replace function public.get_my_company_contexts()
returns table (
  company_id uuid,
  company_name text,
  relationship_type text,
  company_role text,
  role_title text,
  is_active boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id as company_id,
    c.name as company_name,

    case
      when exists (
        select 1
        from public.company_members cm
        where cm.company_id = c.id
          and cm.user_id = auth.uid()
          and cm.status = 'active'
      )
      then 'member'
      else 'collaborator'
    end as relationship_type,

    (
      select cm.role
      from public.company_members cm
      where cm.company_id = c.id
        and cm.user_id = auth.uid()
        and cm.status = 'active'
      limit 1
    ) as company_role,

    (
      select cc.role_title
      from public.company_collaborators cc
      where cc.company_id = c.id
        and cc.user_id = auth.uid()
        and cc.status = 'approved'
      limit 1
    ) as role_title,

    p.active_company_id = c.id
      as is_active

  from public.companies c

  join public.profiles p
    on p.id = auth.uid()

  where c.active = true

    and (
      exists (
        select 1
        from public.company_members cm
        where cm.company_id = c.id
          and cm.user_id = auth.uid()
          and cm.status = 'active'
      )

      or

      exists (
        select 1
        from public.company_collaborators cc
        where cc.company_id = c.id
          and cc.user_id = auth.uid()
          and cc.status = 'approved'
      )
    )

  order by
    (
      p.active_company_id = c.id
    ) desc,
    c.name;
$$;


revoke all
on function public.get_my_company_contexts()
from public;

grant execute
on function public.get_my_company_contexts()
to authenticated;


-- =========================================================
-- ALTERA O CONTEXTO PROFISSIONAL ATIVO
-- =========================================================

create or replace function public.set_active_company_context(
  p_company_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception
      'Usuário não autenticado.';
  end if;


  -- NULL permite sair do contexto de empresa.
  if p_company_id is null then

    update public.profiles
    set
      active_company_id = null,
      updated_at = now()
    where id = auth.uid();

    return;
  end if;


  if not public.can_use_company_context(
    p_company_id
  ) then
    raise exception
      'Você não possui vínculo ativo com esta empresa.';
  end if;


  update public.profiles
  set
    active_company_id = p_company_id,
    updated_at = now()
  where id = auth.uid();
end;
$$;


revoke all
on function public.set_active_company_context(uuid)
from public;

grant execute
on function public.set_active_company_context(uuid)
to authenticated;


-- =========================================================
-- CONTEXTO PROFISSIONAL ATIVO ATUAL
-- =========================================================

create or replace function public.get_active_company_context()
returns table (
  company_id uuid,
  company_name text,
  relationship_type text,
  company_role text,
  role_title text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    mc.company_id,
    mc.company_name,
    mc.relationship_type,
    mc.company_role,
    mc.role_title

  from public.get_my_company_contexts() mc

  where mc.is_active = true

  limit 1;
$$;


revoke all
on function public.get_active_company_context()
from public;

grant execute
on function public.get_active_company_context()
to authenticated;


-- =========================================================
-- CREATE WORK
--
-- Se p_company_id vier preenchido:
-- usa a empresa informada.
--
-- Se vier NULL:
-- usa automaticamente active_company_id do perfil.
--
-- Se não houver contexto ativo:
-- a obra continua sendo criada sem empresa.
-- =========================================================

create or replace function public.create_work(
  p_client_name text,
  p_client_phone text,
  p_address text,
  p_project_order text default null,
  p_status text default 'agendada',
  p_progress integer default 0,
  p_next_visit_at timestamptz default null,
  p_notes text default null,
  p_company_id uuid default null,
  p_role_title text default null
)
returns table (
  work_id uuid,
  work_code text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_work_id uuid;
  v_code text;

  v_year integer;
  v_sequence integer;

  v_profile_role text;
  v_role_title text;

  v_active_company_id uuid;
  v_company_id uuid;
begin

  v_user_id := auth.uid();


  if v_user_id is null then
    raise exception
      'Usuario nao autenticado.';
  end if;


  if nullif(
    btrim(p_client_name),
    ''
  ) is null then
    raise exception
      'Informe o cliente.';
  end if;


  if nullif(
    btrim(p_client_phone),
    ''
  ) is null then
    raise exception
      'Informe o telefone.';
  end if;


  if nullif(
    btrim(p_address),
    ''
  ) is null then
    raise exception
      'Informe o endereco.';
  end if;


  if p_status not in (
    'agendada',
    'em_andamento',
    'aguardando_peca',
    'aguardando_cliente',
    'finalizada'
  ) then
    raise exception
      'Status da obra invalido.';
  end if;


  if coalesce(
    p_progress,
    0
  ) < 0
  or coalesce(
    p_progress,
    0
  ) > 100 then
    raise exception
      'Percentual da obra deve estar entre 0 e 100.';
  end if;


  -- =====================================================
  -- CONTEXTO PROFISSIONAL
  -- =====================================================

  select p.active_company_id
  into v_active_company_id
  from public.profiles p
  where p.id = v_user_id;


  v_company_id :=
    coalesce(
      p_company_id,
      v_active_company_id
    );


  if v_company_id is not null then

    if not public.can_use_company_context(
      v_company_id
    ) then
      raise exception
        'Voce nao possui vinculo ativo com esta empresa.';
    end if;

  end if;


  -- =====================================================
  -- FUNÇÃO PROFISSIONAL
  -- =====================================================

  select
    nullif(
      btrim(p.job_title),
      ''
    )
  into v_profile_role
  from public.profiles p
  where p.id = v_user_id;


  v_role_title :=
    coalesce(
      nullif(
        btrim(p_role_title),
        ''
      ),
      v_profile_role,
      'Responsavel pela obra'
    );


  -- =====================================================
  -- CÓDIGO ANUAL SEQUENCIAL
  -- =====================================================

  v_year :=
    extract(
      year
      from timezone(
        'America/Sao_Paulo',
        now()
      )
    )::integer;


  insert into public.work_code_counters as wc (
    work_year,
    last_value,
    updated_at
  )
  values (
    v_year,
    1,
    now()
  )

  on conflict (
    work_year
  )

  do update
  set
    last_value =
      wc.last_value + 1,

    updated_at =
      now()

  returning last_value
  into v_sequence;


  v_code :=
    'FIO-'
    || v_year::text
    || '-'
    || lpad(
      v_sequence::text,
      3,
      '0'
    );


  v_work_id :=
    gen_random_uuid();


  -- =====================================================
  -- OBRA
  -- =====================================================

  insert into public.works (
    id,
    code,
    client_name,
    client_phone,
    address,
    project_order,
    status,
    progress,
    next_visit_at,
    notes,
    created_by
  )
  values (
    v_work_id,
    v_code,
    btrim(p_client_name),
    btrim(p_client_phone),
    btrim(p_address),
    nullif(
      btrim(p_project_order),
      ''
    ),
    p_status,
    coalesce(
      p_progress,
      0
    ),
    p_next_visit_at,
    nullif(
      btrim(p_notes),
      ''
    ),
    v_user_id
  );


  -- =====================================================
  -- CRIADOR RECEBE ACESSO À OBRA
  -- =====================================================

  insert into public.work_participants (
    work_id,
    user_id,
    company_id,
    role_title,
    access_level,
    status,
    joined_at
  )
  values (
    v_work_id,
    v_user_id,
    v_company_id,
    v_role_title,
    'owner',
    'active',
    now()
  );


  -- =====================================================
  -- EMPRESA PARTICIPANTE DA OBRA
  -- =====================================================

  if v_company_id is not null then

    insert into public.work_companies (
      work_id,
      company_id,
      status,
      added_by
    )
    values (
      v_work_id,
      v_company_id,
      'active',
      v_user_id
    );

  end if;


  -- =====================================================
  -- PRIMEIRO EVENTO DO DIÁRIO
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
    v_work_id,
    'OBRA_CRIADA',
    'Obra criada',

    case
      when nullif(
        btrim(p_project_order),
        ''
      ) is not null
      then
        'Projeto / pedido: '
        || btrim(
          p_project_order
        )

      else
        'Cadastro inicial da obra.'
    end,

    v_user_id,
    'internal',

    jsonb_build_object(
      'cliente',
      btrim(
        p_client_name
      ),

      'status',
      p_status,

      'company_id',
      v_company_id
    )
  );


  return query
  select
    v_work_id,
    v_code;

end;
$$;


revoke all
on function public.create_work(
  text,
  text,
  text,
  text,
  text,
  integer,
  timestamptz,
  text,
  uuid,
  text
)
from public;


grant execute
on function public.create_work(
  text,
  text,
  text,
  text,
  text,
  integer,
  timestamptz,
  text,
  uuid,
  text
)
to authenticated;