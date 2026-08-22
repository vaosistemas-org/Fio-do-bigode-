-- Mantém o Meu FIO alinhado ao padrão de autoria do Diário:
-- avatar do autor e nome disponível para abrir o perfil público.
drop function if exists public.get_my_fio_feed(integer);

create or replace function public.get_my_fio_feed(
  p_limit integer default 60
)
returns table (
  id uuid,
  work_id uuid,
  work_code text,
  work_name text,
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
  target_section text,
  created_at timestamptz,
  photos jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    we.id,
    we.work_id,
    w.code,
    w.client_name,
    we.environment_id,
    e.name,
    we.event_type,
    we.title,
    we.description,
    we.actor_user_id,
    coalesce(nullif(btrim(p.full_name), ''), 'Usuario do FIO'),
    nullif(btrim(p.avatar_url), ''),
    we.visibility,
    we.priority,
    case
      when coalesce(we.event_type, '') like 'PENDENCIA_%' then 'pending'
      when coalesce(we.event_type, '') like 'FOTO_%' then 'photos'
      when coalesce(we.event_type, '') like 'DOCUMENTO_%' then 'documents'
      when coalesce(we.event_type, '') like '%AMBIENTE%' then 'environments'
      else 'fio'
    end,
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
          and (
            public.can_write_work(we.work_id)
            or wp.visibility = 'shared'
          )
      ),
      '[]'::jsonb
    )
  from public.work_events we
  join public.works w on w.id = we.work_id
  left join public.environments e on e.id = we.environment_id
  left join public.profiles p on p.id = we.actor_user_id
  where auth.uid() is not null
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
    and public.can_access_work_event(we.id)
  order by we.created_at desc
  limit least(greatest(coalesce(p_limit, 60), 1), 200);
$$;

revoke all on function public.get_my_fio_feed(integer) from public;
grant execute on function public.get_my_fio_feed(integer) to authenticated;
