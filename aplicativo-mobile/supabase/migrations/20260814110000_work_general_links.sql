-- =========================================================
-- FIO GERAL - LEITURA POR LINK OU QR CODE
-- =========================================================
--
-- A obra continua privada. O token concede somente leitura aos eventos
-- compartilhados e aos documentos marcados como fio_general.
-- =========================================================

create table if not exists public.work_general_links (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null
    references public.works(id)
    on delete cascade,
  token uuid not null default gen_random_uuid() unique,
  active boolean not null default true,
  expires_at timestamptz,
  created_by uuid not null
    references auth.users(id)
    on delete restrict,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  access_count bigint not null default 0,
  last_access_at timestamptz
);

create unique index if not exists work_general_links_one_active_idx
on public.work_general_links(work_id)
where active = true;

create index if not exists work_general_links_token_idx
on public.work_general_links(token)
where active = true;

alter table public.work_general_links enable row level security;

drop policy if exists work_general_links_manage
on public.work_general_links;
create policy work_general_links_manage
on public.work_general_links
for all to authenticated
using (public.can_manage_work(work_id))
with check (
  public.can_manage_work(work_id)
  and created_by = (select auth.uid())
);

create or replace function public.get_work_general_link(
  p_work_id uuid
)
returns table (
  id uuid,
  token uuid,
  active boolean,
  expires_at timestamptz,
  created_at timestamptz,
  access_count bigint,
  last_access_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.can_manage_work(p_work_id) then
    raise exception 'Voce nao pode administrar o link desta obra.';
  end if;

  return query
  select
    l.id,
    l.token,
    l.active,
    l.expires_at,
    l.created_at,
    l.access_count,
    l.last_access_at
  from public.work_general_links l
  where l.work_id = p_work_id
    and l.active = true
  limit 1;
end;
$$;

revoke all on function public.get_work_general_link(uuid) from public;
grant execute on function public.get_work_general_link(uuid) to authenticated;

create or replace function public.create_or_replace_work_general_link(
  p_work_id uuid,
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token uuid;
begin
  if auth.uid() is null or not public.can_manage_work(p_work_id) then
    raise exception 'Voce nao pode criar um link para esta obra.';
  end if;

  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'A validade precisa estar no futuro.';
  end if;

  update public.work_general_links
  set active = false, revoked_at = now()
  where work_id = p_work_id
    and active = true;

  insert into public.work_general_links (
    work_id,
    expires_at,
    created_by
  ) values (
    p_work_id,
    p_expires_at,
    auth.uid()
  )
  returning token into v_token;

  insert into public.work_events (
    work_id,
    event_type,
    title,
    description,
    actor_user_id,
    visibility,
    metadata
  ) values (
    p_work_id,
    'FIO_LINK_GERADO',
    'Link de leitura do FIO gerado',
    case
      when p_expires_at is null then 'Sem data de expiração.'
      else 'Link com validade definida.'
    end,
    auth.uid(),
    'internal',
    jsonb_build_object('expires_at', p_expires_at)
  );

  return v_token;
end;
$$;

revoke all on function public.create_or_replace_work_general_link(
  uuid, timestamptz
) from public;
grant execute on function public.create_or_replace_work_general_link(
  uuid, timestamptz
) to authenticated;

create or replace function public.revoke_work_general_link(
  p_work_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.can_manage_work(p_work_id) then
    raise exception 'Voce nao pode revogar o link desta obra.';
  end if;

  update public.work_general_links
  set active = false, revoked_at = now()
  where work_id = p_work_id
    and active = true;

  insert into public.work_events (
    work_id,
    event_type,
    title,
    actor_user_id,
    visibility
  ) values (
    p_work_id,
    'FIO_LINK_REVOGADO',
    'Link de leitura do FIO revogado',
    auth.uid(),
    'internal'
  );
end;
$$;

revoke all on function public.revoke_work_general_link(uuid) from public;
grant execute on function public.revoke_work_general_link(uuid) to authenticated;

create or replace function public.get_public_work_fio(
  p_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link public.work_general_links%rowtype;
  v_result jsonb;
begin
  select * into v_link
  from public.work_general_links l
  where l.token = p_token
    and l.active = true
    and (l.expires_at is null or l.expires_at > now());

  if v_link.id is null then
    raise exception 'Este link nao existe, expirou ou foi revogado.';
  end if;

  select jsonb_build_object(
    'work', jsonb_build_object(
      'code', w.code,
      'title', 'Obra ' || w.code,
      'status', w.status,
      'progress', w.progress,
      'updated_at', w.updated_at
    ),
    'events', coalesce(
      (
        select jsonb_agg(event_row order by event_row.created_at desc)
        from (
          select
            we.id,
            we.event_type,
            we.title,
            we.description,
            e.name as environment_name,
            coalesce(nullif(btrim(p.full_name), ''), 'Usuario do FIO')
              as actor_full_name,
            we.created_at,
            coalesce(
              (
                select jsonb_agg(
                  jsonb_build_object(
                    'id', wp.id,
                    'file_name', wp.file_name
                  ) order by wp.created_at
                )
                from public.work_photos wp
                where wp.work_id = we.work_id
                  and wp.visibility = 'shared'
                  and (
                    wp.diary_event_id = we.id
                    or wp.id::text = we.metadata ->> 'photo_id'
                  )
              ),
              '[]'::jsonb
            ) as photos
          from public.work_events we
          left join public.environments e on e.id = we.environment_id
          left join public.profiles p on p.id = we.actor_user_id
          where we.work_id = v_link.work_id
            and we.visibility = 'shared'
            and (
              coalesce(we.event_type, '') not like 'DOCUMENTO_%'
              or exists (
                select 1
                from public.work_documents d
                where d.id::text = we.metadata ->> 'document_id'
                  and d.active = true
                  and d.visibility = 'fio_general'
              )
            )
          order by we.created_at desc
          limit 300
        ) event_row
      ),
      '[]'::jsonb
    ),
    'documents', coalesce(
      (
        select jsonb_agg(document_row order by document_row.updated_at desc)
        from (
          select
            d.id,
            d.title,
            d.description,
            d.category,
            e.name as environment_name,
            d.allow_download,
            d.current_version,
            v.id as version_id,
            v.file_name,
            v.mime_type,
            v.size_bytes,
            d.updated_at
          from public.work_documents d
          left join public.environments e on e.id = d.environment_id
          left join lateral (
            select dv.*
            from public.work_document_versions dv
            where dv.document_id = d.id
            order by dv.version_number desc
            limit 1
          ) v on true
          where d.work_id = v_link.work_id
            and d.active = true
            and d.visibility = 'fio_general'
            and v.id is not null
        ) document_row
      ),
      '[]'::jsonb
    )
  ) into v_result
  from public.works w
  where w.id = v_link.work_id;

  update public.work_general_links
  set
    access_count = access_count + 1,
    last_access_at = now()
  where id = v_link.id;

  return v_result;
end;
$$;

revoke all on function public.get_public_work_fio(uuid) from public;
grant execute on function public.get_public_work_fio(uuid) to anon, authenticated;

revoke select on public.work_general_links from anon;
revoke select on public.work_documents from anon;
revoke select on public.work_document_versions from anon;
revoke select on public.work_events from anon;
revoke select on public.work_photos from anon;

comment on table public.work_general_links is
'Token revogavel para leitura externa do FIO geral. Nao torna a obra publica ou pesquisavel.';
