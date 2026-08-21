begin;

create or replace function public.create_quick_work_visit(
  p_work_id uuid,
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
  v_access_level text;
begin
  if auth.uid() is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  select wp.access_level, w.company_id
  into v_access_level, v_company_id
  from public.work_participants wp
  join public.works w on w.id = wp.work_id
  where wp.work_id = p_work_id
    and wp.user_id = auth.uid()
    and wp.status = 'active'
    and wp.removed_at is null;

  if v_access_level is null or v_access_level = 'viewer' then
    raise exception 'Seu perfil nao pode registrar uma visita.';
  end if;

  insert into public.work_visits (
    work_id, company_id, starts_at, duration_minutes,
    responsible_user_id, status, observation, started_at,
    created_by, updated_by
  ) values (
    p_work_id, v_company_id, now(), 60,
    auth.uid(), 'in_progress', nullif(btrim(p_observation), ''), now(),
    auth.uid(), auth.uid()
  ) returning id into v_visit_id;

  insert into public.work_visit_participants (
    visit_id, user_id, participation_role, response_status, responded_at
  ) values (
    v_visit_id, auth.uid(), 'responsible', 'confirmed', now()
  );

  insert into public.work_events (
    work_id, event_type, title, description,
    actor_user_id, visibility, metadata
  ) values (
    p_work_id, 'VISITA_INICIADA', 'Visita iniciada agora',
    nullif(btrim(p_observation), ''), auth.uid(), 'internal',
    jsonb_build_object(
      'visit_id', v_visit_id,
      'action', 'quick_start',
      'starts_at', now(),
      'status', 'in_progress'
    )
  );

  return v_visit_id;
end;
$$;

revoke all on function public.create_quick_work_visit(uuid, text) from public;
grant execute on function public.create_quick_work_visit(uuid, text) to authenticated;

comment on function public.create_quick_work_visit(uuid, text) is
'Registra uma visita iniciada imediatamente a partir da obra.';

commit;
