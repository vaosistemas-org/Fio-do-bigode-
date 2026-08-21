begin;

create or replace function public.update_work_visit_details(
  p_visit_id uuid,
  p_starts_at timestamptz,
  p_responsible_user_id uuid,
  p_participant_ids uuid[] default array[]::uuid[],
  p_environment_ids uuid[] default array[]::uuid[],
  p_observation text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_visit public.work_visits%rowtype;
  v_access_level text;
begin
  if auth.uid() is null then raise exception 'Usuario nao autenticado.'; end if;
  select * into v_visit from public.work_visits where id = p_visit_id for update;
  if v_visit.id is null then raise exception 'Visita nao encontrada.'; end if;
  if v_visit.status in ('completed', 'cancelled', 'in_progress') then
    raise exception 'Esta visita nao pode ter seus dados editados agora.';
  end if;

  select wp.access_level into v_access_level
  from public.work_participants wp
  where wp.work_id = v_visit.work_id and wp.user_id = auth.uid()
    and wp.status = 'active' and wp.removed_at is null;
  if v_access_level is null or not (
    v_access_level in ('owner', 'manager')
    or (v_access_level = 'collaborator' and v_visit.responsible_user_id = auth.uid())
  ) then raise exception 'Seu perfil nao pode editar esta visita.'; end if;
  if p_starts_at <= now() then raise exception 'Escolha uma data e horario futuros.'; end if;
  if not exists (
    select 1 from public.work_participants wp
    where wp.work_id = v_visit.work_id and wp.user_id = p_responsible_user_id
      and wp.status = 'active' and wp.removed_at is null
      and wp.access_level in ('owner', 'manager', 'collaborator')
  ) then raise exception 'O responsavel nao possui acesso operacional a obra.'; end if;

  update public.work_visits set
    starts_at = p_starts_at,
    responsible_user_id = p_responsible_user_id,
    observation = nullif(btrim(p_observation), ''),
    updated_by = auth.uid()
  where id = p_visit_id;

  delete from public.work_visit_environments where visit_id = p_visit_id;
  insert into public.work_visit_environments (visit_id, environment_id)
  select p_visit_id, selected_id from unnest(coalesce(p_environment_ids, array[]::uuid[])) selected_id
  where exists (select 1 from public.environments e where e.id = selected_id and e.work_id = v_visit.work_id)
  on conflict do nothing;

  delete from public.work_visit_participants where visit_id = p_visit_id;
  insert into public.work_visit_participants (visit_id, user_id, participation_role, response_status, responded_at)
  values (p_visit_id, p_responsible_user_id, 'responsible', 'confirmed', now());
  insert into public.work_visit_participants (visit_id, user_id, participation_role, response_status)
  select p_visit_id, selected_id, 'participant', 'pending'
  from unnest(coalesce(p_participant_ids, array[]::uuid[])) selected_id
  where selected_id <> p_responsible_user_id
    and exists (select 1 from public.work_participants wp where wp.work_id = v_visit.work_id and wp.user_id = selected_id and wp.status = 'active' and wp.removed_at is null)
  on conflict do nothing;

  insert into public.work_events (work_id, event_type, title, description, actor_user_id, visibility, metadata)
  values (v_visit.work_id, 'VISITA_ATUALIZADA', 'Visita atualizada', nullif(btrim(p_observation), ''), auth.uid(), 'internal',
    jsonb_build_object('visit_id', p_visit_id, 'starts_at', p_starts_at, 'responsible_user_id', p_responsible_user_id));
end;
$$;

revoke all on function public.update_work_visit_details(uuid, timestamptz, uuid, uuid[], uuid[], text) from public;
grant execute on function public.update_work_visit_details(uuid, timestamptz, uuid, uuid[], uuid[], text) to authenticated;
commit;
