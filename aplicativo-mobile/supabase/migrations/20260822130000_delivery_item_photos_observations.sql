begin;

-- =========================================================
-- FIO - FOTOS E OBSERVACOES POR ITEM DA ENTREGA
-- =========================================================

alter table public.work_photos
add column if not exists delivery_checklist_item_id uuid
references public.work_delivery_checklist_items(id) on delete set null;

create index if not exists work_photos_delivery_checklist_item_idx
on public.work_photos(delivery_checklist_item_id, created_at desc)
where delivery_checklist_item_id is not null;

comment on column public.work_photos.delivery_checklist_item_id is
'Vincula uma foto final ao item especifico do checklist da entrega.';


-- Garante que obra, ambiente e item do checklist sejam sempre coerentes.
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

  if new.delivery_checklist_item_id is not null
    and not exists (
      select 1
      from public.work_delivery_checklist_items ci
      where ci.id = new.delivery_checklist_item_id
        and ci.work_id = new.work_id
        and ci.environment_id is not distinct from new.environment_id
        and ci.active = true
        and new.collection = 'work'
        and new.photo_type = 'delivery_final'
    )
  then
    raise exception 'O item do checklist nao corresponde a esta foto.';
  end if;

  return new;
end;
$function$;


create or replace function public.save_work_delivery_item_observation(
  p_item_id uuid,
  p_observation text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.work_delivery_checklist_items%rowtype;
  v_observation text;
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

  if not public.can_write_work(v_item.work_id) then
    raise exception 'Somente a equipe operacional pode registrar a observacao.';
  end if;

  v_observation := nullif(btrim(p_observation), '');

  update public.work_delivery_checklist_items
  set
    description = v_observation,
    updated_by = auth.uid(),
    updated_at = now()
  where id = p_item_id;

  insert into public.work_events (
    work_id, environment_id, event_type, title, description,
    actor_user_id, visibility, metadata
  ) values (
    v_item.work_id,
    v_item.environment_id,
    'ENTREGA_ITEM_OBSERVACAO_ATUALIZADA',
    'Observacao do item de entrega atualizada',
    v_observation,
    auth.uid(),
    'internal',
    jsonb_build_object(
      'delivery_item_id', p_item_id,
      'item_title', v_item.title
    )
  );
end;
$$;

revoke all on function public.save_work_delivery_item_observation(uuid, text)
from public;

grant execute on function public.save_work_delivery_item_observation(uuid, text)
to authenticated;

comment on function public.save_work_delivery_item_observation(uuid, text) is
'Salva uma observacao curta no item da entrega sem alterar sua estrutura.';

commit;
