-- =========================================================
-- FIO
-- EQUIPE DA EMPRESA
-- =========================================================
--
-- Une:
-- 1. membros internos da empresa (company_members)
-- 2. colaboradores profissionais aprovados
--    (company_collaborators)
--
-- Se uma pessoa já for membro da empresa, ela não aparece
-- novamente como colaborador.
--
-- A listagem completa da equipe fica disponível somente
-- para quem administra o perfil profissional.
-- =========================================================

create or replace function public.get_company_team(
  p_company_id uuid
)
returns table (
  user_id uuid,
  full_name text,
  job_title text,
  avatar_url text,
  relationship_type text,
  company_role text,
  role_title text,
  status text,
  joined_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.can_manage_company_profile(
    p_company_id
  ) then
    raise exception
      'Você não possui permissão para visualizar a equipe desta empresa.';
  end if;

  return query

  select *
  from (

    -- =====================================================
    -- MEMBROS INTERNOS
    -- =====================================================

    select
      cm.user_id,

      coalesce(
        nullif(
          trim(p.full_name),
          ''
        ),
        'Usuário do FIO'
      ) as full_name,

      p.job_title,

      p.avatar_url,

      'member'::text
        as relationship_type,

      cm.role
        as company_role,

      null::text
        as role_title,

      'active'::text
        as status,

      cm.created_at
        as joined_at

    from public.company_members cm

    left join public.profiles p
      on p.id = cm.user_id

    where cm.company_id =
      p_company_id


    union all


    -- =====================================================
    -- COLABORADORES PROFISSIONAIS
    -- =====================================================

    select
      cc.user_id,

      coalesce(
        nullif(
          trim(p.full_name),
          ''
        ),
        'Usuário do FIO'
      ) as full_name,

      p.job_title,

      p.avatar_url,

      'collaborator'::text
        as relationship_type,

      null::text
        as company_role,

      cc.role_title,

      cc.status,

      coalesce(
        cc.reviewed_at,
        cc.requested_at
      ) as joined_at

    from public.company_collaborators cc

    left join public.profiles p
      on p.id = cc.user_id

    where cc.company_id =
      p_company_id

      and cc.status =
        'approved'

      and not exists (
        select 1
        from public.company_members cm
        where cm.company_id =
          cc.company_id
          and cm.user_id =
            cc.user_id
      )

  ) team

  order by
    case
      when team.company_role =
        'owner'
      then 0

      when team.relationship_type =
        'member'
      then 1

      else 2
    end,

    team.full_name;
end;
$$;


revoke all
on function public.get_company_team(uuid)
from public;


grant execute
on function public.get_company_team(uuid)
to authenticated;