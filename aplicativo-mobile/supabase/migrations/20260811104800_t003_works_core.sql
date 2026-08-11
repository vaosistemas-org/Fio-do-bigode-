begin;

-- =========================================================
-- FIO
-- T003 - NUCLEO DE OBRAS
-- =========================================================
--
-- Estrutura central:
--   works
--   work_participants
--   work_companies
--   work_events
--   work_code_counters
--
-- Regras principais:
-- - A obra e o centro do sistema.
-- - Vinculo com empresa nao concede acesso automatico a obra.
-- - O acesso real e controlado por work_participants.
-- - Uma obra pode envolver varias empresas.
-- - Eventos relevantes alimentam o Diario / Linha do Tempo.
-- =========================================================


-- =========================================================
-- 1. CONTADOR PARA CODIGO DAS OBRAS
-- Exemplo: FIO-2026-001
-- =========================================================

create table public.work_code_counters (
  work_year integer primary key,
  last_value integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.work_code_counters
enable row level security;


-- =========================================================
-- 2. OBRAS
-- =========================================================

create table public.works (
  id uuid primary key default gen_random_uuid(),

  code text not null unique,

  client_name text not null,
  client_phone text not null,
  address text not null,

  project_order text,

  status text not null default 'agendada'
    check (
      status in (
        'agendada',
        'em_andamento',
        'aguardando_peca',
        'aguardando_cliente',
        'finalizada'
      )
    ),

  progress smallint not null default 0
    check (
      progress between 0 and 100
    ),

  automatic_progress boolean not null default false,

  next_visit_at timestamptz,

  notes text,

  created_by uuid not null
    references auth.users(id)
    on delete restrict,

  archived_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index works_status_idx
  on public.works(status);

create index works_updated_at_idx
  on public.works(updated_at desc);

alter table public.works
enable row level security;


-- =========================================================
-- 3. PARTICIPANTES / ACESSO A OBRA
-- =========================================================
--
-- Estar vinculado a uma empresa NAO significa possuir
-- acesso automatico as obras dessa empresa.
--
-- O acesso real existe nesta tabela.
-- =========================================================

create table public.work_participants (
  id uuid primary key default gen_random_uuid(),

  work_id uuid not null
    references public.works(id)
    on delete cascade,

  user_id uuid not null
    references auth.users(id)
    on delete restrict,

  company_id uuid
    references public.companies(id)
    on delete set null,

  role_title text,

  access_level text not null default 'collaborator'
    check (
      access_level in (
        'owner',
        'manager',
        'collaborator',
        'viewer'
      )
    ),

  status text not null default 'active'
    check (
      status in (
        'active',
        'removed'
      )
    ),

  invited_by uuid
    references auth.users(id)
    on delete set null,

  joined_at timestamptz not null default now(),

  removed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (
    work_id,
    user_id
  )
);

create index work_participants_user_idx
  on public.work_participants(
    user_id,
    status
  );

create index work_participants_work_idx
  on public.work_participants(
    work_id,
    status
  );

alter table public.work_participants
enable row level security;


-- =========================================================
-- 4. EMPRESAS ENVOLVIDAS NA OBRA
-- =========================================================
--
-- Permite que uma mesma obra possua diferentes fornecedores
-- e empresas ao longo do tempo.
--
-- Exemplos futuros:
-- - Marcenaria
-- - Marmoraria
-- - Arquitetura
-- - Instaladores
-- - Outros fornecedores
-- =========================================================

create table public.work_companies (
  id uuid primary key default gen_random_uuid(),

  work_id uuid not null
    references public.works(id)
    on delete cascade,

  company_id uuid not null
    references public.companies(id)
    on delete restrict,

  service_scope text,

  status text not null default 'active'
    check (
      status in (
        'active',
        'inactive'
      )
    ),

  added_by uuid
    references auth.users(id)
    on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (
    work_id,
    company_id
  )
);

create index work_companies_company_idx
  on public.work_companies(company_id);

create index work_companies_work_idx
  on public.work_companies(work_id);

alter table public.work_companies
enable row level security;


-- =========================================================
-- 5. EVENTOS / DIARIO DA OBRA
-- =========================================================
--
-- Esta tabela sera a espinha dorsal para:
-- - Diario
-- - Linha do tempo
-- - Auditoria
-- - Relatorios
-- - Portal do cliente
-- - Futuras automacoes e IA
-- =========================================================

create table public.work_events (
  id uuid primary key default gen_random_uuid(),

  work_id uuid not null
    references public.works(id)
    on delete cascade,

  event_type text not null,

  title text not null,

  description text,

  actor_user_id uuid
    references auth.users(id)
    on delete set null,

  visibility text not null default 'internal'
    check (
      visibility in (
        'internal',
        'shared',
        'client'
      )
    ),

  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now()
);

create index work_events_work_created_idx
  on public.work_events(
    work_id,
    created_at desc
  );

alter table public.work_events
enable row level security;


-- =========================================================
-- 6. FUNCOES AUXILIARES DE PERMISSAO
-- =========================================================

create or replace function public.is_work_participant(
  p_work_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.work_participants wp
    where wp.work_id = p_work_id
      and wp.user_id = (
        select auth.uid()
      )
      and wp.status = 'active'
  );
$$;


create or replace function public.can_manage_work(
  p_work_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.work_participants wp
    where wp.work_id = p_work_id
      and wp.user_id = (
        select auth.uid()
      )
      and wp.status = 'active'
      and wp.access_level in (
        'owner',
        'manager'
      )
  );
$$;


revoke execute
on function public.is_work_participant(uuid)
from public, anon;

grant execute
on function public.is_work_participant(uuid)
to authenticated;


revoke execute
on function public.can_manage_work(uuid)
from public, anon;

grant execute
on function public.can_manage_work(uuid)
to authenticated;


-- =========================================================
-- 7. ROW LEVEL SECURITY
-- =========================================================

create policy "works_select_participant"
on public.works
for select
to authenticated
using (
  public.is_work_participant(id)
);


create policy "work_participants_select_participant"
on public.work_participants
for select
to authenticated
using (
  public.is_work_participant(work_id)
);


create policy "work_companies_select_participant"
on public.work_companies
for select
to authenticated
using (
  public.is_work_participant(work_id)
);


create policy "work_events_select_participant"
on public.work_events
for select
to authenticated
using (
  public.is_work_participant(work_id)
);


-- =========================================================
-- 8. PRIVILEGIOS
-- =========================================================
--
-- Neste momento o aplicativo pode fazer SELECT.
--
-- Criacoes estruturais importantes sao feitas por RPC
-- para evitar registros pela metade.
-- =========================================================

revoke all privileges
on table
  public.work_code_counters,
  public.works,
  public.work_participants,
  public.work_companies,
  public.work_events
from anon;


revoke all privileges
on table
  public.work_code_counters,
  public.works,
  public.work_participants,
  public.work_companies,
  public.work_events
from authenticated;


grant select
on table
  public.works,
  public.work_participants,
  public.work_companies,
  public.work_events
to authenticated;


-- =========================================================
-- 9. RPC - CRIACAO ATOMICA DE OBRA
-- =========================================================
--
-- Ao criar uma obra:
--
-- 1. gera codigo FIO
-- 2. cria a obra
-- 3. cria acesso OWNER para quem criou
-- 4. associa a empresa, quando aplicavel
-- 5. registra OBRA_CRIADA no Diario
--
-- Tudo dentro da mesma transacao.
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


  -- -------------------------------------------------------
  -- VALIDACAO DA EMPRESA
  -- -------------------------------------------------------

  if p_company_id is not null then

    if not (
      exists (
        select 1
        from public.company_members cm
        where cm.company_id = p_company_id
          and cm.user_id = v_user_id
          and cm.role in (
            'owner',
            'admin'
          )
      )

      or

      exists (
        select 1
        from public.company_collaborators cc
        where cc.company_id = p_company_id
          and cc.user_id = v_user_id
          and cc.status = 'approved'
      )
    ) then

      raise exception
        'Voce nao possui vinculo ativo com esta empresa.';

    end if;

  end if;


  -- -------------------------------------------------------
  -- FUNCAO / PAPEL DO CRIADOR
  -- -------------------------------------------------------

  select nullif(
    btrim(p.job_title),
    ''
  )
  into v_profile_role
  from public.profiles p
  where p.id = v_user_id;


  v_role_title := coalesce(
    nullif(
      btrim(p_role_title),
      ''
    ),
    v_profile_role,
    'Responsavel pela obra'
  );


  -- -------------------------------------------------------
  -- GERACAO DO CODIGO
  -- -------------------------------------------------------

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


  -- -------------------------------------------------------
  -- CRIA OBRA
  -- -------------------------------------------------------

  v_work_id :=
    gen_random_uuid();


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


  -- -------------------------------------------------------
  -- CRIADOR RECEBE ACESSO OWNER
  -- -------------------------------------------------------

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
    p_company_id,
    v_role_title,
    'owner',
    'active',
    now()
  );


  -- -------------------------------------------------------
  -- EMPRESA DA OBRA
  -- -------------------------------------------------------

  if p_company_id is not null then

    insert into public.work_companies (
      work_id,
      company_id,
      status,
      added_by
    )
    values (
      v_work_id,
      p_company_id,
      'active',
      v_user_id
    );

  end if;


  -- -------------------------------------------------------
  -- PRIMEIRO EVENTO DO DIARIO
  -- -------------------------------------------------------

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
        || btrim(p_project_order)

      else
        'Cadastro inicial da obra.'
    end,

    v_user_id,
    'internal',

    jsonb_build_object(
      'cliente',
      btrim(p_client_name),

      'status',
      p_status
    )
  );


  return query
  select
    v_work_id,
    v_code;

end;
$$;


revoke execute
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
from public, anon;


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


commit;