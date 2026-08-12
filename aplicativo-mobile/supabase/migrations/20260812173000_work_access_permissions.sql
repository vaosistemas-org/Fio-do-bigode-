-- =========================================================
-- FIO
-- PERMISSOES OPERACIONAIS DA OBRA
-- =========================================================
--
-- OWNER
--   Controle total da obra.
--
-- MANAGER
--   Operacao completa + gestao de participantes comuns.
--
-- COLLABORATOR
--   Pode trabalhar na obra e registrar fotos.
--   Pode atualizar apenas ambientes pelos quais e responsavel.
--   Nao administra participantes nem estrutura da obra.
--
-- VIEWER
--   Somente leitura.
--
-- A protecao abaixo acontece no banco e no Storage.
-- =========================================================


-- =========================================================
-- PARTICIPANTE ATIVO
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
      and wp.user_id = (select auth.uid())
      and wp.status = 'active'
      and wp.removed_at is null
  );
$$;

revoke all
on function public.is_work_participant(uuid)
from public;

grant execute
on function public.is_work_participant(uuid)
to authenticated;


-- =========================================================
-- PODE ADMINISTRAR A OBRA
-- OWNER / MANAGER
-- =========================================================

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
      and wp.user_id = (select auth.uid())
      and wp.status = 'active'
      and wp.removed_at is null
      and wp.access_level in (
        'owner',
        'manager'
      )
  );
$$;

revoke all
on function public.can_manage_work(uuid)
from public;

grant execute
on function public.can_manage_work(uuid)
to authenticated;


-- =========================================================
-- PODE ESCREVER NA OPERACAO DA OBRA
-- OWNER / MANAGER / COLLABORATOR
-- VIEWER FICA FORA
-- =========================================================

create or replace function public.can_write_work(
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
      and wp.user_id = (select auth.uid())
      and wp.status = 'active'
      and wp.removed_at is null
      and wp.access_level in (
        'owner',
        'manager',
        'collaborator'
      )
  );
$$;

revoke all
on function public.can_write_work(uuid)
from public;

grant execute
on function public.can_write_work(uuid)
to authenticated;


-- =========================================================
-- PODE ATUALIZAR UM AMBIENTE
--
-- OWNER / MANAGER:
--   qualquer ambiente ativo da obra.
--
-- COLLABORATOR:
--   somente se for o responsavel pelo ambiente.
--
-- VIEWER:
--   nunca.
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

revoke all
on function public.can_update_environment(uuid)
from public;

grant execute
on function public.can_update_environment(uuid)
to authenticated;


-- =========================================================
-- PARTICIPANTES DISPONIVEIS PARA RESPONSABILIDADE
--
-- VIEWER NAO PODE SER RESPONSAVEL OPERACIONAL.
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

  where gp.access_level in (
    'owner',
    'manager',
    'collaborator'
  )

  order by gp.full_name;
$$;

revoke all
on function public.get_work_participants_for_assignment(uuid)
from public;

grant execute
on function public.get_work_participants_for_assignment(uuid)
to authenticated;


-- =========================================================
-- CRIAR AMBIENTE
--
-- Continua estrutural: somente OWNER / MANAGER.
-- Responsavel precisa ter acesso operacional, nunca VIEWER.
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

  if not public.can_manage_work(
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


-- =========================================================
-- EDITAR ESTRUTURA DO AMBIENTE
--
-- Continua estrutural: somente OWNER / MANAGER.
-- Responsavel nunca pode ser VIEWER.
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
  v_user_id := auth.uid();

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


-- =========================================================
-- FOTOS - TABELA PUBLIC.WORK_PHOTOS
-- =========================================================
--
-- SELECT:
--   qualquer participante ativo.
--
-- INSERT:
--   owner / manager / collaborator.
--
-- UPDATE / DELETE:
--   owner / manager podem agir em qualquer foto.
--   collaborator somente nas proprias fotos.
--   viewer nunca escreve.
-- =========================================================

drop policy if exists
  "work_photos_select"
on public.work_photos;

create policy
  "work_photos_select"
on public.work_photos
for select
to authenticated
using (
  public.is_work_participant(
    work_id
  )
);


drop policy if exists
  "work_photos_insert"
on public.work_photos;

create policy
  "work_photos_insert"
on public.work_photos
for insert
to authenticated
with check (
  public.can_write_work(
    work_id
  )
  and created_by =
    (
      select auth.uid()
    )
);


drop policy if exists
  "work_photos_update"
on public.work_photos;

create policy
  "work_photos_update"
on public.work_photos
for update
to authenticated
using (
  public.can_manage_work(
    work_id
  )

  or

  (
    public.can_write_work(
      work_id
    )
    and created_by =
      (
        select auth.uid()
      )
  )
)
with check (
  public.can_manage_work(
    work_id
  )

  or

  (
    public.can_write_work(
      work_id
    )
    and created_by =
      (
        select auth.uid()
      )
  )
);


drop policy if exists
  "work_photos_delete"
on public.work_photos;

create policy
  "work_photos_delete"
on public.work_photos
for delete
to authenticated
using (
  public.can_manage_work(
    work_id
  )

  or

  (
    public.can_write_work(
      work_id
    )
    and created_by =
      (
        select auth.uid()
      )
  )
);


-- =========================================================
-- FOTOS - STORAGE.OBJECTS
-- =========================================================
--
-- O primeiro diretorio do path continua sendo work_id.
--
-- SELECT:
--   qualquer participante ativo.
--
-- INSERT:
--   owner / manager / collaborator.
--
-- UPDATE / DELETE:
--   owner / manager em qualquer arquivo da obra.
--   collaborator somente em arquivo que possua registro
--   correspondente em work_photos criado por ele.
-- =========================================================

drop policy if exists
  "work_photos_storage_select"
on storage.objects;

create policy
  "work_photos_storage_select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'work-photos'
  and public.is_work_participant(
    (
      storage.foldername(name)
    )[1]::uuid
  )
);


drop policy if exists
  "work_photos_storage_insert"
on storage.objects;

create policy
  "work_photos_storage_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'work-photos'
  and public.can_write_work(
    (
      storage.foldername(name)
    )[1]::uuid
  )
);


drop policy if exists
  "work_photos_storage_update"
on storage.objects;

create policy
  "work_photos_storage_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'work-photos'

  and (
    public.can_manage_work(
      (
        storage.foldername(name)
      )[1]::uuid
    )

    or

    (
      public.can_write_work(
        (
          storage.foldername(name)
        )[1]::uuid
      )

      and exists (
        select 1
        from public.work_photos wp
        where wp.storage_path =
          storage.objects.name
          and wp.work_id =
            (
              storage.foldername(
                storage.objects.name
              )
            )[1]::uuid
          and wp.created_by =
            (
              select auth.uid()
            )
      )
    )
  )
)
with check (
  bucket_id = 'work-photos'

  and (
    public.can_manage_work(
      (
        storage.foldername(name)
      )[1]::uuid
    )

    or

    (
      public.can_write_work(
        (
          storage.foldername(name)
        )[1]::uuid
      )

      and exists (
        select 1
        from public.work_photos wp
        where wp.storage_path =
          storage.objects.name
          and wp.work_id =
            (
              storage.foldername(
                storage.objects.name
              )
            )[1]::uuid
          and wp.created_by =
            (
              select auth.uid()
            )
      )
    )
  )
);


drop policy if exists
  "work_photos_storage_delete"
on storage.objects;

create policy
  "work_photos_storage_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'work-photos'

  and (
    public.can_manage_work(
      (
        storage.foldername(name)
      )[1]::uuid
    )

    or

    (
      public.can_write_work(
        (
          storage.foldername(name)
        )[1]::uuid
      )

      and exists (
        select 1
        from public.work_photos wp
        where wp.storage_path =
          storage.objects.name
          and wp.work_id =
            (
              storage.foldername(
                storage.objects.name
              )
            )[1]::uuid
          and wp.created_by =
            (
              select auth.uid()
            )
      )
    )
  )
);
