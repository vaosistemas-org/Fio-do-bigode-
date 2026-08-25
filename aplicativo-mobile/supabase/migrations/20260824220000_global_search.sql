begin;

create or replace function public.search_fio_global(p_search text)
returns table (result_type text, result_id uuid, title text, subtitle text, image_url text)
language sql stable security definer set search_path = public
as $$
  with q as (select '%' || btrim(coalesce(p_search, '')) || '%' as term)
  select 'person', p.id, coalesce(nullif(btrim(p.full_name), ''), 'Profissional do FIO'),
    coalesce(p.job_title, 'Perfil profissional'), p.avatar_url
  from profiles p, q
  where p.professional_profile_enabled = true
    and char_length(btrim(coalesce(p_search, ''))) >= 2
    and (p.full_name ilike q.term or p.job_title ilike q.term or p.coverage_area ilike q.term)
  union all
  select 'company', c.id, c.name, coalesce(c.business_type, 'Empresa do FIO'), null
  from companies c, q
  where c.active = true and char_length(btrim(coalesce(p_search, ''))) >= 2 and c.name ilike q.term
  union all
  select 'work', w.id, coalesce(w.client_name, w.code), coalesce(w.code, 'Obra do FIO'), null::text
  from works w, q
  where is_work_participant(w.id) and w.archived_at is null and w.deleted_at is null
    and char_length(btrim(coalesce(p_search, ''))) >= 2
    and (w.code ilike q.term or w.client_name ilike q.term)
  limit 60;
$$;

revoke all on function public.search_fio_global(text) from public;
grant execute on function public.search_fio_global(text) to authenticated;

commit;
