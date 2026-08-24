-- =========================================================
-- FIO - ABERTURAS TECNICAS NAS MEDICOES
-- =========================================================
-- Porta e janela usam o mesmo objeto de ponto, com segundo
-- canto proporcional e dimensoes/referencias em milimetros.

alter table public.work_measurement_annotations
  add column if not exists inner_width_mm integer;

alter table public.work_measurement_annotations
  add column if not exists inner_height_mm integer;

alter table public.work_measurement_annotations
  add column if not exists reference_left_mm integer;

alter table public.work_measurement_annotations
  add column if not exists reference_right_mm integer;

alter table public.work_measurement_annotations
  drop constraint if exists work_measurement_annotations_inner_width_check;

alter table public.work_measurement_annotations
  add constraint work_measurement_annotations_inner_width_check
  check (inner_width_mm is null or inner_width_mm >= 0);

alter table public.work_measurement_annotations
  drop constraint if exists work_measurement_annotations_inner_height_check;

alter table public.work_measurement_annotations
  add constraint work_measurement_annotations_inner_height_check
  check (inner_height_mm is null or inner_height_mm >= 0);

alter table public.work_measurement_annotations
  drop constraint if exists work_measurement_annotations_reference_left_check;

alter table public.work_measurement_annotations
  add constraint work_measurement_annotations_reference_left_check
  check (reference_left_mm is null or reference_left_mm >= 0);

alter table public.work_measurement_annotations
  drop constraint if exists work_measurement_annotations_reference_right_check;

alter table public.work_measurement_annotations
  add constraint work_measurement_annotations_reference_right_check
  check (reference_right_mm is null or reference_right_mm >= 0);
