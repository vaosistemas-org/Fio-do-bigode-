-- =========================================================
-- FIO
-- PROFISSIONAL ENCERRA O PROPRIO VINCULO
-- =========================================================

create or replace function public.leave_company_professional_link(
  p_link_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception
      'Usuário não autenticado.';
  end if;

  update public.company_collaborators
  set
    status = 'cancelled',
    reviewed_at = now(),
    reviewed_by = v_user_id,
    updated_at = now()
  where id = p_link_id
    and user_id = v_user_id
    and status = 'approved';

  if not found then
    raise exception
      'Vínculo profissional ativo não encontrado.';
  end if;

  return true;
end;
$$;


revoke all
on function public.leave_company_professional_link(uuid)
from public;


grant execute
on function public.leave_company_professional_link(uuid)
to authenticated;