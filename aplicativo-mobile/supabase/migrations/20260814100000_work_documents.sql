-- =========================================================
-- FIO - DOCUMENTOS DA OBRA
-- =========================================================
--
-- Tres camadas de acesso:
--   fio_general      = participantes + leitura pelo FIO geral autorizado
--   professionals    = profissionais da obra, sem visualizador/cliente
--   company_internal = somente a empresa proprietaria
--
-- Referenciar nao copia o arquivo. A referencia acompanha a versao atual.
-- =========================================================


-- =========================================================
-- EVENTOS INTERNOS DA EMPRESA
-- =========================================================

alter table public.work_events
add column if not exists company_id uuid
references public.companies(id)
on delete set null;

alter table public.work_events
drop constraint if exists work_events_visibility_check;

alter table public.work_events
add constraint work_events_visibility_check
check (visibility in ('internal', 'shared', 'company'));

create index if not exists work_events_company_idx
on public.work_events(work_id, company_id, created_at desc)
where company_id is not null;


-- =========================================================
-- DOCUMENTO LOGICO E VERSOES DO ARQUIVO
-- =========================================================

create table if not exists public.work_documents (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null
    references public.works(id)
    on delete cascade,
  environment_id uuid
    references public.environments(id)
    on delete set null,
  owner_company_id uuid
    references public.companies(id)
    on delete set null,
  title text not null,
  description text,
  category text not null default 'other'
    check (
      category in (
        'architectural_project',
        'hydraulic_plan',
        'electrical_plan',
        'joinery_project',
        'measurement',
        'contract_proposal',
        'report',
        'manual',
        'receipt',
        'other'
      )
    ),
  visibility text not null default 'professionals'
    check (
      visibility in (
        'fio_general',
        'professionals',
        'company_internal'
      )
    ),
  allow_download boolean not null default false,
  current_version integer not null default 0
    check (current_version >= 0),
  active boolean not null default true,
  created_by uuid not null
    references auth.users(id)
    on delete restrict,
  updated_by uuid
    references auth.users(id)
    on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint work_documents_company_visibility_check
    check (
      visibility <> 'company_internal'
      or owner_company_id is not null
    )
);

create index if not exists work_documents_work_idx
on public.work_documents(work_id, active, created_at desc);

create index if not exists work_documents_environment_idx
on public.work_documents(environment_id, active, created_at desc);

create index if not exists work_documents_company_idx
on public.work_documents(owner_company_id, work_id, active)
where owner_company_id is not null;

create table if not exists public.work_document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null
    references public.work_documents(id)
    on delete cascade,
  version_number integer not null
    check (version_number > 0),
  storage_path text not null unique,
  file_name text not null,
  mime_type text,
  size_bytes bigint
    check (size_bytes is null or size_bytes >= 0),
  uploaded_by uuid not null
    references auth.users(id)
    on delete restrict,
  created_at timestamptz not null default now(),
  unique(document_id, version_number)
);

create index if not exists work_document_versions_document_idx
on public.work_document_versions(document_id, version_number desc);

create table if not exists public.work_document_references (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null
    references public.work_documents(id)
    on delete cascade,
  company_id uuid not null
    references public.companies(id)
    on delete cascade,
  note text,
  created_by uuid not null
    references auth.users(id)
    on delete restrict,
  created_at timestamptz not null default now(),
  unique(document_id, company_id)
);

create index if not exists work_document_references_company_idx
on public.work_document_references(company_id, created_at desc);

alter table public.work_documents enable row level security;
alter table public.work_document_versions enable row level security;
alter table public.work_document_references enable row level security;


-- =========================================================
-- HELPERS DE ACESSO
-- =========================================================

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
  );
$$;

revoke all on function public.can_access_work_document(uuid) from public;
grant execute on function public.can_access_work_document(uuid) to authenticated;

create or replace function public.can_manage_work_document(
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
      and public.can_write_work(d.work_id)
      and (
        public.can_manage_work(d.work_id)
        or d.created_by = (select auth.uid())
        or (
          d.owner_company_id is not null
          and public.can_use_company_context(d.owner_company_id)
        )
      )
  );
$$;

revoke all on function public.can_manage_work_document(uuid) from public;
grant execute on function public.can_manage_work_document(uuid) to authenticated;


-- =========================================================
-- RLS DOS REGISTROS
-- =========================================================

drop policy if exists work_documents_select on public.work_documents;
create policy work_documents_select
on public.work_documents
for select to authenticated
using (public.can_access_work_document(id));

drop policy if exists work_documents_insert on public.work_documents;
create policy work_documents_insert
on public.work_documents
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and public.can_write_work(work_id)
  and (
    owner_company_id is null
    or public.can_use_company_context(owner_company_id)
  )
  and (
    visibility <> 'company_internal'
    or owner_company_id is not null
  )
);

drop policy if exists work_documents_update on public.work_documents;
create policy work_documents_update
on public.work_documents
for update to authenticated
using (public.can_manage_work_document(id))
with check (public.can_manage_work_document(id));

drop policy if exists work_document_versions_select
on public.work_document_versions;
create policy work_document_versions_select
on public.work_document_versions
for select to authenticated
using (public.can_access_work_document(document_id));

drop policy if exists work_document_versions_insert
on public.work_document_versions;
create policy work_document_versions_insert
on public.work_document_versions
for insert to authenticated
with check (
  uploaded_by = (select auth.uid())
  and public.can_manage_work_document(document_id)
);

drop policy if exists work_document_references_select
on public.work_document_references;
create policy work_document_references_select
on public.work_document_references
for select to authenticated
using (
  public.can_use_company_context(company_id)
  and public.can_access_work_document(document_id)
);

drop policy if exists work_document_references_insert
on public.work_document_references;
create policy work_document_references_insert
on public.work_document_references
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and public.can_use_company_context(company_id)
  and public.can_access_work_document(document_id)
  and exists (
    select 1
    from public.work_documents d
    where d.id = document_id
      and d.visibility in ('fio_general', 'professionals')
  )
);

drop policy if exists work_document_references_delete
on public.work_document_references;
create policy work_document_references_delete
on public.work_document_references
for delete to authenticated
using (public.can_use_company_context(company_id));


-- =========================================================
-- STORAGE PRIVADO
-- =========================================================

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'work-documents',
  'work-documents',
  false,
  52428800,
  null
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;

drop policy if exists work_documents_storage_select
on storage.objects;
create policy work_documents_storage_select
on storage.objects
for select to authenticated
using (
  bucket_id = 'work-documents'
  and exists (
    select 1
    from public.work_document_versions v
    where v.storage_path = storage.objects.name
      and public.can_access_work_document(v.document_id)
  )
);

drop policy if exists work_documents_storage_insert
on storage.objects;
create policy work_documents_storage_insert
on storage.objects
for insert to authenticated
with check (
  bucket_id = 'work-documents'
  and exists (
    select 1
    from public.work_documents d
    where d.id::text = (storage.foldername(name))[2]
      and d.work_id::text = (storage.foldername(name))[1]
      and public.can_manage_work_document(d.id)
  )
);

drop policy if exists work_documents_storage_delete
on storage.objects;
create policy work_documents_storage_delete
on storage.objects
for delete to authenticated
using (
  bucket_id = 'work-documents'
  and exists (
    select 1
    from public.work_document_versions v
    where v.storage_path = storage.objects.name
      and public.can_manage_work_document(v.document_id)
  )
);


-- =========================================================
-- FUNCOES DO MODULO
-- =========================================================

create or replace function public.create_work_document(
  p_work_id uuid,
  p_environment_id uuid default null,
  p_owner_company_id uuid default null,
  p_title text default null,
  p_description text default null,
  p_category text default 'other',
  p_visibility text default 'professionals',
  p_allow_download boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_company_id uuid;
  v_document_id uuid;
  v_title text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  if not public.can_write_work(p_work_id) then
    raise exception 'Voce nao possui permissao para adicionar documentos.';
  end if;

  v_title := nullif(btrim(p_title), '');
  if v_title is null then
    raise exception 'Informe o titulo do documento.';
  end if;
  if char_length(v_title) > 180 then
    raise exception 'O titulo deve possuir no maximo 180 caracteres.';
  end if;

  if p_visibility not in (
    'fio_general',
    'professionals',
    'company_internal'
  ) then
    raise exception 'Permissao do documento invalida.';
  end if;

  if p_category not in (
    'architectural_project',
    'hydraulic_plan',
    'electrical_plan',
    'joinery_project',
    'measurement',
    'contract_proposal',
    'report',
    'manual',
    'receipt',
    'other'
  ) then
    raise exception 'Categoria do documento invalida.';
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

  v_company_id := p_owner_company_id;
  if v_company_id is null then
    select wp.company_id
    into v_company_id
    from public.work_participants wp
    where wp.work_id = p_work_id
      and wp.user_id = v_user_id
      and wp.status = 'active'
      and wp.removed_at is null
    limit 1;
  end if;

  if v_company_id is not null then
    if not public.can_use_company_context(v_company_id) then
      raise exception 'Voce nao possui vinculo ativo com a empresa informada.';
    end if;

    if not exists (
      select 1
      from public.work_participants wp
      where wp.work_id = p_work_id
        and wp.company_id = v_company_id
        and wp.status = 'active'
        and wp.removed_at is null
    ) then
      raise exception 'A empresa informada nao participa desta obra.';
    end if;
  end if;

  if p_visibility = 'company_internal' and v_company_id is null then
    raise exception 'Selecione uma empresa para criar um documento interno.';
  end if;

  insert into public.work_documents (
    work_id,
    environment_id,
    owner_company_id,
    title,
    description,
    category,
    visibility,
    allow_download,
    created_by,
    updated_by
  ) values (
    p_work_id,
    p_environment_id,
    v_company_id,
    v_title,
    nullif(btrim(p_description), ''),
    p_category,
    p_visibility,
    coalesce(p_allow_download, false),
    v_user_id,
    v_user_id
  )
  returning id into v_document_id;

  return v_document_id;
end;
$$;

revoke all on function public.create_work_document(
  uuid, uuid, uuid, text, text, text, text, boolean
) from public;
grant execute on function public.create_work_document(
  uuid, uuid, uuid, text, text, text, text, boolean
) to authenticated;

create or replace function public.add_work_document_version(
  p_document_id uuid,
  p_storage_path text,
  p_file_name text,
  p_mime_type text default null,
  p_size_bytes bigint default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version integer;
begin
  if auth.uid() is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  if not public.can_manage_work_document(p_document_id) then
    raise exception 'Voce nao pode enviar versoes para este documento.';
  end if;

  if nullif(btrim(p_storage_path), '') is null
    or nullif(btrim(p_file_name), '') is null
  then
    raise exception 'Arquivo do documento invalido.';
  end if;

  select coalesce(max(v.version_number), 0) + 1
  into v_version
  from public.work_document_versions v
  where v.document_id = p_document_id;

  insert into public.work_document_versions (
    document_id,
    version_number,
    storage_path,
    file_name,
    mime_type,
    size_bytes,
    uploaded_by
  ) values (
    p_document_id,
    v_version,
    btrim(p_storage_path),
    btrim(p_file_name),
    nullif(btrim(p_mime_type), ''),
    p_size_bytes,
    auth.uid()
  );

  update public.work_documents
  set
    current_version = v_version,
    updated_by = auth.uid(),
    updated_at = now()
  where id = p_document_id;

  return v_version;
end;
$$;

revoke all on function public.add_work_document_version(
  uuid, text, text, text, bigint
) from public;
grant execute on function public.add_work_document_version(
  uuid, text, text, text, bigint
) to authenticated;

create or replace function public.update_work_document(
  p_document_id uuid,
  p_environment_id uuid default null,
  p_title text default null,
  p_description text default null,
  p_category text default 'other',
  p_visibility text default 'professionals',
  p_allow_download boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_work_id uuid;
  v_company_id uuid;
  v_old_visibility text;
  v_title text;
begin
  if auth.uid() is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  if not public.can_manage_work_document(p_document_id) then
    raise exception 'Voce nao pode editar este documento.';
  end if;

  select d.work_id, d.owner_company_id, d.visibility
  into v_work_id, v_company_id, v_old_visibility
  from public.work_documents d
  where d.id = p_document_id
    and d.active = true;

  v_title := nullif(btrim(p_title), '');
  if v_title is null then
    raise exception 'Informe o titulo do documento.';
  end if;

  if p_visibility not in (
    'fio_general',
    'professionals',
    'company_internal'
  ) then
    raise exception 'Permissao do documento invalida.';
  end if;

  if p_visibility = 'company_internal' and v_company_id is null then
    raise exception 'Este documento nao possui empresa proprietaria.';
  end if;

  if p_category not in (
    'architectural_project',
    'hydraulic_plan',
    'electrical_plan',
    'joinery_project',
    'measurement',
    'contract_proposal',
    'report',
    'manual',
    'receipt',
    'other'
  ) then
    raise exception 'Categoria do documento invalida.';
  end if;

  if p_environment_id is not null
    and not exists (
      select 1
      from public.environments e
      where e.id = p_environment_id
        and e.work_id = v_work_id
        and e.active = true
    )
  then
    raise exception 'O ambiente informado nao pertence a esta obra.';
  end if;

  update public.work_documents
  set
    environment_id = p_environment_id,
    title = v_title,
    description = nullif(btrim(p_description), ''),
    category = p_category,
    visibility = p_visibility,
    allow_download = coalesce(p_allow_download, false),
    updated_by = auth.uid(),
    updated_at = now()
  where id = p_document_id;

  if v_old_visibility is distinct from p_visibility then
    insert into public.work_events (
      work_id,
      environment_id,
      event_type,
      title,
      description,
      actor_user_id,
      visibility,
      company_id,
      metadata
    )
    select
      d.work_id,
      d.environment_id,
      'DOCUMENTO_VISIBILIDADE_ALTERADA',
      'Acesso do documento atualizado',
      d.title,
      auth.uid(),
      case d.visibility
        when 'fio_general' then 'shared'
        when 'company_internal' then 'company'
        else 'internal'
      end,
      case
        when d.visibility = 'company_internal' then d.owner_company_id
        else null
      end,
      jsonb_build_object(
        'document_id', d.id,
        'from', v_old_visibility,
        'to', d.visibility
      )
    from public.work_documents d
    where d.id = p_document_id;
  end if;
end;
$$;

revoke all on function public.update_work_document(
  uuid, uuid, text, text, text, text, boolean
) from public;
grant execute on function public.update_work_document(
  uuid, uuid, text, text, text, text, boolean
) to authenticated;

create or replace function public.archive_work_document(
  p_document_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_document public.work_documents%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  if not public.can_manage_work_document(p_document_id) then
    raise exception 'Voce nao pode excluir este documento.';
  end if;

  select * into v_document
  from public.work_documents
  where id = p_document_id
    and active = true;

  update public.work_documents
  set
    active = false,
    archived_at = now(),
    updated_by = auth.uid(),
    updated_at = now()
  where id = p_document_id;

  if v_document.current_version > 0 then
    insert into public.work_events (
      work_id,
      environment_id,
      event_type,
      title,
      description,
      actor_user_id,
      visibility,
      company_id,
      metadata
    ) values (
      v_document.work_id,
      v_document.environment_id,
      'DOCUMENTO_ARQUIVADO',
      'Documento arquivado',
      v_document.title,
      auth.uid(),
      case v_document.visibility
        when 'fio_general' then 'shared'
        when 'company_internal' then 'company'
        else 'internal'
      end,
      case
        when v_document.visibility = 'company_internal'
          then v_document.owner_company_id
        else null
      end,
      jsonb_build_object('document_id', v_document.id)
    );
  end if;
end;
$$;

revoke all on function public.archive_work_document(uuid) from public;
grant execute on function public.archive_work_document(uuid) to authenticated;

create or replace function public.reference_work_document(
  p_document_id uuid,
  p_company_id uuid default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_reference_id uuid;
  v_work_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  if not public.can_access_work_document(p_document_id) then
    raise exception 'Voce nao possui acesso a este documento.';
  end if;

  select d.work_id
  into v_work_id
  from public.work_documents d
  where d.id = p_document_id
    and d.active = true
    and d.visibility in ('fio_general', 'professionals');

  if v_work_id is null then
    raise exception 'Documentos internos nao precisam ser referenciados.';
  end if;

  v_company_id := p_company_id;
  if v_company_id is null then
    select p.active_company_id
    into v_company_id
    from public.profiles p
    where p.id = auth.uid();
  end if;

  if v_company_id is null
    or not public.can_use_company_context(v_company_id)
  then
    raise exception 'Selecione uma empresa ativa para criar a referencia.';
  end if;

  if not exists (
    select 1
    from public.work_participants wp
    where wp.work_id = v_work_id
      and wp.company_id = v_company_id
      and wp.status = 'active'
      and wp.removed_at is null
  ) then
    raise exception 'Sua empresa nao participa desta obra.';
  end if;

  insert into public.work_document_references (
    document_id,
    company_id,
    note,
    created_by
  ) values (
    p_document_id,
    v_company_id,
    nullif(btrim(p_note), ''),
    auth.uid()
  )
  on conflict (document_id, company_id)
  do update set note = excluded.note
  returning id into v_reference_id;

  return v_reference_id;
end;
$$;

revoke all on function public.reference_work_document(uuid, uuid, text)
from public;
grant execute on function public.reference_work_document(uuid, uuid, text)
to authenticated;

create or replace function public.remove_work_document_reference(
  p_document_id uuid,
  p_company_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  v_company_id := p_company_id;
  if v_company_id is null then
    select p.active_company_id
    into v_company_id
    from public.profiles p
    where p.id = auth.uid();
  end if;

  if v_company_id is null
    or not public.can_use_company_context(v_company_id)
  then
    raise exception 'Empresa ativa invalida.';
  end if;

  delete from public.work_document_references r
  where r.document_id = p_document_id
    and r.company_id = v_company_id;
end;
$$;

revoke all on function public.remove_work_document_reference(uuid, uuid)
from public;
grant execute on function public.remove_work_document_reference(uuid, uuid)
to authenticated;


-- =========================================================
-- CONSULTA UNICA DO PAINEL
-- =========================================================

create or replace function public.get_work_documents(
  p_work_id uuid
)
returns table (
  id uuid,
  environment_id uuid,
  environment_name text,
  owner_company_id uuid,
  owner_company_name text,
  title text,
  description text,
  category text,
  visibility text,
  allow_download boolean,
  current_version integer,
  version_id uuid,
  storage_path text,
  file_name text,
  mime_type text,
  size_bytes bigint,
  version_created_at timestamptz,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  can_manage boolean,
  is_referenced boolean,
  reference_note text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_active_company_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  if not public.is_work_participant(p_work_id) then
    raise exception 'Voce nao possui acesso a esta obra.';
  end if;

  select p.active_company_id
  into v_active_company_id
  from public.profiles p
  where p.id = auth.uid();

  return query
  select
    d.id,
    d.environment_id,
    e.name as environment_name,
    d.owner_company_id,
    c.name as owner_company_name,
    d.title,
    d.description,
    d.category,
    d.visibility,
    d.allow_download,
    d.current_version,
    v.id as version_id,
    v.storage_path,
    v.file_name,
    v.mime_type,
    v.size_bytes,
    v.created_at as version_created_at,
    d.created_by,
    d.created_at,
    d.updated_at,
    public.can_manage_work_document(d.id) as can_manage,
    exists (
      select 1
      from public.work_document_references r
      where r.document_id = d.id
        and r.company_id = v_active_company_id
    ) as is_referenced,
    (
      select r.note
      from public.work_document_references r
      where r.document_id = d.id
        and r.company_id = v_active_company_id
      limit 1
    ) as reference_note
  from public.work_documents d
  left join public.environments e on e.id = d.environment_id
  left join public.companies c on c.id = d.owner_company_id
  left join lateral (
    select dv.*
    from public.work_document_versions dv
    where dv.document_id = d.id
    order by dv.version_number desc
    limit 1
  ) v on true
  where d.work_id = p_work_id
    and d.active = true
    and public.can_access_work_document(d.id)
  order by d.updated_at desc, d.created_at desc;
end;
$$;

revoke all on function public.get_work_documents(uuid) from public;
grant execute on function public.get_work_documents(uuid) to authenticated;


-- =========================================================
-- EVENTOS DE VERSAO
-- =========================================================

create or replace function public.log_work_document_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_document public.work_documents%rowtype;
begin
  select * into v_document
  from public.work_documents
  where id = new.document_id;

  insert into public.work_events (
    work_id,
    environment_id,
    event_type,
    title,
    description,
    actor_user_id,
    visibility,
    company_id,
    metadata
  ) values (
    v_document.work_id,
    v_document.environment_id,
    case
      when new.version_number = 1 then 'DOCUMENTO_ADICIONADO'
      else 'DOCUMENTO_NOVA_VERSAO'
    end,
    case
      when new.version_number = 1 then 'Documento adicionado'
      else 'Nova versao de documento'
    end,
    v_document.title,
    new.uploaded_by,
    case v_document.visibility
      when 'fio_general' then 'shared'
      when 'company_internal' then 'company'
      else 'internal'
    end,
    case
      when v_document.visibility = 'company_internal'
        then v_document.owner_company_id
      else null
    end,
    jsonb_build_object(
      'document_id', v_document.id,
      'version_id', new.id,
      'version_number', new.version_number,
      'file_name', new.file_name
    )
  );

  return new;
end;
$$;

drop trigger if exists work_document_version_event
on public.work_document_versions;

create trigger work_document_version_event
after insert on public.work_document_versions
for each row execute function public.log_work_document_version();


-- =========================================================
-- TIMELINE COM TERCEIRA CAMADA DE PRIVACIDADE
-- =========================================================

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
    coalesce(nullif(btrim(p.full_name), ''), 'Usuario do FIO')
      as actor_full_name,
    we.visibility,
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
    ) as photos
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

revoke select on public.work_events from public;
revoke select on public.work_events from anon, authenticated;

comment on table public.work_documents is
'Documento logico da obra. O arquivo atual e o historico ficam em work_document_versions.';

comment on table public.work_document_references is
'Atalho interno da empresa para um documento compartilhado, sem duplicar o arquivo.';
