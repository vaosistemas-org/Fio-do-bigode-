-- =========================================================
-- FIO
-- ADMINISTRADOR VOLTA A COLABORADOR
-- =========================================================
--
-- Remover a permissão de administrador NÃO remove
-- o profissional da empresa.
--
-- O membro interno admin passa para removed e o vínculo
-- profissional anterior volta para approved.
--
-- Somente o proprietário pode executar esta ação.
-- =========================================================

create or replace function public.demote_company_admin_to_collaborator(
  p_company_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requester_id uuid;
  v_requester_role text;
  v_target_role text;
  v_collaborator_id uuid;
begin
  v_requester_id := auth.uid();

  if v_requester_id is null then
    raise exception
      'Usuário não autenticado.';
  end if;


  -- =====================================================
  -- SOMENTE OWNER
  -- =====================================================

  select cm.role
  into v_requester_role
  from public.company_members cm
  where cm.company_id = p_company_id
    and cm.user_id = v_requester_id
    and cm.status = 'active';


  if v_requester_role is distinct from 'owner' then
    raise exception
      'Somente o proprietário pode remover permissões de administrador.';
  end if;


  if p_user_id = v_requester_id then
    raise exception
      'O proprietário não pode alterar a própria permissão por esta função.';
  end if;


  -- =====================================================
  -- CONFIRMA QUE O ALVO É ADMIN ATIVO
  -- =====================================================

  select cm.role
  into v_target_role
  from public.company_members cm
  where cm.company_id = p_company_id
    and cm.user_id = p_user_id
    and cm.status = 'active';


  if v_target_role is null then
    raise exception
      'Membro ativo não encontrado.';
  end if;


  if v_target_role = 'owner' then
    raise exception
      'O proprietário não pode ser alterado.';
  end if;


  if v_target_role <> 'admin' then
    raise exception
      'Esta pessoa não é administradora da empresa.';
  end if;


  -- =====================================================
  -- DESATIVA O MEMBRO INTERNO
  -- =====================================================

  update public.company_members
  set
    status = 'removed',
    removed_at = now(),
    updated_at = now(),
    updated_by = v_requester_id
  where company_id = p_company_id
    and user_id = p_user_id
    and role = 'admin'
    and status = 'active';


  -- =====================================================
  -- RECUPERA O VÍNCULO PROFISSIONAL ANTERIOR
  -- =====================================================

  select cc.id
  into v_collaborator_id
  from public.company_collaborators cc
  where cc.company_id = p_company_id
    and cc.user_id = p_user_id
  limit 1;


  if v_collaborator_id is null then
    raise exception
      'Vínculo profissional anterior não encontrado.';
  end if;


  update public.company_collaborators
  set
    status = 'approved',
    reviewed_at = now(),
    reviewed_by = v_requester_id,
    updated_at = now()
  where id = v_collaborator_id;


  return true;
end;
$$;


revoke all
on function public.demote_company_admin_to_collaborator(
  uuid,
  uuid
)
from public;


grant execute
on function public.demote_company_admin_to_collaborator(
  uuid,
  uuid
)
to authenticated;