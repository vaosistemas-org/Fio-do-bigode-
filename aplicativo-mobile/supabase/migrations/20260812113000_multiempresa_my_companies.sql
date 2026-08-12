-- =========================================================
-- FIO
-- MULTIEMPRESA
-- MINHAS EMPRESAS + MEUS VÍNCULOS PROFISSIONAIS
-- =========================================================


-- =========================================================
-- MINHAS EMPRESAS
--
-- Empresas das quais o usuário faz parte através de
-- company_members.
-- =========================================================

create or replace function public.get_my_companies()
returns table (
  membership_id uuid,
  company_id uuid,
  company_name text,
  role text,
  active boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    cm.id as membership_id,
    c.id as company_id,
    c.name as company_name,
    cm.role,
    c.active
  from public.company_members cm
  join public.companies c
    on c.id = cm.company_id
  where cm.user_id = auth.uid()
  order by c.name;
$$;


revoke all
on function public.get_my_companies()
from public;

grant execute
on function public.get_my_companies()
to authenticated;


-- =========================================================
-- MEUS VÍNCULOS PROFISSIONAIS
--
-- Mostra vínculos de colaboração do usuário.
--
-- Se o usuário já for membro da empresa através de
-- company_members, a empresa não aparece novamente aqui.
-- Isso evita duplicação entre:
--
-- MINHAS EMPRESAS
-- e
-- MEUS VÍNCULOS.
-- =========================================================

create or replace function public.get_my_professional_links()
returns table (
  link_id uuid,
  company_id uuid,
  company_name text,
  role_title text,
  status text,
  requested_at timestamptz,
  reviewed_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    cc.id as link_id,
    c.id as company_id,
    c.name as company_name,
    cc.role_title,
    cc.status,
    cc.requested_at,
    cc.reviewed_at
  from public.company_collaborators cc
  join public.companies c
    on c.id = cc.company_id
  where cc.user_id = auth.uid()

    and not exists (
      select 1
      from public.company_members cm
      where cm.company_id = cc.company_id
        and cm.user_id = auth.uid()
    )

  order by c.name;
$$;


revoke all
on function public.get_my_professional_links()
from public;

grant execute
on function public.get_my_professional_links()
to authenticated;