begin;

alter table public.companies
  add column if not exists archived_at timestamptz,
  add column if not exists deleted_at timestamptz;

create or replace function public.get_my_company_profiles_for_management()
returns table (company_id uuid, company_name text, relationship_type text, company_role text, role_title text, is_active boolean, is_archived boolean, can_manage boolean)
language sql stable security definer set search_path=public as $$
  select c.id,c.name,
    case when cm.user_id is not null then 'member' else 'collaborator' end,
    cm.role::text,cc.role_title,p.active_company_id=c.id,c.archived_at is not null,
    public.can_manage_company_profile(c.id)
  from public.companies c
  join public.profiles p on p.id=auth.uid()
  left join public.company_members cm on cm.company_id=c.id and cm.user_id=auth.uid() and cm.status='active'
  left join public.company_collaborators cc on cc.company_id=c.id and cc.user_id=auth.uid() and cc.status='approved'
  where c.deleted_at is null and (cm.user_id is not null or cc.user_id is not null)
  order by (c.archived_at is null) desc,(p.active_company_id=c.id) desc,c.name;
$$;

create or replace function public.manage_my_company_profile(p_company_id uuid,p_action text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.can_manage_company_profile(p_company_id) then raise exception 'Você não possui permissão para administrar esta empresa.'; end if;
  if p_action='archive' then
    update public.companies set archived_at=now(),active=false,updated_by=auth.uid() where id=p_company_id and deleted_at is null;
  elsif p_action='restore' then
    update public.companies set archived_at=null,active=true,updated_by=auth.uid() where id=p_company_id and deleted_at is null;
  elsif p_action='delete' then
    update public.companies set deleted_at=now(),archived_at=coalesce(archived_at,now()),active=false,updated_by=auth.uid() where id=p_company_id;
  else raise exception 'Ação inválida.';
  end if;
  update public.profiles set active_company_id=null where id=auth.uid() and active_company_id=p_company_id and p_action in ('archive','delete');
end; $$;

revoke all on function public.get_my_company_profiles_for_management() from public;
revoke all on function public.manage_my_company_profile(uuid,text) from public;
grant execute on function public.get_my_company_profiles_for_management() to authenticated;
grant execute on function public.manage_my_company_profile(uuid,text) to authenticated;

commit;
