-- =========================================================
-- FIO
-- CONVITES PARA EQUIPE
-- =========================================================
--
-- Um vínculo profissional pode começar de duas formas:
--
-- professional_request
-- Profissional solicita vínculo com a empresa.
--
-- company_invite
-- Empresa convida o profissional.
--
-- Depois da aprovação/aceite, ambos representam o mesmo
-- vínculo profissional em company_collaborators.
-- =========================================================


-- =========================================================
-- ORIGEM DO VINCULO
-- =========================================================

alter table public.company_collaborators
  add column if not exists request_origin text
    not null
    default 'professional_request',

  add column if not exists initiated_by uuid
    references auth.users(id);


-- Registros anteriores vieram do fluxo em que
-- o próprio profissional solicitava o vínculo.

update public.company_collaborators
set initiated_by = user_id
where initiated_by is null;


alter table public.company_collaborators
  drop constraint if exists
    company_collaborators_request_origin_check;


alter table public.company_collaborators
  add constraint
    company_collaborators_request_origin_check
  check (
    request_origin in (
      'professional_request',
      'company_invite'
    )
  );


-- =========================================================
-- SOLICITACAO FEITA PELO PROFISSIONAL
--
-- Atualizamos a função existente para respeitar convites
-- pendentes e impedir vínculo duplicado com membros internos.
-- =========================================================

create or replace function public.request_company_link(
  p_company_id uuid,
  p_role_title text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_link_id uuid;
  v_status text;
  v_origin text;
  v_role_title text;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception
      'Usuário não autenticado.';
  end if;

  v_role_title :=
    nullif(
      trim(p_role_title),
      ''
    );

  if v_role_title is null then
    raise exception
      'Informe sua função na empresa.';
  end if;


  if exists (
    select 1
    from public.company_members cm
    where cm.company_id = p_company_id
      and cm.user_id = v_user_id
  ) then
    raise exception
      'Você já faz parte desta empresa.';
  end if;


  select
    cc.id,
    cc.status,
    cc.request_origin
  into
    v_link_id,
    v_status,
    v_origin
  from public.company_collaborators cc
  where cc.company_id = p_company_id
    and cc.user_id = v_user_id
  limit 1;


  if v_link_id is null then

    insert into public.company_collaborators (
      company_id,
      user_id,
      role_title,
      status,
      request_origin,
      initiated_by,
      requested_at
    )
    values (
      p_company_id,
      v_user_id,
      v_role_title,
      'pending',
      'professional_request',
      v_user_id,
      now()
    )
    returning id
    into v_link_id;

    return v_link_id;

  end if;


  if v_status = 'approved' then
    raise exception
      'Você já possui vínculo ativo com esta empresa.';
  end if;


  if
    v_status = 'pending'
    and v_origin = 'company_invite'
  then
    raise exception
      'Você já possui um convite pendente desta empresa.';
  end if;


  update public.company_collaborators
  set
    role_title = v_role_title,
    status = 'pending',
    request_origin =
      'professional_request',
    initiated_by = v_user_id,
    requested_at = now(),
    reviewed_at = null,
    reviewed_by = null,
    updated_at = now()
  where id = v_link_id;


  return v_link_id;
end;
$$;


revoke all
on function public.request_company_link(
  uuid,
  text
)
from public;


grant execute
on function public.request_company_link(
  uuid,
  text
)
to authenticated;


-- =========================================================
-- EMPRESA REVISA SOLICITACAO DO PROFISSIONAL
-- =========================================================

create or replace function public.review_company_link(
  p_link_id uuid,
  p_decision text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_reviewer_id uuid;
begin
  v_reviewer_id := auth.uid();

  if v_reviewer_id is null then
    raise exception
      'Usuário não autenticado.';
  end if;


  if p_decision not in (
    'approved',
    'rejected'
  ) then
    raise exception
      'Decisão inválida.';
  end if;


  select cc.company_id
  into v_company_id
  from public.company_collaborators cc
  where cc.id = p_link_id
    and cc.status = 'pending'
    and cc.request_origin =
      'professional_request';


  if v_company_id is null then
    raise exception
      'Solicitação pendente não encontrada.';
  end if;


  if not public.can_manage_company_profile(
    v_company_id
  ) then
    raise exception
      'Você não possui permissão para revisar esta solicitação.';
  end if;


  update public.company_collaborators
  set
    status = p_decision,
    reviewed_at = now(),
    reviewed_by = v_reviewer_id,
    updated_at = now()
  where id = p_link_id;
end;
$$;


revoke all
on function public.review_company_link(
  uuid,
  text
)
from public;


grant execute
on function public.review_company_link(
  uuid,
  text
)
to authenticated;


-- =========================================================
-- SOLICITACOES PENDENTES RECEBIDAS PELA EMPRESA
--
-- Somente solicitações iniciadas pelo profissional.
-- Convites enviados pela empresa não aparecem aqui.
-- =========================================================

create or replace function public.get_pending_company_links()
returns table (
  link_id uuid,
  company_id uuid,
  company_name text,
  user_id uuid,
  full_name text,
  role_title text,
  status text,
  requested_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    cc.id as link_id,
    cc.company_id,
    c.name as company_name,
    cc.user_id,
    p.full_name,
    cc.role_title,
    cc.status,
    cc.requested_at
  from public.company_collaborators cc

  join public.companies c
    on c.id = cc.company_id

  left join public.profiles p
    on p.id = cc.user_id

  where cc.status = 'pending'
    and cc.request_origin =
      'professional_request'

    and public.can_manage_company_profile(
      cc.company_id
    )

  order by cc.requested_at asc;
$$;


revoke all
on function public.get_pending_company_links()
from public;


grant execute
on function public.get_pending_company_links()
to authenticated;


-- =========================================================
-- BUSCA DE PROFISSIONAIS PARA CONVITE
--
-- Somente owner/admin pode pesquisar candidatos.
-- Exige ao menos 2 caracteres.
--
-- Não mostra:
-- - membros internos da empresa
-- - colaboradores já aprovados
-- - pessoas com vínculo pendente
-- =========================================================

create or replace function public.search_company_invite_candidates(
  p_company_id uuid,
  p_search text
)
returns table (
  user_id uuid,
  full_name text,
  job_title text,
  avatar_url text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_search text;
begin
  if not public.can_manage_company_profile(
    p_company_id
  ) then
    raise exception
      'Você não possui permissão para administrar esta empresa.';
  end if;


  v_search :=
    trim(
      coalesce(
        p_search,
        ''
      )
    );


  if char_length(v_search) < 2 then
    return;
  end if;


  return query

  select
    p.id as user_id,
    coalesce(
      nullif(
        trim(p.full_name),
        ''
      ),
      'Usuário do FIO'
    ) as full_name,
    p.job_title,
    p.avatar_url

  from public.profiles p

  where
    (
      p.full_name ilike
        '%' || v_search || '%'

      or

      coalesce(
        p.job_title,
        ''
      ) ilike
        '%' || v_search || '%'
    )

    and not exists (
      select 1
      from public.company_members cm
      where cm.company_id =
        p_company_id
        and cm.user_id = p.id
    )

    and not exists (
      select 1
      from public.company_collaborators cc
      where cc.company_id =
        p_company_id
        and cc.user_id = p.id
        and cc.status in (
          'approved',
          'pending'
        )
    )

  order by p.full_name

  limit 20;
end;
$$;


revoke all
on function public.search_company_invite_candidates(
  uuid,
  text
)
from public;


grant execute
on function public.search_company_invite_candidates(
  uuid,
  text
)
to authenticated;


-- =========================================================
-- EMPRESA ENVIA CONVITE
-- =========================================================

create or replace function public.invite_company_collaborator(
  p_company_id uuid,
  p_user_id uuid,
  p_role_title text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inviter_id uuid;
  v_link_id uuid;
  v_status text;
  v_origin text;
  v_role_title text;
begin
  v_inviter_id := auth.uid();


  if v_inviter_id is null then
    raise exception
      'Usuário não autenticado.';
  end if;


  if not public.can_manage_company_profile(
    p_company_id
  ) then
    raise exception
      'Você não possui permissão para administrar esta empresa.';
  end if;


  if p_user_id is null then
    raise exception
      'Profissional inválido.';
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


  if not exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
  ) then
    raise exception
      'Profissional não encontrado.';
  end if;


  if exists (
    select 1
    from public.company_members cm
    where cm.company_id = p_company_id
      and cm.user_id = p_user_id
  ) then
    raise exception
      'Esta pessoa já faz parte da empresa.';
  end if;


  select
    cc.id,
    cc.status,
    cc.request_origin
  into
    v_link_id,
    v_status,
    v_origin
  from public.company_collaborators cc
  where cc.company_id = p_company_id
    and cc.user_id = p_user_id
  limit 1;


  if v_link_id is null then

    insert into public.company_collaborators (
      company_id,
      user_id,
      role_title,
      status,
      request_origin,
      initiated_by,
      requested_at
    )
    values (
      p_company_id,
      p_user_id,
      v_role_title,
      'pending',
      'company_invite',
      v_inviter_id,
      now()
    )
    returning id
    into v_link_id;

    return v_link_id;

  end if;


  if v_status = 'approved' then
    raise exception
      'Este profissional já possui vínculo ativo com a empresa.';
  end if;


  if
    v_status = 'pending'
    and v_origin =
      'professional_request'
  then
    raise exception
      'Este profissional já solicitou vínculo com a empresa. Revise a solicitação pendente.';
  end if;


  update public.company_collaborators
  set
    role_title = v_role_title,
    status = 'pending',
    request_origin =
      'company_invite',
    initiated_by = v_inviter_id,
    requested_at = now(),
    reviewed_at = null,
    reviewed_by = null,
    updated_at = now()
  where id = v_link_id;


  return v_link_id;
end;
$$;


revoke all
on function public.invite_company_collaborator(
  uuid,
  uuid,
  text
)
from public;


grant execute
on function public.invite_company_collaborator(
  uuid,
  uuid,
  text
)
to authenticated;


-- =========================================================
-- CONVITES RECEBIDOS PELO PROFISSIONAL
-- =========================================================

create or replace function public.get_my_company_invitations()
returns table (
  link_id uuid,
  company_id uuid,
  company_name text,
  role_title text,
  requested_at timestamptz,
  invited_by uuid,
  invited_by_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    cc.id as link_id,
    cc.company_id,
    c.name as company_name,
    cc.role_title,
    cc.requested_at,
    cc.initiated_by
      as invited_by,

    coalesce(
      nullif(
        trim(inviter.full_name),
        ''
      ),
      'Equipe da empresa'
    ) as invited_by_name

  from public.company_collaborators cc

  join public.companies c
    on c.id = cc.company_id

  left join public.profiles inviter
    on inviter.id =
      cc.initiated_by

  where cc.user_id = auth.uid()
    and cc.status = 'pending'
    and cc.request_origin =
      'company_invite'

  order by cc.requested_at desc;
$$;


revoke all
on function public.get_my_company_invitations()
from public;


grant execute
on function public.get_my_company_invitations()
to authenticated;


-- =========================================================
-- PROFISSIONAL ACEITA OU RECUSA CONVITE
-- =========================================================

create or replace function public.respond_company_invitation(
  p_link_id uuid,
  p_decision text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_company_id uuid;
begin
  v_user_id := auth.uid();


  if v_user_id is null then
    raise exception
      'Usuário não autenticado.';
  end if;


  if p_decision not in (
    'approved',
    'rejected'
  ) then
    raise exception
      'Decisão inválida.';
  end if;


  select cc.company_id
  into v_company_id
  from public.company_collaborators cc
  where cc.id = p_link_id
    and cc.user_id = v_user_id
    and cc.status = 'pending'
    and cc.request_origin =
      'company_invite';


  if v_company_id is null then
    raise exception
      'Convite pendente não encontrado.';
  end if;


  if exists (
    select 1
    from public.company_members cm
    where cm.company_id =
      v_company_id
      and cm.user_id =
        v_user_id
  ) then
    raise exception
      'Você já faz parte desta empresa.';
  end if;


  update public.company_collaborators
  set
    status = p_decision,
    reviewed_at = now(),
    reviewed_by = v_user_id,
    updated_at = now()
  where id = p_link_id;
end;
$$;


revoke all
on function public.respond_company_invitation(
  uuid,
  text
)
from public;


grant execute
on function public.respond_company_invitation(
  uuid,
  text
)
to authenticated;


-- =========================================================
-- MEUS VINCULOS PROFISSIONAIS
--
-- Convites pendentes ficam na área própria de convites.
-- Quando aceitos, aparecem normalmente como vínculo.
-- =========================================================

create or replace function public.get_my_professional_links()
returns table (
  link_id uuid,
  company_id uuid,
  company_name text,
  role_title text,
  status text,
  requested_at timestamptz,
  reviewed_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    cc.id as link_id,
    cc.company_id,
    c.name as company_name,
    cc.role_title,
    cc.status,
    cc.requested_at,
    cc.reviewed_at

  from public.company_collaborators cc

  join public.companies c
    on c.id = cc.company_id

  where cc.user_id = auth.uid()

    and not exists (
      select 1
      from public.company_members cm
      where cm.company_id =
        cc.company_id
        and cm.user_id =
          auth.uid()
    )

    and (
      cc.request_origin =
        'professional_request'

      or

      cc.status = 'approved'
    )

  order by
    case cc.status
      when 'approved' then 0
      when 'pending' then 1
      when 'rejected' then 2
      else 3
    end,
    c.name;
$$;


revoke all
on function public.get_my_professional_links()
from public;


grant execute
on function public.get_my_professional_links()
to authenticated;