create or replace function public.restore_environment(
  p_environment_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid;
  v_work_id uuid;
  v_environment_name text;
  v_work_progress integer;
begin

  v_user_id :=
    auth.uid();

  if v_user_id is null then
    raise exception
      'Usuario nao autenticado.';
  end if;


  select
    e.work_id,
    e.name
  into
    v_work_id,
    v_environment_name
  from public.environments e
  where e.id =
    p_environment_id
    and e.active = false;


  if v_work_id is null then
    raise exception
      'Ambiente arquivado nao encontrado.';
  end if;


  if not public.can_manage_work(
    v_work_id
  ) then
    raise exception
      'Voce nao possui permissao para restaurar este ambiente.';
  end if;


  if exists (
    select 1
    from public.environments e
    where e.work_id = v_work_id
      and e.active = true
      and lower(e.name) =
        lower(v_environment_name)
      and e.id <> p_environment_id
  ) then
    raise exception
      'Ja existe um ambiente ativo com este nome. Altere o ambiente ativo antes de restaurar este arquivo.';
  end if;


  update public.environments
  set
    active = true,
    archived_at = null,
    updated_by = v_user_id,
    updated_at = now()
  where id =
    p_environment_id;


  insert into public.work_events (
    work_id,
    environment_id,
    event_type,
    title,
    description,
    actor_user_id,
    visibility,
    metadata
  )
  values (
    v_work_id,
    p_environment_id,
    'AMBIENTE_RESTAURADO',
    'Ambiente restaurado',
    v_environment_name,
    v_user_id,
    'internal',
    jsonb_build_object(
      'environment_name',
      v_environment_name
    )
  );


  v_work_progress :=
    public.recalculate_work_progress(
      v_work_id
    );


  return v_work_progress;

end;
$function$;


grant execute
on function public.restore_environment(uuid)
to authenticated;