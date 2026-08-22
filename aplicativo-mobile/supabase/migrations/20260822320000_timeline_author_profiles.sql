begin;

-- Inclui a foto do autor em cada evento do FIO/Diario.
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
  actor_avatar_url text,
  visibility text,
  priority text,
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
    e.name,
    we.event_type,
    we.title,
    we.description,
    we.actor_user_id,
    coalesce(nullif(btrim(p.full_name), ''), 'Usuario do FIO'),
    p.avatar_url,
    we.visibility,
    we.priority,
    we.created_at,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', wp.id,
            'storage_path', wp.storage_path,
            'file_name', wp.file_name
          ) order by wp.created_at
        )
        from public.work_photos wp
        where wp.work_id = we.work_id
          and (wp.diary_event_id = we.id or wp.id::text = we.metadata ->> 'photo_id')
          and (v_can_write or wp.visibility = 'shared')
      ),
      '[]'::jsonb
    )
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

commit;
