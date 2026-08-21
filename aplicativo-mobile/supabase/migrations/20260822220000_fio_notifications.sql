begin;

create table if not exists public.fio_notifications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  work_id uuid references public.works(id) on delete cascade, event_id uuid references public.work_events(id) on delete cascade,
  title text not null, description text, read_at timestamptz, created_at timestamptz not null default now()
);
create index if not exists fio_notifications_user_created_idx on public.fio_notifications(user_id, created_at desc);
alter table public.fio_notifications enable row level security;
drop policy if exists fio_notifications_select on public.fio_notifications;
create policy fio_notifications_select on public.fio_notifications for select to authenticated using (user_id = auth.uid());
revoke all on public.fio_notifications from anon, authenticated;
grant select on public.fio_notifications to authenticated;

create or replace function public.fanout_fio_notification()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.fio_notifications (user_id, work_id, event_id, title, description)
  select wp.user_id, new.work_id, new.id, new.title, new.description
  from public.work_participants wp
  where wp.work_id = new.work_id and wp.status = 'active' and wp.removed_at is null
    and wp.user_id <> coalesce(new.actor_user_id, auth.uid());
  return new;
end;
$$;
drop trigger if exists fanout_fio_notification_trigger on public.work_events;
create trigger fanout_fio_notification_trigger after insert on public.work_events for each row execute function public.fanout_fio_notification();

create or replace function public.get_my_notifications()
returns table (id uuid, work_id uuid, title text, description text, read_at timestamptz, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select n.id, n.work_id, n.title, n.description, n.read_at, n.created_at from public.fio_notifications n
  where n.user_id = auth.uid() order by n.created_at desc limit 50;
$$;
create or replace function public.mark_fio_notification_read(p_notification_id uuid)
returns void language sql security definer set search_path = '' as $$
  update public.fio_notifications set read_at = coalesce(read_at, now()) where id = p_notification_id and user_id = auth.uid();
$$;
revoke all on function public.get_my_notifications() from public;
grant execute on function public.get_my_notifications() to authenticated;
revoke all on function public.mark_fio_notification_read(uuid) from public;
grant execute on function public.mark_fio_notification_read(uuid) to authenticated;
commit;
