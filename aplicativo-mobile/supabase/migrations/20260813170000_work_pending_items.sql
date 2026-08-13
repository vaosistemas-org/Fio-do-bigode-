-- =========================================================
-- FIO - PENDENCIAS DA OBRA E DOS AMBIENTES
-- =========================================================

create table public.work_pending_items (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null
    references public.works(id) on delete cascade,
  environment_id uuid
    references public.environments(id) on delete set null,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  description text,
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent')),
  responsible_user_id uuid references auth.users(id) on delete set null,
  due_date date,
  blocks_delivery boolean not null default false,
  status text not null default 'open'
    check (status in ('open', 'completed')),
  completed_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index work_pending_items_work_idx
  on public.work_pending_items(work_id, status, created_at desc);

create index work_pending_items_environment_idx
  on public.work_pending_items(environment_id, status);

create index work_pending_items_responsible_idx
  on public.work_pending_items(responsible_user_id, status);

alter table public.work_pending_items enable row level security;

create or replace function public.validate_work_pending_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.environment_id is not null
    and not exists (
      select 1
      from public.environments e
      where e.id = new.environment_id
        and e.work_id = new.work_id
        and e.active = true
    )
  then
    raise exception 'O ambiente informado nao pertence a esta obra.';
  end if;

  if new.responsible_user_id is not null
    and not exists (
      select 1
      from public.work_participants wp
      where wp.work_id = new.work_id
        and wp.user_id = new.responsible_user_id
        and wp.status = 'active'
        and wp.removed_at is null
        and wp.access_level in ('owner', 'manager', 'collaborator')
    )
  then
    raise exception 'O responsavel precisa ter acesso operacional ativo a obra.';
  end if;

  new.title := btrim(new.title);
  new.description := nullif(btrim(new.description), '');
  new.updated_at := now();

  if new.status = 'open' then
    new.completed_at := null;
    new.completed_by := null;
  elsif new.completed_at is null then
    new.completed_at := now();
  end if;

  return new;
end;
$$;

create trigger validate_work_pending_item_trigger
before insert or update on public.work_pending_items
for each row execute function public.validate_work_pending_item();

create or replace function public.log_work_pending_item_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_type text;
  v_event_title text;
begin
  if tg_op = 'INSERT' then
    v_event_type := 'PENDENCIA_CRIADA';
    v_event_title := 'Pendencia criada';
  elsif old.status is distinct from new.status then
    if new.status = 'completed' then
      v_event_type := 'PENDENCIA_CONCLUIDA';
      v_event_title := 'Pendencia concluida';
    else
      v_event_type := 'PENDENCIA_REABERTA';
      v_event_title := 'Pendencia reaberta';
    end if;
  elsif old.title is distinct from new.title
    or old.description is distinct from new.description
    or old.priority is distinct from new.priority
    or old.responsible_user_id is distinct from new.responsible_user_id
    or old.due_date is distinct from new.due_date
    or old.blocks_delivery is distinct from new.blocks_delivery
    or old.environment_id is distinct from new.environment_id
  then
    v_event_type := 'PENDENCIA_ATUALIZADA';
    v_event_title := 'Pendencia atualizada';
  else
    return new;
  end if;

  insert into public.work_events (
    work_id,
    environment_id,
    event_type,
    title,
    description,
    actor_user_id,
    visibility,
    metadata
  ) values (
    new.work_id,
    new.environment_id,
    v_event_type,
    v_event_title,
    new.title,
    auth.uid(),
    'internal',
    jsonb_build_object(
      'pending_item_id', new.id,
      'priority', new.priority,
      'status', new.status,
      'blocks_delivery', new.blocks_delivery,
      'due_date', new.due_date,
      'responsible_user_id', new.responsible_user_id
    )
  );

  return new;
end;
$$;

create trigger log_work_pending_item_event_trigger
after insert or update on public.work_pending_items
for each row execute function public.log_work_pending_item_event();

create policy work_pending_items_select
on public.work_pending_items
for select to authenticated
using (public.is_work_participant(work_id));

create policy work_pending_items_insert
on public.work_pending_items
for insert to authenticated
with check (
  public.can_write_work(work_id)
  and created_by = auth.uid()
);

create policy work_pending_items_update
on public.work_pending_items
for update to authenticated
using (public.can_write_work(work_id))
with check (public.can_write_work(work_id));

grant select, insert, update
on public.work_pending_items
to authenticated;
