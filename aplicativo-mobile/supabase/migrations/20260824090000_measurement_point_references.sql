-- =========================================================
-- FIO - REFERENCIAS TECNICAS DOS PONTOS DE MEDICAO
-- =========================================================
-- Os valores sao manuais, em milimetros, para permitir que
-- uma futura planta baixa/LiDAR use os mesmos objetos.

alter table public.work_measurement_annotations
  add column if not exists floor_height_mm integer;

alter table public.work_measurement_annotations
  add column if not exists reference_distance_mm integer;

alter table public.work_measurement_annotations
  drop constraint if exists work_measurement_annotations_floor_height_check;

alter table public.work_measurement_annotations
  add constraint work_measurement_annotations_floor_height_check
  check (floor_height_mm is null or floor_height_mm >= 0);

alter table public.work_measurement_annotations
  drop constraint if exists work_measurement_annotations_reference_distance_check;

alter table public.work_measurement_annotations
  add constraint work_measurement_annotations_reference_distance_check
  check (reference_distance_mm is null or reference_distance_mm >= 0);
