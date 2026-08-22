begin;

create or replace function public.get_my_notification_unread_count()
returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.fio_notifications
  where user_id = auth.uid() and read_at is null;
$$;

revoke all on function public.get_my_notification_unread_count() from public;
grant execute on function public.get_my_notification_unread_count() to authenticated;

commit;
