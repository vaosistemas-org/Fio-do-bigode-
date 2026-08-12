-- =========================================================
-- FIO
-- GESTAO DA EQUIPE DA EMPRESA
-- =========================================================


-- =========================================================
-- OWNER E ADMIN PODEM ADMINISTRAR A EMPRESA
-- =========================================================

create or replace function public.can_manage_company_profile(
  p_company_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.company_members cm
    where cm.company_id = p_company_id
      and cm.user_id = auth.uid()
      and cm.role in ('owner', 'admin')
  );
$$;


revoke all
on function public.can_manage_company_profile(uuid)
from public;

grant execute
on function public.can_manage_company_profile(uuid)
to authenticated;


-- =========================================================
-- ALTERAR FUNCAO DE COLABORADOR PROFISSIONAL
-- =========================================================

create or replace function public.update_company_collaborator_role(
  p_company_id uuid,
  p_user_id uuid,
  p_role_title text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role_title text;
begin
  if not public.can_manage_company_profile(
    p_company_id
  ) then
    raise exception
      'Você não possui permissão para administrar esta empresa.';
  end if;

  v_role_title :=
    nullif(
      trim(p_role_title),
      ''
    );

  if v_role_title is null then
    raise exception
      'Informe a função do profissional.';
  end if;

  update public.company_collaborators
  set
    role_title = v_role_title,
    updated_at = now()
  where company_id = p_company_id
    and user_id = p_user_id
    and status = 'approved';

  if not found then
    raise exception
      'Colaborador aprovado não encontrado.';
  end if;

  return true;
end;
$$;


revoke all
on function public.update_company_collaborator_role(
  uuid,
  uuid,
  text
)
from public;

grant execute
on function public.update_company_collaborator_role(
  uuid,
  uuid,
  text
)
to authenticated;


-- =========================================================
-- REMOVER / DESVINCULAR COLABORADOR
--
-- Nao apagamos o registro.
-- Mudamos para cancelled para preservar historico.
-- =========================================================

create or replace function public.remove_company_collaborator(
  p_company_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_manage_company_profile(
    p_company_id
  ) then
    raise exception
      'Você não possui permissão para administrar esta empresa.';
  end if;

  update public.company_collaborators
  set
    status = 'cancelled',
    reviewed_at = now(),
    reviewed_by = auth.uid(),
    updated_at = now()
  where company_id = p_company_id
    and user_id = p_user_id
    and status = 'approved';

  if not found then
    raise exception
      'Colaborador aprovado não encontrado.';
  end if;

  return true;
end;
$$;


revoke all
on function public.remove_company_collaborator(
  uuid,
  uuid
)
from public;

grant execute
on function public.remove_company_collaborator(
  uuid,
  uuid
)
to authenticated;


-- =========================================================
-- ALTERAR PAPEL DE MEMBRO INTERNO
--
-- Nesta fase:
-- owner permanece protegido.
-- Somente admins podem ser alterados.
-- Transferencia de propriedade sera fluxo separado.
-- =========================================================

create or replace function public.update_company_member_role(
  p_company_id uuid,
  p_user_id uuid,
  p_role text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_role text;
  v_requester_role text;
begin
  select cm.role
  into v_requester_role
  from public.company_members cm
  where cm.company_id = p_company_id
    and cm.user_id = auth.uid();

  if v_requester_role <> 'owner' then
    raise exception
      'Somente o proprietário pode alterar administradores.';
  end if;

  if p_user_id = auth.uid() then
    raise exception
      'O proprietário não pode alterar a própria função por esta tela.';
  end if;

  if p_role not in ('admin') then
    raise exception
      'Função interna inválida.';
  end if;

  select cm.role
  into v_target_role
  from public.company_members cm
  where cm.company_id = p_company_id
    and cm.user_id = p_user_id;

  if v_target_role is null then
    raise exception
      'Membro não encontrado.';
  end if;

  if v_target_role = 'owner' then
    raise exception
      'O proprietário não pode ser alterado por esta função.';
  end if;

  update public.company_members
  set role = p_role
  where company_id = p_company_id
    and user_id = p_user_id;

  return true;
end;
$$;


revoke all
on function public.update_company_member_role(
  uuid,
  uuid,
  text
)
from public;

grant execute
on function public.update_company_member_role(
  uuid,
  uuid,
  text
)
to authenticated;