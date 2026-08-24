alter table public.profiles
  add column if not exists client_profile_enabled boolean not null default false;

update public.profiles p
set client_profile_enabled = true
where exists (
  select 1 from public.client_portal_memberships cm
  where cm.user_id = p.id
);

create or replace function public.set_my_client_profile_enabled(p_enabled boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not coalesce(p_enabled, false) and exists (
    select 1 from public.client_portal_memberships where user_id = auth.uid()
  ) then
    raise exception 'Remova primeiro os vínculos ativos como cliente.';
  end if;

  update public.profiles
  set client_profile_enabled = coalesce(p_enabled, false)
  where id = auth.uid();
end;
$$;

create or replace function public.is_client_portal_user()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id = auth.uid() and client_profile_enabled = true)
    or exists(select 1 from public.client_portal_memberships where user_id = auth.uid());
$$;

revoke all on function public.set_my_client_profile_enabled(boolean) from public;
grant execute on function public.set_my_client_profile_enabled(boolean) to authenticated;
