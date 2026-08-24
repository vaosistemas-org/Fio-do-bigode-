-- Perfil básico de uma pessoa encontrada para participação em uma obra.
-- A consulta é restrita a quem administra a própria obra.
create or replace function public.get_work_person_profile(
  p_work_id uuid,
  p_user_id uuid
)
returns table (
  user_id uuid,
  full_name text,
  phone text,
  job_title text,
  coverage_area text,
  avatar_url text,
  is_client boolean
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_manage_work(p_work_id) then
    raise exception 'Você não possui permissão para consultar este perfil.';
  end if;

  return query
  select p.id, coalesce(nullif(btrim(p.full_name), ''), 'Usuário do FIO'),
    p.phone, p.job_title, p.coverage_area, p.avatar_url,
    coalesce(lower(p.job_title) = 'cliente', false)
  from public.profiles p
  where p.id = p_user_id;
end;
$$;

revoke all on function public.get_work_person_profile(uuid, uuid) from public;
grant execute on function public.get_work_person_profile(uuid, uuid) to authenticated;
