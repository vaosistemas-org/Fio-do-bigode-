begin;

-- =========================================================
-- FIO - NOTIFICACOES ACIONAVEIS
-- =========================================================
-- Entrega ao aplicativo o destino exato do evento e as acoes
-- permitidas para o perfil atual, sem revelar conteudo restrito.

create or replace function public.can_access_work_event(
  p_event_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.work_events we
    where we.id = p_event_id
      and public.is_work_participant(we.work_id)
      and (
        we.visibility = 'shared'
        or (
          we.visibility = 'internal'
          and public.can_write_work(we.work_id)
        )
        or (
          we.visibility = 'company'
          and public.can_write_work(we.work_id)
          and we.company_id is not null
          and public.can_use_company_context(we.company_id)
        )
      )
      and (
        coalesce(we.event_type, '') not like 'DOCUMENTO_%'
        or exists (
          select 1
          from public.work_documents d
          where d.id::text = we.metadata ->> 'document_id'
            and public.can_access_work_document(d.id)
        )
      )
  );
$$;

revoke all on function public.can_access_work_event(uuid) from public;
grant execute on function public.can_access_work_event(uuid) to authenticated;

drop function if exists public.get_my_notifications();

create function public.get_my_notifications()
returns table (
  id uuid,
  work_id uuid,
  event_id uuid,
  event_type text,
  entity_type text,
  entity_id text,
  target_section text,
  title text,
  description text,
  read_at timestamptz,
  created_at timestamptz,
  can_confirm_visit boolean,
  can_edit_visit boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    n.id,
    n.work_id,
    n.event_id,
    we.event_type,
    case
      when coalesce(we.event_type, '') like 'DOCUMENTO_%' then 'document'
      when coalesce(we.event_type, '') like 'VISITA_%' then 'visit'
      when coalesce(we.event_type, '') like 'PENDENCIA_%' then 'pending'
      else 'work'
    end,
    case
      when coalesce(we.event_type, '') like 'DOCUMENTO_%'
        then we.metadata ->> 'document_id'
      when coalesce(we.event_type, '') like 'VISITA_%'
        then we.metadata ->> 'visit_id'
      when coalesce(we.event_type, '') like 'PENDENCIA_%'
        then we.metadata ->> 'pending_item_id'
      else null
    end,
    case
      when coalesce(we.event_type, '') like 'DOCUMENTO_%'
        and d.category = 'project' then 'projects'
      when coalesce(we.event_type, '') like 'DOCUMENTO_%'
        and d.category = 'measurement' then 'measurements'
      when coalesce(we.event_type, '') like 'DOCUMENTO_%' then 'documents'
      when coalesce(we.event_type, '') like 'PENDENCIA_%' then 'pending'
      when coalesce(we.event_type, '') like 'FOTO_%' then 'photos'
      when coalesce(we.event_type, '') like '%AMBIENTE%' then 'environments'
      else 'fio'
    end,
    n.title,
    n.description,
    n.read_at,
    n.created_at,
    coalesce(
      v.status in ('scheduled', 'rescheduled')
      and (
        public.can_manage_work(v.work_id)
        or (
          v.responsible_user_id = auth.uid()
          and public.can_write_work(v.work_id)
        )
      ),
      false
    ),
    coalesce(
      v.status in ('scheduled', 'confirmed', 'rescheduled')
      and (
        public.can_manage_work(v.work_id)
        or (
          v.responsible_user_id = auth.uid()
          and public.can_write_work(v.work_id)
        )
      ),
      false
    )
  from public.fio_notifications n
  join public.work_events we on we.id = n.event_id
  left join public.work_documents d
    on d.id::text = we.metadata ->> 'document_id'
  left join public.work_visits v
    on v.id::text = we.metadata ->> 'visit_id'
  where n.user_id = auth.uid()
    and public.can_access_work_event(n.event_id)
  order by n.created_at desc
  limit 50;
$$;

revoke all on function public.get_my_notifications() from public;
grant execute on function public.get_my_notifications() to authenticated;

commit;
