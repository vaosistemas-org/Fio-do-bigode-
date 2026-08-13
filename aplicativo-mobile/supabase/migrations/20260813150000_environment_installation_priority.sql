-- =========================================================
-- FIO
-- PRIORIDADE DE MONTAGEM DOS AMBIENTES
-- =========================================================
--
-- A prioridade define somente a ordem operacional de montagem.
-- Ela nao altera o percentual nem o peso do ambiente na obra.
-- Todos os pesos existentes sao normalizados para 1.
-- =========================================================


alter table public.environments
add column if not exists installation_priority boolean
not null
default false;

comment on column public.environments.installation_priority
is 'Indica que o ambiente deve ser montado antes dos demais, sem alterar o calculo de progresso.';


-- =========================================================
-- REMOVE O EFEITO DOS PESOS DIFERENTES NO PROGRESSO
-- =========================================================

do $$
declare
  v_work_id uuid;
begin
  for v_work_id in
    select distinct e.work_id
    from public.environments e
    where e.weight is distinct from 1
  loop
    update public.environments
    set weight = 1
    where work_id = v_work_id
      and weight is distinct from 1;

    perform public.recalculate_work_progress(
      v_work_id
    );
  end loop;
end;
$$;


-- =========================================================
-- ATUALIZA A PRIORIDADE DE MONTAGEM
-- =========================================================

create or replace function public.set_environment_installation_priority(
  p_environment_id uuid,
  p_priority boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_work_id uuid;
  v_environment_name text;
  v_current_priority boolean;
  v_next_priority boolean;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception
      'Usuario nao autenticado.';
  end if;

  select
    e.work_id,
    e.name,
    e.installation_priority
  into
    v_work_id,
    v_environment_name,
    v_current_priority
  from public.environments e
  where e.id = p_environment_id
    and e.active = true;

  if v_work_id is null then
    raise exception
      'Ambiente nao encontrado.';
  end if;

  if not public.can_write_work(
    v_work_id
  ) then
    raise exception
      'Voce nao possui permissao para alterar a prioridade deste ambiente.';
  end if;

  v_next_priority :=
    coalesce(
      p_priority,
      false
    );

  if
    v_current_priority is not distinct from
    v_next_priority
  then
    return v_next_priority;
  end if;

  update public.environments
  set
    installation_priority =
      v_next_priority,
    weight = 1,
    updated_by = v_user_id,
    updated_at = now()
  where id = p_environment_id;

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
    'PRIORIDADE_MONTAGEM_ATUALIZADA',
    case
      when v_next_priority then
        'Prioridade de montagem ativada'
      else
        'Prioridade de montagem removida'
    end,
    case
      when v_next_priority then
        v_environment_name ||
        ' foi marcado para montar primeiro.'
      else
        v_environment_name ||
        ' voltou para a prioridade normal.'
    end,
    v_user_id,
    'internal',
    jsonb_build_object(
      'environment_id',
      p_environment_id,
      'environment_name',
      v_environment_name,
      'installation_priority',
      v_next_priority
    )
  );

  return v_next_priority;
end;
$$;

revoke all
on function public.set_environment_installation_priority(
  uuid,
  boolean
)
from public;

grant execute
on function public.set_environment_installation_priority(
  uuid,
  boolean
)
to authenticated;
