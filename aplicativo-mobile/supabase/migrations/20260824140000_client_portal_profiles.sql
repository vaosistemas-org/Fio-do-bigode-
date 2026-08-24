-- Perfil de cliente: uma conta pode acessar somente as obras às quais foi vinculada.
create table if not exists public.client_portal_memberships (
  work_id uuid not null references public.works(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (work_id, user_id)
);
alter table public.client_portal_memberships enable row level security;
create policy client_portal_memberships_own_select on public.client_portal_memberships for select to authenticated using (user_id = auth.uid() or public.can_manage_work(work_id));

create or replace function public.is_client_portal_user()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.client_portal_memberships where user_id = auth.uid());
$$;

create or replace function public.set_work_client_portal_member(p_work_id uuid, p_user_id uuid, p_enabled boolean default true)
returns void language plpgsql security definer set search_path = '' as $$
declare v_company_id uuid;
begin
  if not public.can_manage_work(p_work_id) then raise exception 'Somente proprietário ou gestor pode liberar o portal do cliente.'; end if;
  if not exists(select 1 from public.profiles where id = p_user_id) then raise exception 'A conta do cliente precisa ser criada antes do vínculo.'; end if;
  if p_enabled then
    select company_id into v_company_id from public.work_participants where work_id = p_work_id and user_id = auth.uid() and status = 'active' and removed_at is null;
    update public.work_participants set access_level = 'viewer', status = 'active', removed_at = null, role_title = 'Cliente'
    where work_id = p_work_id and user_id = p_user_id;
    if not found then
      insert into public.work_participants(work_id, user_id, company_id, role_title, access_level, status, joined_at)
      values(p_work_id, p_user_id, v_company_id, 'Cliente', 'viewer', 'active', now());
    end if;
    insert into public.client_portal_memberships(work_id, user_id, created_by) values(p_work_id, p_user_id, auth.uid()) on conflict do nothing;
  else
    delete from public.client_portal_memberships where work_id = p_work_id and user_id = p_user_id;
  end if;
end; $$;

create or replace function public.get_my_client_works()
returns table(id uuid, code text, client_name text, address text, status text, progress integer, next_visit_at timestamptz, updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select w.id, w.code, w.client_name, w.address, w.status, w.progress, w.next_visit_at, w.updated_at
  from public.client_portal_memberships cm join public.works w on w.id = cm.work_id
  where cm.user_id = auth.uid() and w.archived_at is null and w.deleted_at is null order by w.updated_at desc;
$$;

revoke all on function public.is_client_portal_user(), public.set_work_client_portal_member(uuid, uuid, boolean), public.get_my_client_works() from public;
grant execute on function public.is_client_portal_user(), public.set_work_client_portal_member(uuid, uuid, boolean), public.get_my_client_works() to authenticated;
grant select on public.client_portal_memberships to authenticated;
