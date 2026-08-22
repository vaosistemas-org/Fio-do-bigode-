begin;

-- =========================================================
-- FIO - RELATORIOS EMITIDOS IMUTAVEIS
-- =========================================================
-- Um relatorio que ja possui PDF nao pode ter titulo, permissao,
-- categoria ou estado alterados. O arquivo original permanece no
-- historico. Somente proprietario ou gestor pode acrescentar uma
-- nova versao ao mesmo relatorio.

create or replace function public.protect_emitted_work_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.category = 'report'
    and old.current_version > 0
    and (
      new.work_id is distinct from old.work_id
      or new.environment_id is distinct from old.environment_id
      or new.owner_company_id is distinct from old.owner_company_id
      or new.title is distinct from old.title
      or new.description is distinct from old.description
      or new.category is distinct from old.category
      or new.visibility is distinct from old.visibility
      or new.allow_download is distinct from old.allow_download
      or new.active is distinct from old.active
      or new.archived_at is distinct from old.archived_at
    )
  then
    raise exception 'Relatorio emitido nao pode ser alterado. Gere uma nova versao.';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_emitted_work_report_trigger
on public.work_documents;

create trigger protect_emitted_work_report_trigger
before update on public.work_documents
for each row execute function public.protect_emitted_work_report();


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
  v_document public.work_documents%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  select * into v_document
  from public.work_documents d
  where d.id = p_document_id
    and d.active = true
  for update;

  if v_document.id is null then
    raise exception 'Documento nao encontrado.';
  end if;

  if not public.can_manage_work_document(p_document_id) then
    raise exception 'Voce nao pode enviar versoes para este documento.';
  end if;

  if v_document.category = 'report'
    and v_document.current_version > 0
    and not public.can_manage_work(v_document.work_id)
  then
    raise exception 'Somente proprietario ou gestor pode gerar uma nova versao do relatorio.';
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

commit;
