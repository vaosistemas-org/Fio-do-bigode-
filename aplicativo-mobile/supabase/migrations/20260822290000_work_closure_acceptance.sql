begin;

-- =========================================================
-- FIO - ENCERRAMENTO E ACEITE DA OBRA
-- =========================================================
-- O aceite fica ligado ao estado de entrega. Nesta primeira etapa,
-- proprietario ou gestor registra o aceite no nome do responsavel;
-- o Portal do Cliente e a assinatura externa ficam preparados para a
-- proxima evolucao, sem alterar os PDFs ja emitidos.

alter table public.work_delivery_states
  add column if not exists acceptance_status text not null default 'pending',
  add column if not exists acceptance_name text,
  add column if not exists acceptance_role text,
  add column if not exists acceptance_notes text,
  add column if not exists accepted_by uuid references auth.users(id) on delete set null,
  add column if not exists accepted_at timestamptz;

alter table public.work_delivery_states
  drop constraint if exists work_delivery_acceptance_status_check;

alter table public.work_delivery_states
  add constraint work_delivery_acceptance_status_check
  check (acceptance_status in ('pending', 'accepted', 'accepted_with_reservations'));

create index if not exists work_delivery_acceptance_status_idx
on public.work_delivery_states(acceptance_status, accepted_at desc);

create or replace function public.save_work_delivery_acceptance(
  p_work_id uuid,
  p_acceptance_status text,
  p_acceptance_name text,
  p_acceptance_role text default null,
  p_acceptance_notes text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_role text;
  v_notes text;
  v_title text;
begin
  if auth.uid() is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  if not public.can_manage_work(p_work_id) then
    raise exception 'Somente proprietario ou gestor pode registrar o aceite.';
  end if;

  if p_acceptance_status not in ('pending', 'accepted', 'accepted_with_reservations') then
    raise exception 'Status de aceite invalido.';
  end if;

  if p_acceptance_status <> 'pending' then
    if not exists (
      select 1 from public.work_delivery_states ds
      where ds.work_id = p_work_id and ds.status = 'ready'
    ) then
      raise exception 'A obra precisa estar pronta para entrega antes do aceite.';
    end if;
    if public.work_delivery_has_blockers(p_work_id) then
      raise exception 'Ainda existem bloqueios na preparacao para entrega.';
    end if;
  end if;

  v_name := nullif(btrim(p_acceptance_name), '');
  v_role := nullif(btrim(p_acceptance_role), '');
  v_notes := nullif(btrim(p_acceptance_notes), '');

  if p_acceptance_status <> 'pending' and v_name is null then
    raise exception 'Informe o nome de quem registrou o aceite.';
  end if;
  if coalesce(char_length(v_name), 0) > 160
    or coalesce(char_length(v_role), 0) > 120
    or coalesce(char_length(v_notes), 0) > 4000 then
    raise exception 'Os dados do aceite excedem o limite permitido.';
  end if;

  update public.work_delivery_states
  set
    acceptance_status = p_acceptance_status,
    acceptance_name = case when p_acceptance_status = 'pending' then null else v_name end,
    acceptance_role = case when p_acceptance_status = 'pending' then null else v_role end,
    acceptance_notes = case when p_acceptance_status = 'pending' then null else v_notes end,
    accepted_by = case when p_acceptance_status = 'pending' then null else auth.uid() end,
    accepted_at = case when p_acceptance_status = 'pending' then null else now() end,
    updated_by = auth.uid(),
    updated_at = now()
  where work_id = p_work_id;

  if p_acceptance_status = 'accepted' then
    v_title := 'Aceite da obra registrado';
  elsif p_acceptance_status = 'accepted_with_reservations' then
    v_title := 'Aceite da obra registrado com ressalvas';
  else
    v_title := 'Aceite da obra reaberto';
  end if;

  insert into public.work_events (
    work_id, event_type, title, description,
    actor_user_id, visibility, metadata
  ) values (
    p_work_id,
    case
      when p_acceptance_status = 'accepted' then 'ENTREGA_ACEITA'
      when p_acceptance_status = 'accepted_with_reservations' then 'ENTREGA_ACEITA_RESSALVAS'
      else 'ENTREGA_ACEITE_REABERTO'
    end,
    v_title,
    case
      when p_acceptance_status = 'pending' then 'O aceite voltou para revisao.'
      when v_notes is null then 'Registro preparado para assinatura digital.'
      else v_notes
    end,
    auth.uid(),
    'shared',
    jsonb_build_object(
      'source', 'delivery_acceptance',
      'acceptance_status', p_acceptance_status,
      'acceptance_name', v_name,
      'acceptance_role', v_role
    )
  );
end;
$$;

revoke all on function public.save_work_delivery_acceptance(uuid, text, text, text, text)
from public;
grant execute on function public.save_work_delivery_acceptance(uuid, text, text, text, text)
to authenticated;

-- Reabrir a preparacao por um bloqueio tambem reabre automaticamente o aceite.
create or replace function public.reset_delivery_acceptance_when_preparing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'preparing'
    and (old.status is distinct from new.status or old.acceptance_status is distinct from new.acceptance_status)
    and new.acceptance_status <> 'pending' then
    new.acceptance_status := 'pending';
    new.acceptance_name := null;
    new.acceptance_role := null;
    new.acceptance_notes := null;
    new.accepted_by := null;
    new.accepted_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists reset_delivery_acceptance_when_preparing_trigger
on public.work_delivery_states;
create trigger reset_delivery_acceptance_when_preparing_trigger
before update on public.work_delivery_states
for each row execute function public.reset_delivery_acceptance_when_preparing();

comment on column public.work_delivery_states.acceptance_status is
'pending = aguardando aceite; accepted = aceite; accepted_with_reservations = aceite com ressalvas.';

commit;
