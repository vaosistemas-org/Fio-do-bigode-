-- =========================================================
-- FIO
-- ADMINISTRADORES DA EMPRESA
-- =========================================================
--
-- company_members passa a preservar o histórico:
--
-- active  = membro interno ativo
-- removed = membro interno removido
--
-- Proprietário permanece protegido.
-- Somente proprietário promove/remove administradores.
-- =========================================================


-- =========================================================
-- CICLO DE VIDA DOS MEMBROS INTERNOS
-- =========================================================

alter table public.company_members
  add column if not exists status text
    not null
    default 'active',

  add column if not exists updated_at timestamptz
    not null
    default now(),

  add column if not exists removed_at timestamptz,

  add column if not exists updated_by uuid
    references auth.users(id);


alter table public.company_members
  drop constraint if exists
    company_members_status_check;


alter table public.company_members
  add constraint
    company_members_status_check
  check (
    status in (
      'active',
      'removed'
    )
  );


-- Registros existentes são membros ativos.

update public.company_members
set status = 'active'
where status is null;


-- =========================================================
-- QUEM PODE ADMINISTRAR A EMPRESA
-- =========================================================

create or replace function public.can_manage_company_profile(
  p_company_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.company_members cm
    where cm.company_id = p_company_id
      and cm.user_id = auth.uid()
      and cm.role in (
        'owner',
        'admin'
      )
      and cm.status = 'active'
  );
$$;


revoke all
on function public.can_manage_company_profile(uuid)
from public;


grant execute
on function public.can_manage_company_profile(uuid)
to authenticated;


-- =========================================================
-- USUARIO POSSUI ALGUMA EMPRESA QUE ADMINISTRA
-- =========================================================

create or replace function public.has_admin_company()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.company_members cm
    where cm.user_id = auth.uid()
      and cm.role in (
        'owner',
        'admin'
      )
      and cm.status = 'active'
  );
$$;


revoke all
on function public.has_admin_company()
from public;


grant execute
on function public.has_admin_company()
to authenticated;


-- =========================================================
-- MINHAS EMPRESAS
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
    cm.company_id,
    c.name as company_name,
    cm.role,
    c.active

  from public.company_members cm

  join public.companies c
    on c.id = cm.company_id

  where cm.user_id = auth.uid()
    and cm.status = 'active'

  order by
    case cm.role
      when 'owner' then 0
      when 'admin' then 1
      else 2
    end,
    c.name;
$$;


revoke all
on function public.get_my_companies()
from public;


grant execute
on function public.get_my_companies()
to authenticated;


-- =========================================================
-- EQUIPE DA EMPRESA
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

    -- MEMBROS INTERNOS ATIVOS

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

      cm.status,

      cm.created_at
        as joined_at

    from public.company_members cm

    left join public.profiles p
      on p.id = cm.user_id

    where cm.company_id =
      p_company_id

      and cm.status =
        'active'


    union all


    -- COLABORADORES PROFISSIONAIS ATIVOS

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

          and cm.status =
            'active'
      )

  ) team

  order by
    case
      when team.company_role =
        'owner'
      then 0

      when team.company_role =
        'admin'
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


-- =========================================================
-- PROMOVER COLABORADOR A ADMINISTRADOR
-- =========================================================

create or replace function public.promote_company_collaborator_to_admin(
  p_company_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requester_id uuid;
  v_requester_role text;
  v_existing_member_id uuid;
  v_existing_member_role text;
begin
  v_requester_id := auth.uid();

  if v_requester_id is null then
    raise exception
      'Usuário não autenticado.';
  end if;


  select cm.role
  into v_requester_role
  from public.company_members cm
  where cm.company_id =
    p_company_id

    and cm.user_id =
      v_requester_id

    and cm.status =
      'active';


  if v_requester_role is distinct from
    'owner'
  then
    raise exception
      'Somente o proprietário pode adicionar administradores.';
  end if;


  if p_user_id =
    v_requester_id
  then
    raise exception
      'O proprietário já administra esta empresa.';
  end if;


  if not exists (
    select 1
    from public.company_collaborators cc
    where cc.company_id =
      p_company_id

      and cc.user_id =
        p_user_id

      and cc.status =
        'approved'
  ) then
    raise exception
      'O profissional precisa possuir vínculo ativo com a empresa antes de se tornar administrador.';
  end if;


  select
    cm.id,
    cm.role
  into
    v_existing_member_id,
    v_existing_member_role

  from public.company_members cm

  where cm.company_id =
    p_company_id

    and cm.user_id =
      p_user_id

  limit 1;


  if
    v_existing_member_role =
      'owner'
  then
    raise exception
      'O proprietário não pode ser alterado.';
  end if;


  if v_existing_member_id is null then

    insert into public.company_members (
      company_id,
      user_id,
      role,
      status,
      updated_at,
      updated_by
    )
    values (
      p_company_id,
      p_user_id,
      'admin',
      'active',
      now(),
      v_requester_id
    );

  else

    update public.company_members
    set
      role = 'admin',
      status = 'active',
      removed_at = null,
      updated_at = now(),
      updated_by =
        v_requester_id
    where id =
      v_existing_member_id;

  end if;


  -- O vínculo profissional antigo continua no histórico,
  -- mas deixa de ser a relação atual com a empresa.

  update public.company_collaborators
  set
    status = 'cancelled',
    reviewed_at = now(),
    reviewed_by =
      v_requester_id,
    updated_at = now()
  where company_id =
    p_company_id

    and user_id =
      p_user_id

    and status =
      'approved';


  return true;
end;
$$;


revoke all
on function public.promote_company_collaborator_to_admin(
  uuid,
  uuid
)
from public;


grant execute
on function public.promote_company_collaborator_to_admin(
  uuid,
  uuid
)
to authenticated;


-- =========================================================
-- REMOVER ADMINISTRADOR
-- =========================================================

create or replace function public.remove_company_admin(
  p_company_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requester_id uuid;
  v_requester_role text;
begin
  v_requester_id := auth.uid();


  if v_requester_id is null then
    raise exception
      'Usuário não autenticado.';
  end if;


  select cm.role
  into v_requester_role
  from public.company_members cm
  where cm.company_id =
    p_company_id

    and cm.user_id =
      v_requester_id

    and cm.status =
      'active';


  if v_requester_role is distinct from
    'owner'
  then
    raise exception
      'Somente o proprietário pode remover administradores.';
  end if;


  if p_user_id =
    v_requester_id
  then
    raise exception
      'O proprietário não pode remover a si próprio.';
  end if;


  update public.company_members
  set
    status = 'removed',
    removed_at = now(),
    updated_at = now(),
    updated_by =
      v_requester_id

  where company_id =
    p_company_id

    and user_id =
      p_user_id

    and role =
      'admin'

    and status =
      'active';


  if not found then
    raise exception
      'Administrador ativo não encontrado.';
  end if;


  return true;
end;
$$;


revoke all
on function public.remove_company_admin(
  uuid,
  uuid
)
from public;


grant execute
on function public.remove_company_admin(
  uuid,
  uuid
)
to authenticated;