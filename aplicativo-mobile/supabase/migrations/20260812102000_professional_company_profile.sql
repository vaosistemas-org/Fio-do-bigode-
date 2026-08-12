alter table public.companies
  add column if not exists logo_url text,
  add column if not exists business_type text,
  add column if not exists description text,

  add column if not exists phone text,
  add column if not exists whatsapp text,
  add column if not exists email text,
  add column if not exists website text,
  add column if not exists instagram text,

  add column if not exists address_line text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists postal_code text,
  add column if not exists country text default 'Brasil',

  add column if not exists coverage_area text,
  add column if not exists services text[] not null default '{}',

  add column if not exists is_active boolean not null default true,
  add column if not exists updated_by uuid;