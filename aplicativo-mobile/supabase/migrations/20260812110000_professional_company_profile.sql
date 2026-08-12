-- =========================================================
-- FIO
-- PERFIL PROFISSIONAL / EMPRESA
-- =========================================================

alter table public.companies
  add column if not exists legal_name text,
  add column if not exists business_type text,
  add column if not exists description text,
  add column if not exists logo_path text,
  add column if not exists phone text,
  add column if not exists whatsapp text,
  add column if not exists email text,
  add column if not exists website text,
  add column if not exists instagram text,
  add column if not exists address_line text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists postal_code text,
  add column if not exists coverage_area text,
  add column if not exists services text[] not null default '{}',
  add column if not exists active boolean not null default true,
  add column if not exists updated_by uuid references auth.users(id);


-- =========================================================
-- PERMISSÃO PARA ADMINISTRAR O PERFIL
--
-- Nesta primeira versão:
-- owner pode editar.
--
-- Futuramente podemos incluir admin sem alterar
-- a estrutura do perfil profissional.
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
      and cm.role = 'owner'
  );
$$;


revoke all
on function public.can_manage_company_profile(uuid)
from public;

grant execute
on function public.can_manage_company_profile(uuid)
to authenticated;


-- =========================================================
-- BUSCAR PERFIL PROFISSIONAL
-- =========================================================

create or replace function public.get_company_profile(
  p_company_id uuid
)
returns table (
  id uuid,
  name text,
  legal_name text,
  business_type text,
  description text,
  logo_path text,
  phone text,
  whatsapp text,
  email text,
  website text,
  instagram text,
  address_line text,
  city text,
  state text,
  postal_code text,
  coverage_area text,
  services text[],
  active boolean,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  updated_by uuid,
  can_manage boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.company_members cm
    where cm.company_id = p_company_id
      and cm.user_id = auth.uid()
  )
  and not exists (
    select 1
    from public.company_collaborators cc
    where cc.company_id = p_company_id
      and cc.user_id = auth.uid()
      and cc.status = 'approved'
  ) then
    raise exception 'Você não possui acesso a esta empresa.';
  end if;

  return query
  select
    c.id,
    c.name,
    c.legal_name,
    c.business_type,
    c.description,
    c.logo_path,
    c.phone,
    c.whatsapp,
    c.email,
    c.website,
    c.instagram,
    c.address_line,
    c.city,
    c.state,
    c.postal_code,
    c.coverage_area,
    c.services,
    c.active,
    c.created_by,
    c.created_at,
    c.updated_at,
    c.updated_by,
    public.can_manage_company_profile(c.id)
  from public.companies c
  where c.id = p_company_id;
end;
$$;


revoke all
on function public.get_company_profile(uuid)
from public;

grant execute
on function public.get_company_profile(uuid)
to authenticated;


-- =========================================================
-- ATUALIZAR PERFIL PROFISSIONAL
-- =========================================================

create or replace function public.update_company_profile(
  p_company_id uuid,
  p_name text,
  p_legal_name text default null,
  p_business_type text default null,
  p_description text default null,
  p_logo_path text default null,
  p_phone text default null,
  p_whatsapp text default null,
  p_email text default null,
  p_website text default null,
  p_instagram text default null,
  p_address_line text default null,
  p_city text default null,
  p_state text default null,
  p_postal_code text default null,
  p_coverage_area text default null,
  p_services text[] default '{}',
  p_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if not public.can_manage_company_profile(
    p_company_id
  ) then
    raise exception
      'Você não possui permissão para editar esta empresa.';
  end if;

  v_name := nullif(
    trim(p_name),
    ''
  );

  if v_name is null then
    raise exception
      'O nome da empresa é obrigatório.';
  end if;

  update public.companies
  set
    name = v_name,

    legal_name =
      nullif(
        trim(p_legal_name),
        ''
      ),

    business_type =
      nullif(
        trim(p_business_type),
        ''
      ),

    description =
      nullif(
        trim(p_description),
        ''
      ),

    logo_path =
      nullif(
        trim(p_logo_path),
        ''
      ),

    phone =
      nullif(
        trim(p_phone),
        ''
      ),

    whatsapp =
      nullif(
        trim(p_whatsapp),
        ''
      ),

    email =
      nullif(
        trim(p_email),
        ''
      ),

    website =
      nullif(
        trim(p_website),
        ''
      ),

    instagram =
      nullif(
        trim(p_instagram),
        ''
      ),

    address_line =
      nullif(
        trim(p_address_line),
        ''
      ),

    city =
      nullif(
        trim(p_city),
        ''
      ),

    state =
      nullif(
        trim(p_state),
        ''
      ),

    postal_code =
      nullif(
        trim(p_postal_code),
        ''
      ),

    coverage_area =
      nullif(
        trim(p_coverage_area),
        ''
      ),

    services =
      coalesce(
        p_services,
        '{}'
      ),

    active =
      coalesce(
        p_active,
        true
      ),

    updated_by =
      auth.uid(),

    updated_at =
      now()

  where id =
    p_company_id;

  if not found then
    raise exception
      'Empresa não encontrada.';
  end if;

  return p_company_id;
end;
$$;


revoke all
on function public.update_company_profile(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text[],
  boolean
)
from public;

grant execute
on function public.update_company_profile(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text[],
  boolean
)
to authenticated;