-- =========================================================
-- FIO - CHECKLIST PADRAO DA PREPARACAO PARA ENTREGA
-- =========================================================
-- Cria os dez itens oficiais em cada ambiente ativo na primeira
-- abertura da preparacao. A rotina e idempotente e tambem atende
-- ambientes adicionados depois.

alter table public.work_delivery_checklist_items
add column if not exists default_key text;

alter table public.work_delivery_checklist_items
add column if not exists sort_order integer not null default 1000;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'work_delivery_items_default_key_check'
      and conrelid = 'public.work_delivery_checklist_items'::regclass
  ) then
    alter table public.work_delivery_checklist_items
    add constraint work_delivery_items_default_key_check
    check (
      default_key is null
      or default_key ~ '^[a-z0-9_]+$'
    );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'work_delivery_items_sort_order_check'
      and conrelid = 'public.work_delivery_checklist_items'::regclass
  ) then
    alter table public.work_delivery_checklist_items
    add constraint work_delivery_items_sort_order_check
    check (sort_order >= 0);
  end if;
end;
$$;

with default_items(default_key, title, sort_order) as (
  values
    ('doors_aligned', 'Portas e frentes alinhadas', 10),
    ('drawers_working', 'Gavetas funcionando corretamente', 20),
    ('hardware_reviewed', 'Ferragens revisadas', 30),
    ('handles_installed', 'Puxadores instalados', 40),
    ('finishes_completed', 'Acabamentos concluídos', 50),
    ('lighting_outlets_checked', 'Iluminação e tomadas verificadas', 60),
    ('silicone_seals_completed', 'Silicone e vedações concluídos', 70),
    ('cleaning_completed', 'Limpeza realizada', 80),
    ('parts_materials_checked', 'Peças e materiais conferidos', 90),
    ('final_photos_registered', 'Fotos finais registradas', 100)
),
existing_candidates as (
  select
    ci.id,
    di.default_key,
    di.sort_order,
    row_number() over (
      partition by ci.work_id, ci.environment_id, di.default_key
      order by ci.created_at, ci.id
    ) as position
  from public.work_delivery_checklist_items ci
  join default_items di on di.title = ci.title
  where ci.active = true
    and ci.environment_id is not null
    and ci.default_key is null
)
update public.work_delivery_checklist_items ci
set
  default_key = candidate.default_key,
  sort_order = candidate.sort_order
from existing_candidates candidate
where ci.id = candidate.id
  and candidate.position = 1;

create unique index if not exists work_delivery_items_default_unique_idx
on public.work_delivery_checklist_items(
  work_id,
  environment_id,
  default_key
)
where active = true and default_key is not null;

create or replace function public.ensure_work_delivery_default_checklist(
  p_work_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  if not public.can_manage_work(p_work_id) then
    raise exception 'Somente proprietario ou gestor pode preparar o checklist padrao.';
  end if;

  insert into public.work_delivery_checklist_items (
    work_id,
    environment_id,
    default_key,
    sort_order,
    title,
    required,
    created_by,
    updated_by
  )
  select
    p_work_id,
    e.id,
    default_item.default_key,
    default_item.sort_order,
    default_item.title,
    true,
    auth.uid(),
    auth.uid()
  from public.environments e
  cross join (
    values
      ('doors_aligned', 'Portas e frentes alinhadas', 10),
      ('drawers_working', 'Gavetas funcionando corretamente', 20),
      ('hardware_reviewed', 'Ferragens revisadas', 30),
      ('handles_installed', 'Puxadores instalados', 40),
      ('finishes_completed', 'Acabamentos concluídos', 50),
      ('lighting_outlets_checked', 'Iluminação e tomadas verificadas', 60),
      ('silicone_seals_completed', 'Silicone e vedações concluídos', 70),
      ('cleaning_completed', 'Limpeza realizada', 80),
      ('parts_materials_checked', 'Peças e materiais conferidos', 90),
      ('final_photos_registered', 'Fotos finais registradas', 100)
  ) as default_item(default_key, title, sort_order)
  where e.work_id = p_work_id
    and e.active = true
    and e.status <> 'cancelado'
  on conflict (
    work_id,
    environment_id,
    default_key
  ) where active = true and default_key is not null
  do nothing;

  get diagnostics v_inserted = row_count;

  if v_inserted > 0 then
    insert into public.work_events (
      work_id,
      event_type,
      title,
      description,
      actor_user_id,
      visibility,
      metadata
    ) values (
      p_work_id,
      'ENTREGA_CHECKLIST_PADRAO_CRIADO',
      'Checklist padrão da entrega preparado',
      format('%s itens padrão adicionados aos ambientes.', v_inserted),
      auth.uid(),
      'internal',
      jsonb_build_object('items_created', v_inserted)
    );
  end if;

  return v_inserted;
end;
$$;

revoke all on function public.ensure_work_delivery_default_checklist(uuid)
from public;

grant execute on function public.ensure_work_delivery_default_checklist(uuid)
to authenticated;

comment on function public.ensure_work_delivery_default_checklist(uuid) is
'Cria uma unica vez os dez itens oficiais de entrega em cada ambiente ativo.';
