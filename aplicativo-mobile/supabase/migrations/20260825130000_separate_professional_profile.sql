begin;

alter table public.profiles
  add column if not exists professional_name text,
  add column if not exists professional_phone text,
  add column if not exists professional_whatsapp text,
  add column if not exists professional_email text,
  add column if not exists professional_bio text,
  add column if not exists professional_avatar_url text,
  add column if not exists professional_cover_url text;

create or replace function public.save_my_professional_profile(p_professional_name text, p_professional_phone text, p_professional_whatsapp text, p_professional_email text, p_job_title text, p_coverage_area text, p_professional_bio text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Usuário não autenticado'; end if;
  insert into public.profiles (id, full_name, phone, professional_name, professional_phone, professional_whatsapp, professional_email, job_title, coverage_area, professional_bio)
  values (auth.uid(), '', '', nullif(btrim(p_professional_name), ''), nullif(btrim(p_professional_phone), ''), nullif(btrim(p_professional_whatsapp), ''), nullif(btrim(p_professional_email), ''), nullif(btrim(p_job_title), ''), nullif(btrim(p_coverage_area), ''), nullif(btrim(p_professional_bio), ''))
  on conflict (id) do update set professional_name=excluded.professional_name, professional_phone=excluded.professional_phone, professional_whatsapp=excluded.professional_whatsapp, professional_email=excluded.professional_email, job_title=excluded.job_title, coverage_area=excluded.coverage_area, professional_bio=excluded.professional_bio;
end; $$;

create or replace function public.set_my_professional_avatar(p_avatar_url text) returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Usuário não autenticado'; end if;
  insert into public.profiles (id, full_name, phone, professional_avatar_url) values (auth.uid(), '', '', p_avatar_url)
  on conflict (id) do update set professional_avatar_url=excluded.professional_avatar_url;
end; $$;

create or replace function public.set_my_professional_cover(p_cover_url text) returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Usuário não autenticado'; end if;
  insert into public.profiles (id, full_name, phone, professional_cover_url) values (auth.uid(), '', '', p_cover_url)
  on conflict (id) do update set professional_cover_url=excluded.professional_cover_url;
end; $$;

revoke all on function public.save_my_professional_profile(text,text,text,text,text,text,text) from public;
revoke all on function public.set_my_professional_avatar(text) from public;
revoke all on function public.set_my_professional_cover(text) from public;
grant execute on function public.save_my_professional_profile(text,text,text,text,text,text,text) to authenticated;
grant execute on function public.set_my_professional_avatar(text) to authenticated;
grant execute on function public.set_my_professional_cover(text) to authenticated;

drop function if exists public.get_public_professional_profile(uuid);
create function public.get_public_professional_profile(p_user_id uuid)
returns table (user_id uuid, full_name text, phone text, whatsapp text, email text, bio text, job_title text, coverage_area text, avatar_url text, cover_url text, professional_profile_enabled boolean)
language sql stable security definer set search_path = public as $$
  select p.id, coalesce(nullif(btrim(p.professional_name), ''), 'Profissional do FIO'), p.professional_phone, p.professional_whatsapp, p.professional_email, p.professional_bio, p.job_title, p.coverage_area, p.professional_avatar_url, p.professional_cover_url, p.professional_profile_enabled
  from public.profiles p where p.id=p_user_id and p.professional_profile_enabled=true;
$$;
grant execute on function public.get_public_professional_profile(uuid) to authenticated;

create or replace function public.search_fio_global(p_search text)
returns table (result_type text, result_id uuid, title text, subtitle text, image_url text)
language sql stable security definer set search_path = public as $$
  with q as (select '%' || btrim(coalesce(p_search, '')) || '%' as term)
  select 'person', p.id, coalesce(nullif(btrim(p.professional_name), ''), nullif(btrim(p.full_name), ''), 'Profissional do FIO'), coalesce(p.job_title, 'Perfil profissional'), coalesce(p.professional_avatar_url, p.avatar_url)
  from profiles p, q where p.professional_profile_enabled=true and char_length(btrim(coalesce(p_search, '')))>=2 and (coalesce(p.professional_name, p.full_name) ilike q.term or p.job_title ilike q.term or p.coverage_area ilike q.term)
  union all select 'company', c.id, c.name, coalesce(c.business_type, 'Empresa do FIO'), null from companies c, q where c.active=true and char_length(btrim(coalesce(p_search, '')))>=2 and c.name ilike q.term
  union all select 'work', w.id, coalesce(w.client_name, w.code), coalesce(w.code, 'Obra do FIO'), null::text from works w, q where is_work_participant(w.id) and w.archived_at is null and w.deleted_at is null and char_length(btrim(coalesce(p_search, '')))>=2 and (w.code ilike q.term or w.client_name ilike q.term)
  limit 60;
$$;
revoke all on function public.search_fio_global(text) from public;
grant execute on function public.search_fio_global(text) to authenticated;

commit;
