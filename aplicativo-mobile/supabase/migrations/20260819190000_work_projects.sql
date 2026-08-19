-- =========================================================
-- FIO - PROJETO VIGENTE DA OBRA
-- =========================================================
--
-- Projeto continua sendo um documento: usa o mesmo arquivo, versões,
-- permissões, histórico e armazenamento. A confirmação define qual
-- versão é a vigente, sem apagar as anteriores.
-- =========================================================


alter table public.work_documents
drop constraint if exists work_documents_category_check;

alter table public.work_documents
add constraint work_documents_category_check
check (
  category in (
    'project',
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
);

alter table public.work_documents
add column if not exists is_current_project boolean not null default false;

alter table public.work_documents
add column if not exists approved_version integer;

alter table public.work_documents
add column if not exists project_approved_by uuid
references auth.users(id)
on delete set null;

alter table public.work_documents
add column if not exists project_approved_at timestamptz;

alter table public.work_documents
drop constraint if exists work_documents_project_state_check;

alter table public.work_documents
add constraint work_documents_project_state_check
check (
  (
    category = 'project'
    and (approved_version is null or approved_version > 0)
  )
  or (
    category <> 'project'
    and is_current_project = false
    and approved_version is null
    and project_approved_by is null
    and project_approved_at is null
  )
);

create unique index if not exists work_documents_one_current_project_idx
on public.work_documents(work_id)
where active = true
  and category = 'project'
  and is_current_project = true;


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
    'project',
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

  if v_company_id is not null
    and not public.can_use_company_context(v_company_id)
  then
    raise exception 'Voce nao possui vinculo ativo com a empresa informada.';
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
  v_old_category text;
  v_title text;
begin
  if auth.uid() is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  if not public.can_manage_work_document(p_document_id) then
    raise exception 'Voce nao pode editar este documento.';
  end if;

  select d.work_id, d.owner_company_id, d.visibility, d.category
  into v_work_id, v_company_id, v_old_visibility, v_old_category
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
    'project',
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

  if v_old_category = 'project' and p_category <> 'project' then
    raise exception 'Um projeto deve continuar na categoria Projeto.';
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


create or replace function public.set_current_work_project(
  p_document_id uuid,
  p_version_number integer default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_document public.work_documents%rowtype;
  v_version integer;
begin
  if auth.uid() is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  select d.*
  into v_document
  from public.work_documents d
  where d.id = p_document_id
    and d.active = true
    and d.category = 'project'
    and public.can_access_work_document(d.id)
  for update;

  if v_document.id is null then
    raise exception 'Projeto nao encontrado ou sem acesso.';
  end if;

  if not public.can_manage_work(v_document.work_id) then
    raise exception 'Somente proprietario ou gestor pode definir o projeto vigente.';
  end if;

  v_version := coalesce(p_version_number, v_document.current_version);
  if v_version < 1
    or not exists (
      select 1
      from public.work_document_versions dv
      where dv.document_id = p_document_id
        and dv.version_number = v_version
    )
  then
    raise exception 'Versao do projeto invalida.';
  end if;

  update public.work_documents
  set is_current_project = false
  where work_id = v_document.work_id
    and category = 'project'
    and is_current_project = true;

  update public.work_documents
  set
    is_current_project = true,
    approved_version = v_version,
    project_approved_by = auth.uid(),
    project_approved_at = now(),
    updated_by = auth.uid(),
    updated_at = now()
  where id = p_document_id;

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
    'DOCUMENTO_PROJETO_VIGENTE',
    'Projeto vigente confirmado',
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
    jsonb_build_object(
      'document_id', p_document_id,
      'version_number', v_version,
      'project_status', 'current'
    )
  );
end;
$$;

revoke all on function public.set_current_work_project(uuid, integer)
from public;
grant execute on function public.set_current_work_project(uuid, integer)
to authenticated;


comment on column public.work_documents.is_current_project is
'Indica o unico projeto atualmente vigente na obra.';

comment on column public.work_documents.approved_version is
'Versao confirmada como vigente pelo proprietario ou gestor da obra.';
