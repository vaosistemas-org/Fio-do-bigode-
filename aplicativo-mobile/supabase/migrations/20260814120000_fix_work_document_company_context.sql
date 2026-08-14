-- =========================================================
-- FIO
-- AJUSTE DO CONTEXTO DA EMPRESA NOS DOCUMENTOS
-- =========================================================
--
-- A empresa ativa do profissional pode guardar documentos internos e
-- referências quando o próprio profissional já possui escrita na obra.
-- Não é necessário existir um segundo vínculo da empresa em
-- work_participants: o acesso à obra continua individual e fechado.
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

  if not public.can_write_work(v_work_id) then
    raise exception 'Voce nao possui permissao para referenciar este documento.';
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
