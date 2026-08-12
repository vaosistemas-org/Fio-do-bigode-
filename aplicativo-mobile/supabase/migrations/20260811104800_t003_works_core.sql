begin;

-- =========================================================
-- FIO
-- T005 - AMBIENTES
-- =========================================================
--
-- Regras:
-- - Ambiente pertence a uma obra.
-- - Responsavel deve ser participante ativo da obra.
-- - Primeiro ambiente ativa progresso automatico da obra.
-- - Nao iniciado = 0%.
-- - Concluido = 100%.
-- - Cancelados nao entram no calculo do progresso da obra.
-- - Alteracoes relevantes entram em work_events.
-- - Escritas estruturais acontecem por RPC.
-- =========================================================


-- =========================================================
-- 1. AMBIENTES
-- =========================================================

create table public.environments (
  id uuid primary key default gen_random_uuid(),

  work_id uuid not null
    references public.works(id)
    on delete cascade,

  category text not null
    check (
      category in (
        'cozinha',
        'sala_estar',
        'sala_jantar',
        'lavabo',
        'banheiro',
        'suite',
        'dormitorio',
        'closet',
        'escritorio',
        'lavanderia',
        'area_servico',
        'varanda',
        'area_gourmet',
        'hall',
        'corredor',
        'garagem',
        'deposito',
        'outro_ambiente'
      )
    ),

  identifier text,

  custom_name text,

  name text not null,

  responsible_user_id uuid
    references auth.users(id)
    on delete set null,

  status text not null default 'nao_iniciado'
    check (
      status in (
        'nao_iniciado',
        'em_andamento',
        'aguardando',
        'concluido',
        'cancelado'
      )
    ),

  progress smallint not null default 0
    check (
      progress between 0 and 100
    ),

  weight numeric(8,2) not null default 1
    check (
      weight > 0
    ),

  services_notes text,

  missing_items_notes text,

  notes text,

  client_visible boolean not null default false,

  preparation_min_photos integer not null default 0
    check (
      preparation_min_photos >= 0
    ),

  active boolean not null default true,

  created_by uuid not null
    references auth.users(id)
    on delete restrict,

  updated_by uuid
    references auth.users(id)
    on delete set null,

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now(),

  archived_at timestamptz
);


create index environments_work_idx
  on public.environments(
    work_id,
    active
  );


create index environments_responsible_idx
  on public.environments(
    responsible_user_id
  );


create index environments_status_idx
  on public.environments(
    work_id,
    status
  );


-- Impede nomes duplicados dentro da mesma obra.
-- Exemplo:
-- Cozinha
-- Cozinha
--
-- nao pode.
--
-- Mas:
-- Dormitorio - Filho
-- Dormitorio - Casal
--
-- pode.
create unique index environments_unique_active_name_idx
  on public.environments(
    work_id,
    lower(name)
  )
  where active = true;


alter table public.environments
enable row level security;


-- =========================================================
-- 2. EVENTOS PASSAM A PODER APONTAR PARA UM AMBIENTE
-- =========================================================

alter table public.work_events
add column environment_id uuid
  references public.environments(id)
  on delete set null;


create index work_events_environment_idx
  on public.work_events(
    environment_id,
    created_at desc
  );


-- =========================================================
-- 3. HELPER - NOME DA CATEGORIA
-- =========================================================

create or replace function public.environment_category_label(
  p_category text
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin

  return case p_category
    when 'cozinha'
      then 'Cozinha'

    when 'sala_estar'
      then 'Sala de estar'

    when 'sala_jantar'
      then 'Sala de jantar'

    when 'lavabo'
      then 'Lavabo'

    when 'banheiro'
      then 'Banheiro'

    when 'suite'
      then 'Suite'

    when 'dormitorio'
      then 'Dormitorio'

    when 'closet'
      then 'Closet'

    when 'escritorio'
      then 'Escritorio'

    when 'lavanderia'
      then 'Lavanderia'

    when 'area_servico'
      then 'Area de servico'

    when 'varanda'
      then 'Varanda'

    when 'area_gourmet'
      then 'Area gourmet'

    when 'hall'
      then 'Hall'

    when 'corredor'
      then 'Corredor'

    when 'garagem'
      then 'Garagem'

    when 'deposito'
      then 'Deposito'

    when 'outro_ambiente'
      then 'Outro ambiente'

    else
      null
  end;

end;
$$;


-- =========================================================
-- 4. HELPER - MONTA NOME DO AMBIENTE
-- =========================================================

create or replace function public.build_environment_name(
  p_category text,
  p_identifier text,
  p_custom_name text
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_base_name text;
  v_identifier text;
  v_custom_name text;
begin

  v_identifier :=
    nullif(
      btrim(p_identifier),
      ''
    );

  v_custom_name :=
    nullif(
      btrim(p_custom_name),
      ''
    );


  if p_category = 'outro_ambiente' then

    if v_custom_name is null then
      raise exception
        'Informe o nome do ambiente.';
    end if;

    return v_custom_name;

  end if;


  v_base_name :=
    public.environment_category_label(
      p_category
    );


  if v_base_name is null then
    raise exception
      'Categoria de ambiente invalida.';
  end if;


  if v_identifier is not null then
    return
      v_base_name
      || ' - '
      || v_identifier;
  end if;


  return v_base_name;

end;
$$;


-- =========================================================
-- 5. HELPER - USUARIO PODE ATUALIZAR O AMBIENTE
-- =========================================================
--
-- Owner / Manager:
-- pode atualizar qualquer ambiente.
--
-- Responsavel do ambiente:
-- pode registrar andamento do proprio ambiente.
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

      and (

        public.can_manage_work(
          e.work_id
        )

        or

        e.responsible_user_id =
          (
            select auth.uid()
          )

      )

  );

$$;


revoke execute
on function public.can_update_environment(uuid)
from public, anon;


grant execute
on function public.can_update_environment(uuid)
to authenticated;


-- =========================================================
-- 6. RECALCULO DO PROGRESSO DA OBRA
-- =========================================================
--
-- Media ponderada:
--
-- soma(progress * weight)
-- -----------------------
-- soma(weight)
--
-- Ambientes:
-- - ativos
-- - nao cancelados
--
-- entram no calculo.
-- =========================================================

create or replace function public.recalculate_work_progress(
  p_work_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_progress integer;
  v_environment_count integer;
begin

  select count(*)
  into v_environment_count
  from public.environments e
  where e.work_id = p_work_id
    and e.active = true
    and e.status <> 'cancelado';


  if v_environment_count = 0 then

    update public.works
    set
      automatic_progress = false,
      updated_at = now()
    where id = p_work_id;

    select progress
    into v_progress
    from public.works
    where id = p_work_id;

    return coalesce(
      v_progress,
      0
    );

  end if;


  select
    round(
      sum(
        e.progress * e.weight
      )
      /
      nullif(
        sum(e.weight),
        0
      )
    )::integer
  into v_progress
  from public.environments e
  where e.work_id = p_work_id
    and e.active = true
    and e.status <> 'cancelado';


  v_progress :=
    greatest(
      0,
      least(
        coalesce(
          v_progress,
          0
        ),
        100
      )
    );


  update public.works
  set
    progress = v_progress,
    automatic_progress = true,
    updated_at = now()
  where id = p_work_id;


  return v_progress;

end;
$$;


revoke execute
on function public.recalculate_work_progress(uuid)
from public, anon, authenticated;


-- =========================================================
-- 7. RLS
-- =========================================================

create policy "environments_select_participant"
on public.environments
for select
to authenticated
using (
  public.is_work_participant(
    work_id
  )
);


-- Sem INSERT / UPDATE / DELETE direto pelo app.
-- Tudo passa pelas RPCs abaixo.


revoke all privileges
on table public.environments
from anon;


revoke all privileges
on table public.environments
from authenticated;


grant select
on table public.environments
to authenticated;


-- =========================================================
-- 8. RPC - CRIAR AMBIENTE
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

  v_user_id :=
    auth.uid();


  if v_user_id is null then
    raise exception
      'Usuario nao autenticado.';
  end if;


  if not public.can_manage_work(
    p_work_id
  ) then
    raise exception
      'Voce nao possui permissao para criar ambientes nesta obra.';
  end if;


  -- -------------------------------------------------------
  -- STATUS
  -- -------------------------------------------------------

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


  -- -------------------------------------------------------
  -- PROGRESSO
  -- -------------------------------------------------------

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


  -- -------------------------------------------------------
  -- PESO
  -- -------------------------------------------------------

  if
    p_weight is null
    or
    p_weight <= 0
  then
    raise exception
      'O peso do ambiente deve ser maior que zero.';
  end if;


  -- -------------------------------------------------------
  -- FOTOS MINIMAS PARA PREPARACAO
  -- -------------------------------------------------------

  if
    coalesce(
      p_preparation_min_photos,
      0
    ) < 0
  then
    raise exception
      'Quantidade minima de fotos invalida.';
  end if;


  -- -------------------------------------------------------
  -- NOME
  -- -------------------------------------------------------

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


  -- -------------------------------------------------------
  -- RESPONSAVEL
  -- -------------------------------------------------------

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
  ) then

    raise exception
      'O responsavel precisa ser participante ativo da obra.';

  end if;


  -- -------------------------------------------------------
  -- CRIA AMBIENTE
  -- -------------------------------------------------------

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


  -- -------------------------------------------------------
  -- EVENTO
  -- -------------------------------------------------------

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


  -- -------------------------------------------------------
  -- RECALCULA OBRA
  -- -------------------------------------------------------

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


revoke execute
on function public.create_environment(
  uuid,
  text,
  text,
  text,
  uuid,
  text,
  integer,
  numeric,
  text,
  text,
  text,
  boolean,
  integer
)
from public, anon;


grant execute
on function public.create_environment(
  uuid,
  text,
  text,
  text,
  uuid,
  text,
  integer,
  numeric,
  text,
  text,
  text,
  boolean,
  integer
)
to authenticated;


-- =========================================================
-- 9. RPC - EDITAR AMBIENTE
-- =========================================================

create or replace function public.update_environment(
  p_environment_id uuid,
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
  v_work_id uuid;
  v_old_name text;
  v_old_status text;
  v_old_progress integer;

  v_name text;
  v_progress integer;
  v_work_progress integer;
begin

  v_user_id :=
    auth.uid();


  if v_user_id is null then
    raise exception
      'Usuario nao autenticado.';
  end if;


  select
    e.work_id,
    e.name,
    e.status,
    e.progress
  into
    v_work_id,
    v_old_name,
    v_old_status,
    v_old_progress
  from public.environments e
  where e.id =
    p_environment_id
    and e.active = true;


  if v_work_id is null then
    raise exception
      'Ambiente nao encontrado.';
  end if;


  if not public.can_manage_work(
    v_work_id
  ) then
    raise exception
      'Voce nao possui permissao para editar este ambiente.';
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
    where e.work_id = v_work_id
      and e.active = true
      and e.id <>
        p_environment_id
      and lower(e.name) =
        lower(v_name)
  ) then

    raise exception
      'Ja existe um ambiente chamado "%". Adicione uma identificacao para diferencia-lo.',
      v_name;

  end if;


  if p_responsible_user_id is null then
    raise exception
      'Informe o responsavel pelo ambiente.';
  end if;


  if not exists (
    select 1
    from public.work_participants wp
    where wp.work_id = v_work_id
      and wp.user_id =
        p_responsible_user_id
      and wp.status = 'active'
  ) then

    raise exception
      'O responsavel precisa ser participante ativo da obra.';

  end if;


  update public.environments
  set
    category = p_category,

    identifier =
      nullif(
        btrim(p_identifier),
        ''
      ),

    custom_name =
      nullif(
        btrim(p_custom_name),
        ''
      ),

    name = v_name,

    responsible_user_id =
      p_responsible_user_id,

    status = p_status,

    progress = v_progress,

    weight = p_weight,

    services_notes =
      nullif(
        btrim(p_services_notes),
        ''
      ),

    missing_items_notes =
      nullif(
        btrim(p_missing_items_notes),
        ''
      ),

    notes =
      nullif(
        btrim(p_notes),
        ''
      ),

    client_visible =
      coalesce(
        p_client_visible,
        false
      ),

    preparation_min_photos =
      coalesce(
        p_preparation_min_photos,
        0
      ),

    updated_by =
      v_user_id,

    updated_at =
      now()

  where id =
    p_environment_id;


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
    v_work_id,
    p_environment_id,
    'AMBIENTE_ATUALIZADO',
    'Ambiente atualizado',
    v_name,
    v_user_id,
    'internal',
    jsonb_build_object(
      'old_name',
      v_old_name,
      'new_name',
      v_name,
      'old_status',
      v_old_status,
      'new_status',
      p_status,
      'old_progress',
      v_old_progress,
      'new_progress',
      v_progress
    )
  );


  v_work_progress :=
    public.recalculate_work_progress(
      v_work_id
    );


  return query
  select
    p_environment_id,
    v_name,
    v_work_progress;

end;
$$;


revoke execute
on function public.update_environment(
  uuid,
  text,
  text,
  text,
  uuid,
  text,
  integer,
  numeric,
  text,
  text,
  text,
  boolean,
  integer
)
from public, anon;


grant execute
on function public.update_environment(
  uuid,
  text,
  text,
  text,
  uuid,
  text,
  integer,
  numeric,
  text,
  text,
  text,
  boolean,
  integer
)
to authenticated;


-- =========================================================
-- 10. RPC - REGISTRAR AVANCO DO AMBIENTE
-- =========================================================
--
-- Esta e a acao rapida usada no dia a dia.
--
-- Nao exige abrir toda a edicao do ambiente.
--
-- Owner / Manager ou responsavel do ambiente.
-- =========================================================

create or replace function public.record_environment_progress(
  p_environment_id uuid,
  p_status text,
  p_progress integer,
  p_observation text default null
)
returns table (
  environment_id uuid,
  environment_progress integer,
  work_progress integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_work_id uuid;
  v_environment_name text;

  v_old_status text;
  v_old_progress integer;

  v_progress integer;
  v_work_progress integer;
begin

  v_user_id :=
    auth.uid();


  if v_user_id is null then
    raise exception
      'Usuario nao autenticado.';
  end if;


  select
    e.work_id,
    e.name,
    e.status,
    e.progress
  into
    v_work_id,
    v_environment_name,
    v_old_status,
    v_old_progress
  from public.environments e
  where e.id =
    p_environment_id
    and e.active = true;


  if v_work_id is null then
    raise exception
      'Ambiente nao encontrado.';
  end if;


  if not public.can_update_environment(
    p_environment_id
  ) then
    raise exception
      'Voce nao possui permissao para atualizar este ambiente.';
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


  if p_status =
    'nao_iniciado'
  then
    v_progress := 0;
  end if;


  if p_status =
    'concluido'
  then
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


  update public.environments
  set
    status = p_status,
    progress = v_progress,
    updated_by = v_user_id,
    updated_at = now()
  where id =
    p_environment_id;


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
    v_work_id,
    p_environment_id,
    'AVANCO_AMBIENTE',
    'Avanco registrado em '
      || v_environment_name,

    nullif(
      btrim(p_observation),
      ''
    ),

    v_user_id,
    'internal',

    jsonb_build_object(
      'old_status',
      v_old_status,
      'new_status',
      p_status,
      'old_progress',
      v_old_progress,
      'new_progress',
      v_progress
    )
  );


  v_work_progress :=
    public.recalculate_work_progress(
      v_work_id
    );


  return query
  select
    p_environment_id,
    v_progress,
    v_work_progress;

end;
$$;


revoke execute
on function public.record_environment_progress(
  uuid,
  text,
  integer,
  text
)
from public, anon;


grant execute
on function public.record_environment_progress(
  uuid,
  text,
  integer,
  text
)
to authenticated;


-- =========================================================
-- 11. RPC - ARQUIVAR AMBIENTE
-- =========================================================

create or replace function public.archive_environment(
  p_environment_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_work_id uuid;
  v_environment_name text;
  v_work_progress integer;
begin

  v_user_id :=
    auth.uid();


  if v_user_id is null then
    raise exception
      'Usuario nao autenticado.';
  end if;


  select
    e.work_id,
    e.name
  into
    v_work_id,
    v_environment_name
  from public.environments e
  where e.id =
    p_environment_id
    and e.active = true;


  if v_work_id is null then
    raise exception
      'Ambiente nao encontrado.';
  end if;


  if not public.can_manage_work(
    v_work_id
  ) then
    raise exception
      'Voce nao possui permissao para arquivar este ambiente.';
  end if;


  update public.environments
  set
    active = false,
    archived_at = now(),
    updated_by = v_user_id,
    updated_at = now()
  where id =
    p_environment_id;


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
    v_work_id,
    p_environment_id,
    'AMBIENTE_ARQUIVADO',
    'Ambiente arquivado',
    v_environment_name,
    v_user_id,
    'internal',
    jsonb_build_object(
      'environment_name',
      v_environment_name
    )
  );


  v_work_progress :=
    public.recalculate_work_progress(
      v_work_id
    );


  return v_work_progress;

end;
$$;


revoke execute
on function public.archive_environment(uuid)
from public, anon;


grant execute
on function public.archive_environment(uuid)
to authenticated;


commit;