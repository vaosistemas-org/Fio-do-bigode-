begin;

-- =========================================================
-- FIO - AGENDA E VISITAS / CICLO OPERACIONAL
-- =========================================================

create or replace function public.transition_work_visit(
  p_visit_id uuid,
  p_action text,
  p_new_starts_at timestamptz default null,
  p_reason text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_visit public.work_visits%rowtype;
  v_access_level text;
  v_reason text;
  v_event_type text;
  v_event_title text;
  v_new_status text;
  v_previous_starts_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  select v.*
  into v_visit
  from public.work_visits v
  where v.id = p_visit_id
  for update;

  if v_visit.id is null then
    raise exception 'Visita nao encontrada.';
  end if;

  select wp.access_level
  into v_access_level
  from public.work_participants wp
  where wp.work_id = v_visit.work_id
    and wp.user_id = auth.uid()
    and wp.status = 'active'
    and wp.removed_at is null;

  if v_access_level is null
    or not (
      v_access_level in ('owner', 'manager')
      or (
        v_access_level = 'collaborator'
        and v_visit.responsible_user_id = auth.uid()
      )
    )
  then
    raise exception 'Seu perfil nao pode gerenciar esta visita.';
  end if;

  if v_visit.status in ('completed', 'cancelled') then
    raise exception 'Esta visita ja foi encerrada.';
  end if;

  v_reason := nullif(btrim(p_reason), '');
  v_previous_starts_at := v_visit.starts_at;

  case p_action
    when 'confirm' then
      if v_visit.status not in ('scheduled', 'rescheduled') then
        raise exception 'Esta visita nao pode ser confirmada agora.';
      end if;
      v_new_status := 'confirmed';
      v_event_type := 'VISITA_CONFIRMADA';
      v_event_title := 'Visita confirmada';

    when 'reschedule' then
      if v_visit.status not in ('scheduled', 'confirmed', 'rescheduled') then
        raise exception 'Esta visita nao pode ser reagendada agora.';
      end if;
      if p_new_starts_at is null or p_new_starts_at <= now() then
        raise exception 'Escolha uma nova data e horario futuros.';
      end if;
      if v_reason is null then
        raise exception 'Informe o motivo do reagendamento.';
      end if;
      v_new_status := 'rescheduled';
      v_event_type := 'VISITA_REAGENDADA';
      v_event_title := 'Visita reagendada';

    when 'start' then
      if v_visit.status not in ('scheduled', 'confirmed', 'rescheduled') then
        raise exception 'Esta visita nao pode ser iniciada agora.';
      end if;
      v_new_status := 'in_progress';
      v_event_type := 'VISITA_INICIADA';
      v_event_title := 'Visita iniciada';

    when 'complete' then
      if v_visit.status <> 'in_progress' then
        raise exception 'Inicie a visita antes de conclui-la.';
      end if;
      v_new_status := 'completed';
      v_event_type := 'VISITA_CONCLUIDA';
      v_event_title := 'Visita concluida';

    when 'cancel' then
      if v_reason is null then
        raise exception 'Informe o motivo do cancelamento.';
      end if;
      v_new_status := 'cancelled';
      v_event_type := 'VISITA_CANCELADA';
      v_event_title := 'Visita cancelada';

    else
      raise exception 'Acao de visita invalida.';
  end case;

  update public.work_visits
  set
    status = v_new_status,
    starts_at = case
      when p_action = 'reschedule' then p_new_starts_at
      else starts_at
    end,
    previous_starts_at = case
      when p_action = 'reschedule' then starts_at
      else previous_starts_at
    end,
    change_reason = case
      when p_action in ('reschedule', 'cancel') then v_reason
      else change_reason
    end,
    started_at = case when p_action = 'start' then now() else started_at end,
    completed_at = case when p_action = 'complete' then now() else completed_at end,
    cancelled_at = case when p_action = 'cancel' then now() else cancelled_at end,
    updated_by = auth.uid()
  where id = p_visit_id;

  insert into public.work_events (
    work_id,
    event_type,
    title,
    description,
    actor_user_id,
    visibility,
    metadata
  ) values (
    v_visit.work_id,
    v_event_type,
    v_event_title,
    v_reason,
    auth.uid(),
    'internal',
    jsonb_build_object(
      'visit_id', p_visit_id,
      'action', p_action,
      'previous_status', v_visit.status,
      'status', v_new_status,
      'previous_starts_at', v_previous_starts_at,
      'starts_at', case
        when p_action = 'reschedule' then p_new_starts_at
        else v_visit.starts_at
      end,
      'reason', v_reason
    )
  );

  return v_new_status;
end;
$$;

revoke all on function public.transition_work_visit(uuid, text, timestamptz, text)
from public;

grant execute on function public.transition_work_visit(uuid, text, timestamptz, text)
to authenticated;

comment on function public.transition_work_visit(uuid, text, timestamptz, text) is
'Confirma, reagenda, inicia, conclui ou cancela uma visita e registra a mudanca no FIO.';

commit;
