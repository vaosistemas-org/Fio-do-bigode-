drop function if exists public.get_public_professional_profile(uuid);

create function public.get_public_professional_profile(p_user_id uuid)
returns table (user_id uuid, full_name text, phone text, job_title text, coverage_area text, avatar_url text, cover_url text, professional_profile_enabled boolean)
language sql stable security definer set search_path = public
as $$
  select p.id, coalesce(nullif(btrim(p.full_name), ''), 'Profissional do FIO'), p.phone, p.job_title, p.coverage_area, p.avatar_url, p.cover_url, p.professional_profile_enabled
  from public.profiles p where p.id = p_user_id and p.professional_profile_enabled = true;
$$;

grant execute on function public.get_public_professional_profile(uuid) to authenticated;
