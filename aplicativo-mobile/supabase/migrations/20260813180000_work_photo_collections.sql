-- =========================================================
-- FIO - SEPARACAO DAS COLECOES DE FOTOS
-- =========================================================
-- A galeria operacional da obra usa collection = 'work'.
-- Assistencia e pecas danificadas ficam em colecoes proprias
-- e nao aparecem na galeria geral ou na preparacao do ambiente.

alter table public.work_photos
add column if not exists collection text
not null default 'work';

alter table public.work_photos
drop constraint if exists work_photos_collection_check;

alter table public.work_photos
add constraint work_photos_collection_check
check (collection in ('work', 'assistance', 'damaged_piece'));

create index if not exists work_photos_collection_idx
on public.work_photos(work_id, collection, environment_id, created_at desc);

comment on column public.work_photos.collection is
'Separa a galeria operacional da obra de assistencia e pecas danificadas.';
