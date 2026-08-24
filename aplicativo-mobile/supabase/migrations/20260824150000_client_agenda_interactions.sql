create table if not exists public.client_visit_responses (
  visit_id uuid not null references public.work_visits(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  response text not null check (response in ('confirmed', 'declined', 'seen')),
  responded_at timestamptz not null default now(),
  primary key (visit_id, user_id)
);
alter table public.client_visit_responses enable row level security;
create policy client_visit_responses_own on public.client_visit_responses for select to authenticated using (user_id = auth.uid());

create or replace function public.get_my_client_visits()
returns table(visit_id uuid, work_id uuid, work_code text, client_name text, starts_at timestamptz, duration_minutes integer, responsible_name text, status text, observation text, response text)
language sql stable security definer set search_path = '' as $$
  select v.id, v.work_id, w.code, w.client_name, v.starts_at, v.duration_minutes,
    coalesce(nullif(btrim(p.full_name), ''), 'Responsável'), v.status, v.observation, r.response
  from public.work_visits v join public.works w on w.id = v.work_id
  join public.client_portal_memberships cm on cm.work_id = v.work_id and cm.user_id = auth.uid()
  left join public.profiles p on p.id = v.responsible_user_id
  left join public.client_visit_responses r on r.visit_id = v.id and r.user_id = auth.uid()
  where v.status not in ('cancelled', 'completed') order by v.starts_at;
$$;

create or replace function public.respond_to_client_visit(p_visit_id uuid, p_response text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_response not in ('confirmed', 'declined', 'seen') then raise exception 'Resposta inválida.'; end if;
  if not exists(select 1 from public.work_visits v join public.client_portal_memberships cm on cm.work_id = v.work_id where v.id = p_visit_id and cm.user_id = auth.uid()) then raise exception 'Você não tem acesso a esta visita.'; end if;
  insert into public.client_visit_responses(visit_id, user_id, response, responded_at) values(p_visit_id, auth.uid(), p_response, now())
  on conflict (visit_id, user_id) do update set response = excluded.response, responded_at = now();
end; $$;

create table if not exists public.client_fio_interactions (
  event_id uuid not null references public.work_events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  liked boolean not null default false,
  seen_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
alter table public.client_fio_interactions enable row level security;
create policy client_fio_interactions_own_select on public.client_fio_interactions for select to authenticated using (user_id = auth.uid());

create or replace function public.set_my_client_fio_interaction(p_event_id uuid, p_liked boolean default null, p_seen boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.work_events e join public.client_portal_memberships cm on cm.work_id = e.work_id where e.id = p_event_id and e.visibility = 'shared' and cm.user_id = auth.uid()) then raise exception 'Você não tem acesso a esta atualização.'; end if;
  insert into public.client_fio_interactions(event_id, user_id, liked, seen_at) values(p_event_id, auth.uid(), coalesce(p_liked, false), case when p_seen then now() else null end)
  on conflict (event_id, user_id) do update set liked = coalesce(p_liked, client_fio_interactions.liked), seen_at = case when p_seen then now() else client_fio_interactions.seen_at end, updated_at = now();
end; $$;

revoke all on function public.get_my_client_visits(), public.respond_to_client_visit(uuid, text), public.set_my_client_fio_interaction(uuid, boolean, boolean) from public;
grant execute on function public.get_my_client_visits(), public.respond_to_client_visit(uuid, text), public.set_my_client_fio_interaction(uuid, boolean, boolean) to authenticated;
grant select on public.client_visit_responses, public.client_fio_interactions to authenticated;
