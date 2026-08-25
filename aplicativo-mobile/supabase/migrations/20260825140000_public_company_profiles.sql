begin;

alter table public.companies add column if not exists cover_url text;

create or replace function public.get_company_public_media(p_company_id uuid)
returns table (logo_url text, cover_url text)
language sql stable security definer set search_path=public as $$
  select c.logo_path, c.cover_url from public.companies c
  where c.id=p_company_id and (c.active=true or public.can_manage_company_profile(c.id));
$$;

create or replace function public.set_company_public_image(p_company_id uuid, p_image_kind text, p_image_url text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.can_manage_company_profile(p_company_id) then raise exception 'Você não possui permissão para editar esta empresa.'; end if;
  if p_image_kind='logo' then update public.companies set logo_path=nullif(btrim(p_image_url),''), updated_by=auth.uid() where id=p_company_id;
  elsif p_image_kind='cover' then update public.companies set cover_url=nullif(btrim(p_image_url),''), updated_by=auth.uid() where id=p_company_id;
  else raise exception 'Tipo de imagem inválido.';
  end if;
end; $$;

create or replace function public.get_public_company_profile(p_company_id uuid)
returns table (id uuid, name text, business_type text, description text, logo_path text, cover_url text, phone text, whatsapp text, email text, website text, instagram text, city text, state text, coverage_area text, services text[], can_manage boolean)
language sql stable security definer set search_path=public as $$
  select c.id,c.name,c.business_type,c.description,c.logo_path,c.cover_url,c.phone,c.whatsapp,c.email,c.website,c.instagram,c.city,c.state,c.coverage_area,c.services,public.can_manage_company_profile(c.id)
  from public.companies c where c.id=p_company_id and c.active=true;
$$;

create or replace function public.get_public_company_team(p_company_id uuid)
returns table (user_id uuid, display_name text, job_title text, avatar_url text, role_title text)
language sql stable security definer set search_path=public as $$
  select p.id, coalesce(nullif(btrim(p.professional_name),''),nullif(btrim(p.full_name),''),'Profissional do FIO'), p.job_title,
    coalesce(p.professional_avatar_url,p.avatar_url), cm.role::text
  from public.company_members cm join public.profiles p on p.id=cm.user_id join public.companies c on c.id=cm.company_id
  where cm.company_id=p_company_id and cm.status='active' and c.active=true and p.professional_profile_enabled=true
  order by case when cm.role='owner' then 0 else 1 end, display_name;
$$;

revoke all on function public.get_company_public_media(uuid) from public;
revoke all on function public.set_company_public_image(uuid,text,text) from public;
revoke all on function public.get_public_company_profile(uuid) from public;
revoke all on function public.get_public_company_team(uuid) from public;
grant execute on function public.get_company_public_media(uuid) to authenticated;
grant execute on function public.set_company_public_image(uuid,text,text) to authenticated;
grant execute on function public.get_public_company_profile(uuid) to authenticated;
grant execute on function public.get_public_company_team(uuid) to authenticated;

create or replace function public.search_fio_global(p_search text)
returns table (result_type text, result_id uuid, title text, subtitle text, image_url text)
language sql stable security definer set search_path=public as $$
  with q as (select '%'||btrim(coalesce(p_search,''))||'%' term)
  select 'person',p.id,coalesce(nullif(btrim(p.professional_name),''),nullif(btrim(p.full_name),''),'Profissional do FIO'),coalesce(p.job_title,'Perfil profissional'),coalesce(p.professional_avatar_url,p.avatar_url)
  from profiles p,q where p.professional_profile_enabled=true and char_length(btrim(coalesce(p_search,'')))>=2 and (coalesce(p.professional_name,p.full_name) ilike q.term or p.job_title ilike q.term or p.coverage_area ilike q.term)
  union all select 'company',c.id,c.name,coalesce(c.business_type,'Empresa do FIO'),c.logo_path from companies c,q where c.active=true and char_length(btrim(coalesce(p_search,'')))>=2 and c.name ilike q.term
  union all select 'work',w.id,coalesce(w.client_name,w.code),coalesce(w.code,'Obra do FIO'),null::text from works w,q where is_work_participant(w.id) and w.archived_at is null and w.deleted_at is null and char_length(btrim(coalesce(p_search,'')))>=2 and (w.code ilike q.term or w.client_name ilike q.term)
  limit 60;
$$;

commit;
