begin;

-- Salva o perfil pessoal mesmo quando a conta ainda não possui uma linha em profiles.
create or replace function public.save_my_profile(
  p_full_name text,
  p_phone text,
  p_job_title text default null,
  p_coverage_area text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  insert into public.profiles (id, full_name, phone, job_title, coverage_area)
  values (
    auth.uid(),
    coalesce(nullif(btrim(p_full_name), ''), ''),
    coalesce(nullif(btrim(p_phone), ''), ''),
    nullif(btrim(p_job_title), ''),
    nullif(btrim(p_coverage_area), '')
  )
  on conflict (id) do update set
    full_name = excluded.full_name,
    phone = excluded.phone,
    job_title = excluded.job_title,
    coverage_area = excluded.coverage_area;
end;
$$;

create or replace function public.set_my_profile_avatar(p_avatar_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  insert into public.profiles (id, full_name, phone, avatar_url)
  values (auth.uid(), '', '', nullif(btrim(p_avatar_url), ''))
  on conflict (id) do update set
    avatar_url = excluded.avatar_url;
end;
$$;

create or replace function public.set_my_profile_cover(p_cover_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado.';
  end if;

  insert into public.profiles (id, full_name, phone, cover_url)
  values (auth.uid(), '', '', nullif(btrim(p_cover_url), ''))
  on conflict (id) do update set
    cover_url = excluded.cover_url;
end;
$$;

revoke all on function public.save_my_profile(text, text, text, text) from public;
revoke all on function public.set_my_profile_avatar(text) from public;
revoke all on function public.set_my_profile_cover(text) from public;
grant execute on function public.save_my_profile(text, text, text, text) to authenticated;
grant execute on function public.set_my_profile_avatar(text) to authenticated;
grant execute on function public.set_my_profile_cover(text) to authenticated;

commit;
