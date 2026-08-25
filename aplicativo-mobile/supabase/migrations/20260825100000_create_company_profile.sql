begin;
create or replace function public.create_my_company_profile(p_name text, p_business_type text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_company_id uuid;
begin
  if auth.uid() is null or nullif(btrim(p_name), '') is null then raise exception 'Informe o nome da loja ou empresa.'; end if;
  insert into companies (name, business_type, created_by, active) values (btrim(p_name), nullif(btrim(p_business_type), ''), auth.uid(), true) returning id into v_company_id;
  insert into company_members (company_id, user_id, role, status) values (v_company_id, auth.uid(), 'owner', 'active');
  return v_company_id;
end; $$;
revoke all on function public.create_my_company_profile(text, text) from public;
grant execute on function public.create_my_company_profile(text, text) to authenticated;
commit;
