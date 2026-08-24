begin;

create or replace function public.open_public_direct_conversation(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_key text;
begin
  if auth.uid() is null or p_user_id is null or p_user_id = auth.uid() then
    raise exception 'Perfil inválido para conversa.';
  end if;
  if not exists (select 1 from profiles where id = p_user_id and professional_profile_enabled = true) then
    raise exception 'Este perfil não está disponível para mensagens.';
  end if;
  v_key := 'public:' || least(auth.uid()::text, p_user_id::text) || ':' || greatest(auth.uid()::text, p_user_id::text);
  insert into fio_conversations (conversation_type, direct_key, created_by)
  values ('direct', v_key, auth.uid())
  on conflict do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from fio_conversations where direct_key = v_key and active = true;
  end if;
  insert into fio_conversation_members (conversation_id, user_id)
  values (v_id, auth.uid()), (v_id, p_user_id)
  on conflict (conversation_id, user_id) do update set active = true;
  return v_id;
end;
$$;

revoke all on function public.open_public_direct_conversation(uuid) from public;
grant execute on function public.open_public_direct_conversation(uuid) to authenticated;

commit;
