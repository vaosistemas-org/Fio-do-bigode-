begin;

-- Registra o ultimo usuario que alterou informacoes gerais da obra.
-- As atualizacoes continuam preservadas detalhadamente em work_events.
alter table public.works
add column if not exists updated_by uuid
references auth.users(id)
on delete set null;

comment on column public.works.updated_by is
'Ultimo usuario que alterou informacoes gerais da obra.';

commit;
