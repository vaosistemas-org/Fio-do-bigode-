begin;

-- =========================================================
-- FIO - PERFIS PROFISSIONAIS PUBLICOS
-- =========================================================

create or replace function public.get_public_professional_profile(p_user_id uuid)
returns table (
  user_id uuid,
  full_name text,
  phone text,
  job_title text,
  coverage_area text,
  avatar_url text,
  professional_profile_enabled boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    coalesce(nullif(btrim(p.full_name), ''), 'Profissional do FIO'),
    p.phone,
    p.job_title,
    p.coverage_area,
    p.avatar_url,
    p.professional_profile_enabled
  from public.profiles p
  where p.id = p_user_id
    and p.professional_profile_enabled = true;
$$;

create or replace function public.get_public_professional_companies(p_user_id uuid)
returns table (
  company_id uuid,
  company_name text,
  role_title text,
  relationship_status text
)
language sql
stable
security definer
set search_path = public
as $$
  select distinct
    c.id,
    c.name,
    coalesce(cc.role_title, cm.role, 'Profissional') as role_title,
    case when cm.user_id is not null then 'Aprovado' else 'Aprovado' end
  from public.companies c
  left join public.company_members cm
    on cm.company_id = c.id
    and cm.user_id = p_user_id
    and cm.status = 'active'
  left join public.company_collaborators cc
    on cc.company_id = c.id
    and cc.user_id = p_user_id
    and cc.status = 'approved'
  where c.active = true
    and (cm.user_id is not null or cc.user_id is not null)
  order by c.name;
$$;

create or replace function public.get_public_professional_summary(p_user_id uuid)
returns table (
  active_works integer,
  companies integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (
      select count(*)::integer
      from public.work_participants wp
      join public.works w on w.id = wp.work_id
      where wp.user_id = p_user_id
        and wp.status = 'active'
        and wp.removed_at is null
        and w.archived_at is null
        and w.deleted_at is null
        and w.status <> 'finalizada'
    ),
    (
      select count(*)::integer
      from (
        select cm.company_id
        from public.company_members cm
        where cm.user_id = p_user_id and cm.status = 'active'
        union
        select cc.company_id
        from public.company_collaborators cc
        where cc.user_id = p_user_id and cc.status = 'approved'
      ) links
    );
$$;

revoke all on function public.get_public_professional_profile(uuid) from public;
revoke all on function public.get_public_professional_companies(uuid) from public;
revoke all on function public.get_public_professional_summary(uuid) from public;
grant execute on function public.get_public_professional_profile(uuid) to authenticated;
grant execute on function public.get_public_professional_companies(uuid) to authenticated;
grant execute on function public.get_public_professional_summary(uuid) to authenticated;

commit;
