begin;

create or replace function public.can_access_fio_conversation(p_conversation_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.fio_conversations c
    join public.fio_conversation_members cm on cm.conversation_id = c.id and cm.user_id = auth.uid() and cm.active = true
    where c.id = p_conversation_id and c.active = true
      and ((c.work_id is not null and public.is_work_participant(c.work_id))
        or (c.company_id is not null and public.can_use_company_context(c.company_id))
        or (c.work_id is null and c.company_id is null))
  );
$$;

create or replace function public.can_send_fio_conversation(p_conversation_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.fio_conversations c
    join public.fio_conversation_members cm on cm.conversation_id = c.id and cm.user_id = auth.uid() and cm.active = true
    where c.id = p_conversation_id and c.active = true
      and (((c.work_id is not null) and exists (
        select 1 from public.work_participants wp where wp.work_id = c.work_id and wp.user_id = auth.uid()
          and wp.status = 'active' and wp.removed_at is null and wp.access_level in ('owner', 'manager', 'collaborator')
      )) or ((c.company_id is not null) and public.can_use_company_context(c.company_id))
        or (c.work_id is null and c.company_id is null))
  );
$$;

revoke all on function public.can_access_fio_conversation(uuid) from public;
revoke all on function public.can_send_fio_conversation(uuid) from public;
grant execute on function public.can_access_fio_conversation(uuid) to authenticated;
grant execute on function public.can_send_fio_conversation(uuid) to authenticated;

commit;
