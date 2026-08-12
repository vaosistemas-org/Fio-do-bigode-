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
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.work_participants wp
    where wp.work_id = p_work_id
      and wp.user_id = auth.uid()
      and wp.status = 'active'
      and wp.removed_at is null
  ) then
    raise exception 'Você não possui acesso a esta obra.';
  end if;

  return query
  select
    wp.id as participant_id,
    wp.user_id,
    coalesce(
      nullif(trim(p.full_name), ''),
      'Participante'
    ) as full_name,
    wp.role_title,
    p.job_title,
    wp.access_level,
    wp.company_id
  from public.work_participants wp
  left join public.profiles p
    on p.id = wp.user_id
  where wp.work_id = p_work_id
    and wp.status = 'active'
    and wp.removed_at is null
  order by
    coalesce(
      nullif(trim(p.full_name), ''),
      'Participante'
    );
end;
$$;

revoke all
on function public.get_work_participants_for_assignment(uuid)
from public;

grant execute
on function public.get_work_participants_for_assignment(uuid)
to authenticated;