-- Rastreio operacional de peças, sempre vinculado a uma pendência existente.
create table if not exists public.work_piece_tracks (
  id uuid primary key default gen_random_uuid(),
  pending_item_id uuid not null unique references public.work_pending_items(id) on delete cascade,
  work_id uuid not null references public.works(id) on delete cascade,
  environment_id uuid references public.environments(id) on delete set null,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  responsible_company text,
  expected_date date,
  status text not null default 'requested' check (status in ('requested', 'in_production', 'ready', 'in_transit', 'delivered', 'installed', 'problem', 'awaiting_confirmation', 'cancelled')),
  received_condition text check (received_condition in ('ok', 'damaged', 'missing')),
  last_status_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists work_piece_tracks_work_status_idx on public.work_piece_tracks(work_id, status, expected_date);
create index if not exists work_piece_tracks_attention_idx on public.work_piece_tracks(last_status_at, expected_date);

alter table public.work_piece_tracks enable row level security;
create policy work_piece_tracks_select on public.work_piece_tracks for select to authenticated using (public.is_work_participant(work_id));
create policy work_piece_tracks_insert on public.work_piece_tracks for insert to authenticated with check (public.can_write_work(work_id) and created_by = auth.uid());
create policy work_piece_tracks_update on public.work_piece_tracks for update to authenticated using (public.can_write_work(work_id)) with check (public.can_write_work(work_id));

create table if not exists public.work_piece_track_events (
  id uuid primary key default gen_random_uuid(),
  piece_track_id uuid not null references public.work_piece_tracks(id) on delete cascade,
  status text not null,
  note text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
alter table public.work_piece_track_events enable row level security;
create policy work_piece_track_events_select on public.work_piece_track_events for select to authenticated using (exists (select 1 from public.work_piece_tracks t where t.id = piece_track_id and public.is_work_participant(t.work_id)));
create policy work_piece_track_events_insert on public.work_piece_track_events for insert to authenticated with check (exists (select 1 from public.work_piece_tracks t where t.id = piece_track_id and public.can_write_work(t.work_id)) and created_by = auth.uid());

create or replace function public.validate_work_piece_track()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_pending record;
begin
  select work_id, environment_id, title, due_date into v_pending from public.work_pending_items where id = new.pending_item_id;
  if not found then raise exception 'Pendência não encontrada.'; end if;
  if new.work_id <> v_pending.work_id then raise exception 'A peça precisa pertencer à mesma obra da pendência.'; end if;
  new.environment_id := coalesce(new.environment_id, v_pending.environment_id);
  new.title := btrim(new.title);
  new.responsible_company := nullif(btrim(coalesce(new.responsible_company, '')), '');
  new.expected_date := coalesce(new.expected_date, v_pending.due_date);
  new.updated_at := now(); new.last_status_at := now(); new.updated_by := auth.uid();
  return new;
end; $$;
create trigger validate_work_piece_track_trigger before insert or update on public.work_piece_tracks for each row execute function public.validate_work_piece_track();

create or replace function public.log_work_piece_track_event()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.work_piece_track_events(piece_track_id, status, note, created_by) values (new.id, new.status, 'Rastreio iniciado.', auth.uid());
  elsif old.status is distinct from new.status then
    insert into public.work_piece_track_events(piece_track_id, status, note, created_by) values (new.id, new.status, null, auth.uid());
  end if;
  return new;
end; $$;
create trigger log_work_piece_track_event_trigger after insert or update on public.work_piece_tracks for each row execute function public.log_work_piece_track_event();

grant select, insert, update on public.work_piece_tracks, public.work_piece_track_events to authenticated;
