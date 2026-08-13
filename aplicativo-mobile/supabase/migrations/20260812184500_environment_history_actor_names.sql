-- =========================================================
-- FIO
-- HISTORICO DO AMBIENTE COM AUTOR
-- =========================================================
--
-- Centraliza a leitura do historico em uma RPC protegida.
-- Assim o app nao precisa consultar public.profiles
-- separadamente para descobrir o nome de quem registrou
-- cada evento.
-- =========================================================

create or replace function public.get_environment_history(
  p_environment_id uuid
)
returns table (
  id uuid,
  event_type text,
  title text,
  description text,
  actor_user_id uuid,
  actor_full_name text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_work_id uuid;
begin
  if auth.uid() is null then
    raise exception
      'Usuario nao autenticado.';
  end if;

  select
    e.work_id
  into
    v_work_id
  from public.environments e
  where e.id = p_environment_id;

  if v_work_id is null then
    raise exception
      'Ambiente nao encontrado.';
  end if;

  if not public.is_work_participant(
    v_work_id
  ) then
    raise exception
      'Voce nao possui acesso a esta obra.';
  end if;

  return query
  select
    we.id,
    we.event_type,
    we.title,
    we.description,
    we.actor_user_id,
    p.full_name as actor_full_name,
    we.created_at

  from public.work_events we

  left join public.profiles p
    on p.id = we.actor_user_id

  where we.environment_id =
    p_environment_id

  order by
    we.created_at desc

  limit 30;
end;
$$;

revoke all
on function public.get_environment_history(uuid)
from public;

grant execute
on function public.get_environment_history(uuid)
to authenticated;
