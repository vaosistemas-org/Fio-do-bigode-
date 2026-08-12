-- =========================================================
-- FIO
-- LIMPEZA DO PERFIL PROFISSIONAL
-- =========================================================
--
-- Remove campos criados durante a primeira versão
-- experimental do perfil profissional.
--
-- Modelo oficial:
-- logo_path
-- active
--
-- Os campos removidos não possuem dados que precisem
-- ser preservados.
-- =========================================================

alter table public.companies
  drop column if exists logo_url,
  drop column if exists is_active,
  drop column if exists country;