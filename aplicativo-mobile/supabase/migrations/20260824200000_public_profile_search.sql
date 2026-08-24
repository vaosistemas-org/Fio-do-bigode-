begin;

create or replace function public.search_public_professional_profiles(p_search text)
returns table (
  user_id uuid,
  full_name text,
  job_title text,
  coverage_area text,
  avatar_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id,
    coalesce(nullif(btrim(p.full_name), ''), 'Profissional do FIO'),
    p.job_title,
    p.coverage_area,
    p.avatar_url
  from public.profiles p
  where p.professional_profile_enabled = true
    and char_length(btrim(coalesce(p_search, ''))) >= 2
    and (p.full_name ilike '%' || btrim(p_search) || '%'
      or p.job_title ilike '%' || btrim(p_search) || '%'
      or p.coverage_area ilike '%' || btrim(p_search) || '%')
  order by p.full_name
  limit 30;
$$;

revoke all on function public.search_public_professional_profiles(text) from public;
grant execute on function public.search_public_professional_profiles(text) to authenticated;

commit;
