begin;

-- =========================================================
-- FIO - CORRECAO DE FOTOS NAS ATUALIZACOES OPERACIONAIS
-- =========================================================
--
-- O Diario original aceitava fotos apenas quando o evento era
-- DIARIO_REGISTRO_MANUAL. A atualizacao operacional usa o mesmo vinculo
-- seguro, mas possui o tipo ATUALIZACAO_OPERACIONAL.
-- =========================================================

create or replace function public.validate_work_photo_environment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.environment_id is not null
    and not exists (
      select 1
      from public.environments e
      where e.id = new.environment_id
        and e.work_id = new.work_id
    )
  then
    raise exception 'O ambiente informado nao pertence a esta obra.';
  end if;

  if new.diary_event_id is not null
    and not exists (
      select 1
      from public.work_events we
      where we.id = new.diary_event_id
        and we.work_id = new.work_id
        and we.event_type in (
          'DIARIO_REGISTRO_MANUAL',
          'ATUALIZACAO_OPERACIONAL'
        )
        and we.environment_id is not distinct from new.environment_id
        and we.visibility = new.visibility
        and new.collection = 'work'
        and (
          we.actor_user_id = auth.uid()
          or public.can_manage_work(new.work_id)
        )
    )
  then
    raise exception 'O registro do Diario nao corresponde a esta foto.';
  end if;

  return new;
end;
$function$;

commit;
