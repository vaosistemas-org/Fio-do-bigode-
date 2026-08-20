-- =========================================================
-- FIO - PREPARACAO PARA ENTREGA
-- =========================================================
--
-- A entrega reutiliza ambientes, pendencias, fotos, Diario/FIO e
-- participantes existentes. Fotos finais continuam na galeria da obra.
-- O estado "ready" so pode ser confirmado quando nao houver bloqueios.
-- =========================================================


-- =========================================================
-- 1. FOTOS FINAIS DENTRO DA GALERIA EXISTENTE
-- =========================================================

alter table public.work_photos
add column if not exists photo_type text not null default 'general';

alter table public.work_photos
drop constraint if exists work_photos_photo_type_check;

alter table public.work_photos
add constraint work_photos_photo_type_check
check (photo_type in ('general', 'delivery_final'));

create index if not exists work_photos_delivery_final_idx
on public.work_photos(work_id, environment_id, created_at desc)
where collection = 'work' and photo_type = 'delivery_final';

comment on column public.work_photos.photo_type is
'general = foto operacional; delivery_final = evidencia final usada na preparacao para entrega.';


-- =========================================================
-- 2. ESTADO GERAL E CHECKLISTS DA ENTREGA
-- =========================================================

create table if not exists public.work_delivery_states (
  work_id uuid primary key
    references public.works(id) on delete cascade,
  notes text,
  status text not null default 'preparing'
    check (status in ('preparing', 'ready')),
  ready_by uuid references auth.users(id) on delete set null,
  ready_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'preparing' and ready_by is null and ready_at is null)
    or (status = 'ready' and ready_by is not null and ready_at is not null)
  )
);

create table if not exists public.work_delivery_checklist_items (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null
    references public.works(id) on delete cascade,
  environment_id uuid
    references public.environments(id) on delete cascade,
  title text not null
    check (char_length(btrim(title)) between 1 and 160),
  description text,
  required boolean not null default true,
  responsible_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'open'
    check (status in ('open', 'completed')),
  completed_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'open' and completed_by is null and completed_at is null)
    or status = 'completed'
  )
);

create index if not exists work_delivery_items_work_idx
on public.work_delivery_checklist_items(work_id, active, status, created_at);

create index if not exists work_delivery_items_environment_idx
on public.work_delivery_checklist_items(environment_id, active, status);

create index if not exists work_delivery_items_responsible_idx
on public.work_delivery_checklist_items(responsible_user_id, active, status);

alter table public.work_delivery_states enable row level security;
alter table public.work_delivery_checklist_items enable row level security;

drop policy if exists work_delivery_states_select
on public.work_delivery_states;

create policy work_delivery_states_select
on public.work_delivery_states
for select to authenticated
using (public.can_write_work(work_id));

drop policy if exists work_delivery_items_select
on public.work_delivery_checklist_items;

create policy work_delivery_items_select
on public.work_delivery_checklist_items
for select to authenticated
using (public.can_write_work(work_id));

revoke all on public.work_delivery_states from anon, authenticated;
revoke all on public.work_delivery_checklist_items from anon, authenticated;
grant select on public.work_delivery_states to authenticated;
grant select on public.work_delivery_checklist_items to authenticated;


-- =========================================================
-- 3. VALIDACAO DOS ITENS
-- =========================================================

create or replace function public.validate_work_delivery_checklist_item()
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
    new.completed_by := null;
    new.completed_at := null;
  elsif new.completed_at is null then
    new.completed_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists validate_work_delivery_checklist_item_trigger
on public.work_delivery_checklist_items;

create trigger validate_work_delivery_checklist_item_trigger
before insert or update on public.work_delivery_checklist_items
for each row execute function public.validate_work_delivery_checklist_item();


-- =========================================================
-- 4. DETECCAO DE BLOQUEIOS E REABERTURA AUTOMATICA
-- =========================================================

create or replace function public.work_delivery_has_blockers(
  p_work_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    not exists (
      select 1
      from public.environments e
      where e.work_id = p_work_id
        and e.active = true
        and e.status <> 'cancelado'
    )
    or exists (
      select 1
      from public.environments e
      where e.work_id = p_work_id
        and e.active = true
        and e.status <> 'cancelado'
        and (
          e.preparation_min_photos < 1
          or (
            select count(*)
            from public.work_photos wp
            where wp.work_id = p_work_id
              and wp.environment_id = e.id
              and wp.collection = 'work'
              and wp.photo_type = 'delivery_final'
          ) < e.preparation_min_photos
        )
    )
    or exists (
      select 1
      from public.work_pending_items pi
      where pi.work_id = p_work_id
        and pi.status = 'open'
        and pi.blocks_delivery = true
    )
    or exists (
      select 1
      from public.work_delivery_checklist_items ci
      where ci.work_id = p_work_id
        and ci.active = true
        and ci.required = true
        and ci.status = 'open'
    );
$$;

revoke all on function public.work_delivery_has_blockers(uuid) from public;

create or replace function public.reopen_ready_delivery_if_blocked()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_work_id uuid;
begin
  if tg_op = 'DELETE' then
    v_work_id := old.work_id;
  else
    v_work_id := new.work_id;
  end if;

  if exists (
    select 1
    from public.work_delivery_states ds
    where ds.work_id = v_work_id
      and ds.status = 'ready'
  ) and public.work_delivery_has_blockers(v_work_id)
  then
    update public.work_delivery_states
    set
      status = 'preparing',
      ready_by = null,
      ready_at = null,
      updated_by = auth.uid(),
      updated_at = now()
    where work_id = v_work_id;

    insert into public.work_events (
      work_id,
      event_type,
      title,
      description,
      actor_user_id,
      visibility,
      metadata
    ) values (
      v_work_id,
      'ENTREGA_REABERTA_AUTOMATICAMENTE',
      'Preparacao para entrega reaberta',
      'Um novo bloqueio foi identificado na obra.',
      auth.uid(),
      'internal',
      jsonb_build_object('source', 'automatic_blocker')
    );
  end if;

  return null;
end;
$$;

drop trigger if exists delivery_recheck_checklist_trigger
on public.work_delivery_checklist_items;
create trigger delivery_recheck_checklist_trigger
after insert or update or delete on public.work_delivery_checklist_items
for each row execute function public.reopen_ready_delivery_if_blocked();

drop trigger if exists delivery_recheck_pending_trigger
on public.work_pending_items;
create trigger delivery_recheck_pending_trigger
after insert or update or delete on public.work_pending_items
for each row execute function public.reopen_ready_delivery_if_blocked();

drop trigger if exists delivery_recheck_photos_trigger
on public.work_photos;
create trigger delivery_recheck_photos_trigger
after insert or update or delete on public.work_photos
for each row execute function public.reopen_ready_delivery_if_blocked();

drop trigger if exists delivery_recheck_environments_trigger
on public.environments;
create trigger delivery_recheck_environments_trigger
after insert or update or delete on public.environments
for each row execute function public.reopen_ready_delivery_if_blocked();


-- =========================================================
-- 5. RPCS DE ESCRITA
-- =========================================================

create or replace function public.save_work_delivery_notes(
  p_work_id uuid,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  if not public.can_manage_work(p_work_id) then
    raise exception 'Somente proprietario ou gestor pode editar a preparacao da entrega.';
  end if;

  insert into public.work_delivery_states (
    work_id, notes, created_by, updated_by
  ) values (
    p_work_id, nullif(btrim(p_notes), ''), auth.uid(), auth.uid()
  )
  on conflict (work_id) do update
  set
    notes = excluded.notes,
    updated_by = auth.uid(),
    updated_at = now();

  insert into public.work_events (
    work_id, event_type, title, description,
    actor_user_id, visibility, metadata
  ) values (
    p_work_id,
    'ENTREGA_OBSERVACOES_ATUALIZADAS',
    'Orientacoes da entrega atualizadas',
    nullif(btrim(p_notes), ''),
    auth.uid(),
    'internal',
    jsonb_build_object('source', 'delivery')
  );
end;
$$;

revoke all on function public.save_work_delivery_notes(uuid, text) from public;
grant execute on function public.save_work_delivery_notes(uuid, text) to authenticated;


create or replace function public.save_work_delivery_checklist_item(
  p_work_id uuid,
  p_title text,
  p_item_id uuid default null,
  p_environment_id uuid default null,
  p_description text default null,
  p_responsible_user_id uuid default null,
  p_required boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item_id uuid;
  v_event_type text;
begin
  if auth.uid() is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  if not public.can_manage_work(p_work_id) then
    raise exception 'Somente proprietario ou gestor pode editar o checklist.';
  end if;

  if nullif(btrim(p_title), '') is null then
    raise exception 'Informe o item do checklist.';
  end if;

  if p_item_id is null then
    insert into public.work_delivery_checklist_items (
      work_id,
      environment_id,
      title,
      description,
      required,
      responsible_user_id,
      created_by,
      updated_by
    ) values (
      p_work_id,
      p_environment_id,
      p_title,
      p_description,
      coalesce(p_required, true),
      p_responsible_user_id,
      auth.uid(),
      auth.uid()
    ) returning id into v_item_id;
    v_event_type := 'ENTREGA_ITEM_CRIADO';
  else
    if not exists (
      select 1
      from public.work_delivery_checklist_items ci
      where ci.id = p_item_id
        and ci.work_id = p_work_id
        and ci.active = true
    ) then
      raise exception 'Item do checklist nao encontrado.';
    end if;

    update public.work_delivery_checklist_items
    set
      environment_id = p_environment_id,
      title = p_title,
      description = p_description,
      required = coalesce(p_required, true),
      responsible_user_id = p_responsible_user_id,
      updated_by = auth.uid(),
      updated_at = now()
    where id = p_item_id;
    v_item_id := p_item_id;
    v_event_type := 'ENTREGA_ITEM_ATUALIZADO';
  end if;

  insert into public.work_events (
    work_id, environment_id, event_type, title, description,
    actor_user_id, visibility, metadata
  ) values (
    p_work_id,
    p_environment_id,
    v_event_type,
    case
      when v_event_type = 'ENTREGA_ITEM_CRIADO' then 'Item de entrega criado'
      else 'Item de entrega atualizado'
    end,
    btrim(p_title),
    auth.uid(),
    'internal',
    jsonb_build_object(
      'delivery_item_id', v_item_id,
      'required', coalesce(p_required, true),
      'responsible_user_id', p_responsible_user_id
    )
  );

  return v_item_id;
end;
$$;

revoke all on function public.save_work_delivery_checklist_item(
  uuid, text, uuid, uuid, text, uuid, boolean
) from public;
grant execute on function public.save_work_delivery_checklist_item(
  uuid, text, uuid, uuid, text, uuid, boolean
) to authenticated;


create or replace function public.set_work_delivery_item_completed(
  p_item_id uuid,
  p_completed boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.work_delivery_checklist_items%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  select * into v_item
  from public.work_delivery_checklist_items ci
  where ci.id = p_item_id
    and ci.active = true
  for update;

  if v_item.id is null then
    raise exception 'Item do checklist nao encontrado.';
  end if;

  if not public.can_manage_work(v_item.work_id)
    and not (
      v_item.responsible_user_id = auth.uid()
      and public.can_write_work(v_item.work_id)
    )
  then
    raise exception 'Somente o gestor ou o responsavel pelo item pode conclui-lo.';
  end if;

  update public.work_delivery_checklist_items
  set
    status = case when coalesce(p_completed, false) then 'completed' else 'open' end,
    completed_by = case when coalesce(p_completed, false) then auth.uid() else null end,
    completed_at = case when coalesce(p_completed, false) then now() else null end,
    updated_by = auth.uid(),
    updated_at = now()
  where id = p_item_id;

  insert into public.work_events (
    work_id, environment_id, event_type, title, description,
    actor_user_id, visibility, metadata
  ) values (
    v_item.work_id,
    v_item.environment_id,
    case
      when coalesce(p_completed, false) then 'ENTREGA_ITEM_CONCLUIDO'
      else 'ENTREGA_ITEM_REABERTO'
    end,
    case
      when coalesce(p_completed, false) then 'Item de entrega concluido'
      else 'Item de entrega reaberto'
    end,
    v_item.title,
    auth.uid(),
    'internal',
    jsonb_build_object('delivery_item_id', p_item_id)
  );
end;
$$;

revoke all on function public.set_work_delivery_item_completed(uuid, boolean)
from public;
grant execute on function public.set_work_delivery_item_completed(uuid, boolean)
to authenticated;


create or replace function public.archive_work_delivery_checklist_item(
  p_item_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.work_delivery_checklist_items%rowtype;
begin
  select * into v_item
  from public.work_delivery_checklist_items ci
  where ci.id = p_item_id
    and ci.active = true
  for update;

  if v_item.id is null then
    raise exception 'Item do checklist nao encontrado.';
  end if;

  if not public.can_manage_work(v_item.work_id) then
    raise exception 'Somente proprietario ou gestor pode remover itens do checklist.';
  end if;

  update public.work_delivery_checklist_items
  set active = false, updated_by = auth.uid(), updated_at = now()
  where id = p_item_id;

  insert into public.work_events (
    work_id, environment_id, event_type, title, description,
    actor_user_id, visibility, metadata
  ) values (
    v_item.work_id,
    v_item.environment_id,
    'ENTREGA_ITEM_REMOVIDO',
    'Item de entrega removido',
    v_item.title,
    auth.uid(),
    'internal',
    jsonb_build_object('delivery_item_id', p_item_id)
  );
end;
$$;

revoke all on function public.archive_work_delivery_checklist_item(uuid)
from public;
grant execute on function public.archive_work_delivery_checklist_item(uuid)
to authenticated;


create or replace function public.set_environment_delivery_min_photos(
  p_environment_id uuid,
  p_min_photos integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_work_id uuid;
  v_environment_name text;
  v_old_min integer;
begin
  if auth.uid() is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  select e.work_id, e.name, e.preparation_min_photos
  into v_work_id, v_environment_name, v_old_min
  from public.environments e
  where e.id = p_environment_id
    and e.active = true
  for update;

  if v_work_id is null then
    raise exception 'Ambiente nao encontrado.';
  end if;

  if not public.can_manage_work(v_work_id) then
    raise exception 'Somente proprietario ou gestor pode definir as fotos obrigatorias.';
  end if;

  if coalesce(p_min_photos, 0) < 0 or coalesce(p_min_photos, 0) > 100 then
    raise exception 'O minimo de fotos deve estar entre 0 e 100.';
  end if;

  update public.environments
  set
    preparation_min_photos = coalesce(p_min_photos, 0),
    updated_by = auth.uid(),
    updated_at = now()
  where id = p_environment_id;

  if v_old_min is distinct from coalesce(p_min_photos, 0) then
    insert into public.work_events (
      work_id, environment_id, event_type, title, description,
      actor_user_id, visibility, metadata
    ) values (
      v_work_id,
      p_environment_id,
      'ENTREGA_FOTOS_MINIMAS_ATUALIZADAS',
      'Fotos finais obrigatorias atualizadas',
      v_environment_name,
      auth.uid(),
      'internal',
      jsonb_build_object(
        'old_min_photos', v_old_min,
        'new_min_photos', coalesce(p_min_photos, 0)
      )
    );
  end if;
end;
$$;

revoke all on function public.set_environment_delivery_min_photos(uuid, integer)
from public;
grant execute on function public.set_environment_delivery_min_photos(uuid, integer)
to authenticated;


create or replace function public.confirm_work_ready_for_delivery(
  p_work_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  if not public.can_manage_work(p_work_id) then
    raise exception 'Somente proprietario ou gestor pode confirmar a entrega.';
  end if;

  if public.work_delivery_has_blockers(p_work_id) then
    raise exception 'Ainda existem bloqueios na preparacao para entrega.';
  end if;

  insert into public.work_delivery_states (
    work_id, status, ready_by, ready_at, created_by, updated_by
  ) values (
    p_work_id, 'ready', auth.uid(), now(), auth.uid(), auth.uid()
  )
  on conflict (work_id) do update
  set
    status = 'ready',
    ready_by = auth.uid(),
    ready_at = now(),
    updated_by = auth.uid(),
    updated_at = now();

  insert into public.work_events (
    work_id, event_type, title, description,
    actor_user_id, visibility, metadata
  ) values (
    p_work_id,
    'ENTREGA_PRONTA',
    'Obra pronta para entrega',
    'Checklist, pendencias bloqueadoras e fotos finais conferidos.',
    auth.uid(),
    'internal',
    jsonb_build_object('source', 'delivery_confirmation')
  );
end;
$$;

revoke all on function public.confirm_work_ready_for_delivery(uuid) from public;
grant execute on function public.confirm_work_ready_for_delivery(uuid)
to authenticated;


create or replace function public.reopen_work_delivery(
  p_work_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  if not public.can_manage_work(p_work_id) then
    raise exception 'Somente proprietario ou gestor pode reabrir a preparacao.';
  end if;

  update public.work_delivery_states
  set
    status = 'preparing',
    ready_by = null,
    ready_at = null,
    updated_by = auth.uid(),
    updated_at = now()
  where work_id = p_work_id;

  insert into public.work_events (
    work_id, event_type, title, description,
    actor_user_id, visibility, metadata
  ) values (
    p_work_id,
    'ENTREGA_REABERTA',
    'Preparacao para entrega reaberta',
    'A obra voltou para a etapa de preparacao.',
    auth.uid(),
    'internal',
    jsonb_build_object('source', 'manual')
  );
end;
$$;

revoke all on function public.reopen_work_delivery(uuid) from public;
grant execute on function public.reopen_work_delivery(uuid) to authenticated;


-- =========================================================
-- 6. DIARIO/FIO IDENTIFICA FOTOS FINAIS
-- =========================================================

create or replace function public.log_work_photo_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid;
begin
  v_actor := auth.uid();

  if tg_op = 'INSERT' then
    if new.diary_event_id is not null then
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
      case
        when new.photo_type = 'delivery_final' then 'FOTO_FINAL_ADICIONADA'
        else 'FOTO_ADICIONADA'
      end,
      case
        when new.photo_type = 'delivery_final' then 'Foto final adicionada'
        else 'Foto adicionada'
      end,
      coalesce(new.caption, new.file_name, 'Foto registrada'),
      coalesce(new.created_by, v_actor),
      new.visibility,
      jsonb_build_object(
        'photo_id', new.id,
        'photo_type', new.photo_type,
        'storage_path', new.storage_path,
        'file_name', new.file_name
      )
    );

    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.diary_event_id is not null then
      return old;
    end if;

    if exists (
      select 1 from public.works w where w.id = old.work_id
    ) then
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
        old.work_id,
        old.environment_id,
        case
          when old.photo_type = 'delivery_final' then 'FOTO_FINAL_REMOVIDA'
          else 'FOTO_REMOVIDA'
        end,
        case
          when old.photo_type = 'delivery_final' then 'Foto final removida'
          else 'Foto removida'
        end,
        coalesce(old.caption, old.file_name, 'Foto removida'),
        v_actor,
        old.visibility,
        jsonb_build_object(
          'photo_id', old.id,
          'photo_type', old.photo_type,
          'storage_path', old.storage_path,
          'file_name', old.file_name
        )
      );
    end if;

    return old;
  end if;

  return null;
end;
$function$;


-- =========================================================
-- 7. FOTOS SO PODEM SER ESCRITAS PELA EQUIPE OPERACIONAL
-- =========================================================

drop policy if exists work_photos_insert on public.work_photos;
create policy work_photos_insert
on public.work_photos
for insert to authenticated
with check (
  public.can_write_work(work_id)
  and created_by = auth.uid()
);

drop policy if exists work_photos_update on public.work_photos;
create policy work_photos_update
on public.work_photos
for update to authenticated
using (public.can_write_work(work_id))
with check (public.can_write_work(work_id));

comment on table public.work_delivery_states is
'Texto geral e confirmacao operacional da preparacao para entrega.';

comment on table public.work_delivery_checklist_items is
'Checklist geral da obra e checklist individual de cada ambiente.';
