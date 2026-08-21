begin;

-- =========================================================
-- FIO - AGENDA E VISITAS / FUNDACAO
-- =========================================================
-- Uma unica entidade alimenta os recortes pessoal, obra e empresa.
-- O primeiro bloco cobre criacao e consulta. O ciclo operacional
-- completo sera adicionado sobre estas mesmas tabelas.

create table if not exists public.work_visits (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.works(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  starts_at timestamptz not null,
  duration_minutes integer not null default 60
    check (duration_minutes between 15 and 720),
  responsible_user_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'scheduled'
    check (
      status in (
        'scheduled',
        'confirmed',
        'rescheduled',
        'in_progress',
        'completed',
        'cancelled'
      )
    ),
  observation text,
  previous_starts_at timestamptz,
  change_reason text,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists work_visits_work_starts_idx
on public.work_visits(work_id, starts_at desc);

create index if not exists work_visits_responsible_starts_idx
on public.work_visits(responsible_user_id, starts_at desc);

create index if not exists work_visits_company_starts_idx
on public.work_visits(company_id, starts_at desc)
where company_id is not null;

create index if not exists work_visits_status_starts_idx
on public.work_visits(status, starts_at);


create table if not exists public.work_visit_environments (
  visit_id uuid not null references public.work_visits(id) on delete cascade,
  environment_id uuid not null references public.environments(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (visit_id, environment_id)
);

create index if not exists work_visit_environments_environment_idx
on public.work_visit_environments(environment_id, visit_id);


create table if not exists public.work_visit_participants (
  visit_id uuid not null references public.work_visits(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  participation_role text not null default 'participant'
    check (participation_role in ('responsible', 'participant')),
  response_status text not null default 'pending'
    check (response_status in ('pending', 'confirmed', 'declined')),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (visit_id, user_id)
);

create index if not exists work_visit_participants_user_idx
on public.work_visit_participants(user_id, visit_id);


alter table public.work_visits enable row level security;
alter table public.work_visit_environments enable row level security;
alter table public.work_visit_participants enable row level security;

drop policy if exists work_visits_select on public.work_visits;
create policy work_visits_select
on public.work_visits
for select to authenticated
using (public.is_work_participant(work_id));

drop policy if exists work_visit_environments_select
on public.work_visit_environments;
create policy work_visit_environments_select
on public.work_visit_environments
for select to authenticated
using (
  exists (
    select 1
    from public.work_visits v
    where v.id = visit_id
      and public.is_work_participant(v.work_id)
  )
);

drop policy if exists work_visit_participants_select
on public.work_visit_participants;
create policy work_visit_participants_select
on public.work_visit_participants
for select to authenticated
using (
  exists (
    select 1
    from public.work_visits v
    where v.id = visit_id
      and public.is_work_participant(v.work_id)
  )
);

revoke all on public.work_visits from anon, authenticated;
revoke all on public.work_visit_environments from anon, authenticated;
revoke all on public.work_visit_participants from anon, authenticated;

grant select on public.work_visits to authenticated;
grant select on public.work_visit_environments to authenticated;
grant select on public.work_visit_participants to authenticated;


create or replace function public.touch_work_visit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists touch_work_visit_trigger on public.work_visits;
create trigger touch_work_visit_trigger
before update on public.work_visits
for each row execute function public.touch_work_visit();


create or replace function public.refresh_work_next_visit(
  p_work_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.works w
  set next_visit_at = (
    select min(v.starts_at)
    from public.work_visits v
    where v.work_id = p_work_id
      and v.status in ('scheduled', 'confirmed', 'rescheduled')
      and v.starts_at >= now()
  )
  where w.id = p_work_id;
end;
$$;

revoke all on function public.refresh_work_next_visit(uuid) from public;


create or replace function public.sync_work_next_visit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_work_id uuid;
begin
  v_work_id := case when tg_op = 'DELETE' then old.work_id else new.work_id end;
  perform public.refresh_work_next_visit(v_work_id);

  if tg_op = 'UPDATE' and old.work_id is distinct from new.work_id then
    perform public.refresh_work_next_visit(old.work_id);
  end if;

  return null;
end;
$$;

drop trigger if exists sync_work_next_visit_trigger on public.work_visits;
create trigger sync_work_next_visit_trigger
after insert or update or delete on public.work_visits
for each row execute function public.sync_work_next_visit();


create or replace function public.create_work_visit(
  p_work_id uuid,
  p_starts_at timestamptz,
  p_duration_minutes integer,
  p_responsible_user_id uuid,
  p_environment_ids uuid[] default array[]::uuid[],
  p_participant_ids uuid[] default array[]::uuid[],
  p_observation text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_visit_id uuid;
  v_company_id uuid;
  v_work_code text;
  v_client_name text;
  v_current_access text;
begin
  if auth.uid() is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  if not public.can_write_work(p_work_id) then
    raise exception 'Voce nao pode criar visitas nesta obra.';
  end if;

  select wp.access_level
  into v_current_access
  from public.work_participants wp
  where wp.work_id = p_work_id
    and wp.user_id = auth.uid()
    and wp.status = 'active'
    and wp.removed_at is null;

  if v_current_access = 'collaborator'
    and p_responsible_user_id is distinct from auth.uid()
  then
    raise exception 'Colaborador pode criar apenas visitas pelas quais sera responsavel.';
  end if;

  if p_starts_at is null or p_starts_at < now() - interval '5 minutes' then
    raise exception 'Escolha uma data e horario futuros.';
  end if;

  if coalesce(p_duration_minutes, 0) < 15
    or coalesce(p_duration_minutes, 0) > 720
  then
    raise exception 'A duracao deve ficar entre 15 minutos e 12 horas.';
  end if;

  select wp.company_id, w.code, w.client_name
  into v_company_id, v_work_code, v_client_name
  from public.works w
  join public.work_participants wp
    on wp.work_id = w.id
    and wp.user_id = auth.uid()
    and wp.status = 'active'
    and wp.removed_at is null
  where w.id = p_work_id
    and w.archived_at is null;

  if v_work_code is null then
    raise exception 'Obra nao encontrada.';
  end if;

  if not exists (
    select 1
    from public.work_participants wp
    where wp.work_id = p_work_id
      and wp.user_id = p_responsible_user_id
      and wp.status = 'active'
      and wp.removed_at is null
      and wp.access_level in ('owner', 'manager', 'collaborator')
  ) then
    raise exception 'O responsavel precisa ter acesso operacional ativo a obra.';
  end if;

  if exists (
    select 1
    from unnest(coalesce(p_environment_ids, array[]::uuid[])) environment_id
    where not exists (
      select 1
      from public.environments e
      where e.id = environment_id
        and e.work_id = p_work_id
        and e.active = true
        and e.status <> 'cancelado'
    )
  ) then
    raise exception 'Um dos ambientes selecionados nao pertence a esta obra.';
  end if;

  if exists (
    select 1
    from unnest(coalesce(p_participant_ids, array[]::uuid[])) participant_id
    where not exists (
      select 1
      from public.work_participants wp
      where wp.work_id = p_work_id
        and wp.user_id = participant_id
        and wp.status = 'active'
        and wp.removed_at is null
        and wp.access_level in ('owner', 'manager', 'collaborator')
    )
  ) then
    raise exception 'Um dos participantes nao possui acesso operacional a obra.';
  end if;

  insert into public.work_visits (
    work_id,
    company_id,
    starts_at,
    duration_minutes,
    responsible_user_id,
    observation,
    created_by,
    updated_by
  ) values (
    p_work_id,
    v_company_id,
    p_starts_at,
    p_duration_minutes,
    p_responsible_user_id,
    nullif(btrim(p_observation), ''),
    auth.uid(),
    auth.uid()
  ) returning id into v_visit_id;

  insert into public.work_visit_environments (visit_id, environment_id)
  select v_visit_id, environment_id
  from (
    select distinct unnest(coalesce(p_environment_ids, array[]::uuid[])) as environment_id
  ) selected
  on conflict do nothing;

  insert into public.work_visit_participants (
    visit_id,
    user_id,
    participation_role,
    response_status,
    responded_at
  ) values (
    v_visit_id,
    p_responsible_user_id,
    'responsible',
    'confirmed',
    now()
  );

  insert into public.work_visit_participants (
    visit_id,
    user_id,
    participation_role,
    response_status,
    responded_at
  )
  select
    v_visit_id,
    participant_id,
    'participant',
    case when participant_id = auth.uid() then 'confirmed' else 'pending' end,
    case when participant_id = auth.uid() then now() else null end
  from (
    select distinct unnest(coalesce(p_participant_ids, array[]::uuid[])) as participant_id
  ) selected
  where participant_id <> p_responsible_user_id
  on conflict do nothing;

  insert into public.work_events (
    work_id,
    event_type,
    title,
    description,
    actor_user_id,
    visibility,
    metadata
  ) values (
    p_work_id,
    'VISITA_AGENDADA',
    'Visita agendada',
    format(
      '%s - %s',
      coalesce(v_work_code, 'Obra'),
      coalesce(v_client_name, 'Cliente')
    ),
    auth.uid(),
    'internal',
    jsonb_build_object(
      'visit_id', v_visit_id,
      'starts_at', p_starts_at,
      'duration_minutes', p_duration_minutes,
      'responsible_user_id', p_responsible_user_id,
      'environment_ids', to_jsonb(coalesce(p_environment_ids, array[]::uuid[])),
      'participant_ids', to_jsonb(coalesce(p_participant_ids, array[]::uuid[]))
    )
  );

  return v_visit_id;
end;
$$;

revoke all on function public.create_work_visit(
  uuid, timestamptz, integer, uuid, uuid[], uuid[], text
) from public;

grant execute on function public.create_work_visit(
  uuid, timestamptz, integer, uuid, uuid[], uuid[], text
) to authenticated;


create or replace function public.get_agenda_works()
returns table (
  work_id uuid,
  work_code text,
  client_name text,
  address text,
  status text,
  access_level text,
  can_create boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    w.id,
    w.code,
    w.client_name,
    w.address,
    w.status,
    wp.access_level,
    public.can_write_work(w.id)
  from public.works w
  join public.work_participants wp
    on wp.work_id = w.id
    and wp.user_id = auth.uid()
    and wp.status = 'active'
    and wp.removed_at is null
  where auth.uid() is not null
    and w.archived_at is null
  order by w.updated_at desc, w.client_name;
$$;

revoke all on function public.get_agenda_works() from public;
grant execute on function public.get_agenda_works() to authenticated;


create or replace function public.get_work_visits(
  p_scope text default 'mine',
  p_work_id uuid default null
)
returns table (
  visit_id uuid,
  work_id uuid,
  work_code text,
  client_name text,
  address text,
  company_id uuid,
  company_name text,
  starts_at timestamptz,
  duration_minutes integer,
  responsible_user_id uuid,
  responsible_name text,
  status text,
  observation text,
  environments jsonb,
  participants jsonb,
  can_manage boolean,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_active_company_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  if p_scope not in ('mine', 'work', 'company') then
    raise exception 'Recorte de agenda invalido.';
  end if;

  if p_scope = 'work'
    and (p_work_id is null or not public.is_work_participant(p_work_id))
  then
    raise exception 'Escolha uma obra que voce possa acessar.';
  end if;

  select p.active_company_id
  into v_active_company_id
  from public.profiles p
  where p.id = auth.uid();

  return query
  select
    v.id,
    v.work_id,
    w.code,
    w.client_name,
    w.address,
    v.company_id,
    c.name,
    v.starts_at,
    v.duration_minutes,
    v.responsible_user_id,
    coalesce(nullif(btrim(rp.full_name), ''), 'Responsavel'),
    v.status,
    v.observation,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'environment_id', e.id,
            'name', e.name
          ) order by e.name
        )
        from public.work_visit_environments ve
        join public.environments e on e.id = ve.environment_id
        where ve.visit_id = v.id
      ),
      '[]'::jsonb
    ),
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'user_id', vp.user_id,
            'full_name', coalesce(nullif(btrim(pp.full_name), ''), 'Participante'),
            'participation_role', vp.participation_role,
            'response_status', vp.response_status
          ) order by
            case when vp.participation_role = 'responsible' then 0 else 1 end,
            coalesce(pp.full_name, '')
        )
        from public.work_visit_participants vp
        left join public.profiles pp on pp.id = vp.user_id
        where vp.visit_id = v.id
      ),
      '[]'::jsonb
    ),
    (
      public.can_manage_work(v.work_id)
      or (
        v.responsible_user_id = auth.uid()
        and public.can_write_work(v.work_id)
      )
    ),
    v.created_at
  from public.work_visits v
  join public.works w on w.id = v.work_id
  left join public.companies c on c.id = v.company_id
  left join public.profiles rp on rp.id = v.responsible_user_id
  where public.is_work_participant(v.work_id)
    and (
      (
        p_scope = 'mine'
        and (
          v.responsible_user_id = auth.uid()
          or v.created_by = auth.uid()
          or exists (
            select 1
            from public.work_visit_participants mine
            where mine.visit_id = v.id
              and mine.user_id = auth.uid()
          )
        )
      )
      or (p_scope = 'work' and v.work_id = p_work_id)
      or (
        p_scope = 'company'
        and v_active_company_id is not null
        and (
          v.company_id = v_active_company_id
          or exists (
            select 1
            from public.work_companies wc
            where wc.work_id = v.work_id
              and wc.company_id = v_active_company_id
              and wc.status = 'active'
          )
        )
      )
    )
  order by
    case when v.starts_at >= now() then 0 else 1 end,
    case when v.starts_at >= now() then v.starts_at end asc,
    case when v.starts_at < now() then v.starts_at end desc;
end;
$$;

revoke all on function public.get_work_visits(text, uuid) from public;
grant execute on function public.get_work_visits(text, uuid) to authenticated;

comment on table public.work_visits is
'Registro operacional unico que alimenta as agendas pessoal, da obra e da empresa.';

comment on function public.create_work_visit(
  uuid, timestamptz, integer, uuid, uuid[], uuid[], text
) is
'Cria uma visita, vincula ambientes e participantes e registra o evento no FIO.';

commit;
