begin;

-- =========================================================
-- FIO - CENTRAL UNICA DE MENSAGENS
-- =========================================================
-- Conversas diretas, grupos de obra e grupos internos de empresa.
-- A visibilidade sempre acompanha o vinculo ativo do usuario.

create table if not exists public.fio_conversations (
  id uuid primary key default gen_random_uuid(),
  conversation_type text not null
    check (conversation_type in ('direct', 'work', 'company')),
  work_id uuid references public.works(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  direct_key text,
  created_by uuid not null references auth.users(id) on delete restrict,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fio_conversations_context_check check (
    (
      conversation_type = 'work'
      and work_id is not null
      and company_id is null
      and direct_key is null
    )
    or (
      conversation_type = 'company'
      and company_id is not null
      and work_id is null
      and direct_key is null
    )
    or (
      conversation_type = 'direct'
      and direct_key is not null
      and (
        (work_id is not null and company_id is null)
        or (company_id is not null and work_id is null)
      )
    )
  )
);

create unique index if not exists fio_conversations_work_unique_idx
on public.fio_conversations(work_id)
where conversation_type = 'work' and active = true;

create unique index if not exists fio_conversations_company_unique_idx
on public.fio_conversations(company_id)
where conversation_type = 'company' and active = true;

create unique index if not exists fio_conversations_direct_unique_idx
on public.fio_conversations(direct_key)
where conversation_type = 'direct' and active = true;

create table if not exists public.fio_conversation_members (
  conversation_id uuid not null
    references public.fio_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  active boolean not null default true,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index if not exists fio_conversation_members_user_idx
on public.fio_conversation_members(user_id, active, conversation_id);

create table if not exists public.fio_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null
    references public.fio_conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete restrict,
  body text,
  message_type text not null default 'text'
    check (message_type in ('text', 'image', 'file')),
  storage_path text,
  file_name text,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  created_at timestamptz not null default now(),
  constraint fio_messages_content_check check (
    (
      message_type = 'text'
      and body is not null
      and nullif(btrim(body), '') is not null
      and storage_path is null
      and file_name is null
    )
    or (
      message_type in ('image', 'file')
      and storage_path is not null
      and file_name is not null
    )
  )
);

create index if not exists fio_messages_conversation_created_idx
on public.fio_messages(conversation_id, created_at desc);

do $fio_realtime$
begin
  if exists (
    select 1 from pg_catalog.pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'fio_messages'
  ) then
    alter publication supabase_realtime add table public.fio_messages;
  end if;
end;
$fio_realtime$;

alter table public.fio_notifications
add column if not exists conversation_id uuid
references public.fio_conversations(id) on delete cascade;

create index if not exists fio_notifications_conversation_idx
on public.fio_notifications(conversation_id, user_id, created_at desc)
where conversation_id is not null;

alter table public.fio_conversations enable row level security;
alter table public.fio_conversation_members enable row level security;
alter table public.fio_messages enable row level security;


create or replace function public.can_access_fio_conversation(
  p_conversation_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.fio_conversations c
    join public.fio_conversation_members cm
      on cm.conversation_id = c.id
     and cm.user_id = auth.uid()
     and cm.active = true
    where c.id = p_conversation_id
      and c.active = true
      and (
        (c.work_id is not null and public.is_work_participant(c.work_id))
        or (
          c.company_id is not null
          and public.can_use_company_context(c.company_id)
        )
      )
  );
$$;

revoke all on function public.can_access_fio_conversation(uuid) from public;
grant execute on function public.can_access_fio_conversation(uuid) to authenticated;


create or replace function public.can_send_fio_conversation(
  p_conversation_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.fio_conversations c
    join public.fio_conversation_members cm
      on cm.conversation_id = c.id
     and cm.user_id = auth.uid()
     and cm.active = true
    where c.id = p_conversation_id
      and c.active = true
      and (
        (
          c.work_id is not null
          and exists (
            select 1
            from public.work_participants wp
            where wp.work_id = c.work_id
              and wp.user_id = auth.uid()
              and wp.status = 'active'
              and wp.removed_at is null
              and wp.access_level in ('owner', 'manager', 'collaborator')
          )
        )
        or (
          c.company_id is not null
          and public.can_use_company_context(c.company_id)
        )
      )
  );
$$;

revoke all on function public.can_send_fio_conversation(uuid) from public;
grant execute on function public.can_send_fio_conversation(uuid) to authenticated;


drop policy if exists fio_conversations_select on public.fio_conversations;
create policy fio_conversations_select
on public.fio_conversations
for select to authenticated
using (public.can_access_fio_conversation(id));

drop policy if exists fio_conversation_members_select
on public.fio_conversation_members;
create policy fio_conversation_members_select
on public.fio_conversation_members
for select to authenticated
using (public.can_access_fio_conversation(conversation_id));

drop policy if exists fio_messages_select on public.fio_messages;
create policy fio_messages_select
on public.fio_messages
for select to authenticated
using (public.can_access_fio_conversation(conversation_id));

revoke all on public.fio_conversations from anon, authenticated;
revoke all on public.fio_conversation_members from anon, authenticated;
revoke all on public.fio_messages from anon, authenticated;
grant select on public.fio_conversations to authenticated;
grant select on public.fio_conversation_members to authenticated;
grant select on public.fio_messages to authenticated;


insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'fio-message-files',
  'fio-message-files',
  false,
  52428800,
  null
)
on conflict (id) do update
set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists fio_message_files_select on storage.objects;
create policy fio_message_files_select
on storage.objects
for select to authenticated
using (
  bucket_id = 'fio-message-files'
  and exists (
    select 1
    from public.fio_messages m
    where m.storage_path = storage.objects.name
      and public.can_access_fio_conversation(m.conversation_id)
  )
);

drop policy if exists fio_message_files_insert on storage.objects;
create policy fio_message_files_insert
on storage.objects
for insert to authenticated
with check (
  bucket_id = 'fio-message-files'
  and exists (
    select 1
    from public.fio_conversations c
    where c.id::text = (storage.foldername(name))[1]
      and public.can_send_fio_conversation(c.id)
  )
);

drop policy if exists fio_message_files_delete on storage.objects;
create policy fio_message_files_delete
on storage.objects
for delete to authenticated
using (
  bucket_id = 'fio-message-files'
  and exists (
    select 1
    from public.fio_conversations c
    where c.id::text = (storage.foldername(name))[1]
      and public.can_send_fio_conversation(c.id)
  )
  and not exists (
    select 1
    from public.fio_messages m
    where m.storage_path = storage.objects.name
  )
);


create or replace function public.get_fio_message_contexts()
returns table (
  context_type text,
  context_id uuid,
  context_title text,
  context_detail text,
  can_send boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    'work'::text,
    w.id,
    coalesce(nullif(btrim(w.code), ''), 'Obra') || ' · ' || w.client_name,
    w.address,
    wp.access_level in ('owner', 'manager', 'collaborator')
  from public.work_participants wp
  join public.works w on w.id = wp.work_id
  where wp.user_id = auth.uid()
    and wp.status = 'active'
    and wp.removed_at is null

  union all

  select
    'company'::text,
    gc.company_id,
    gc.company_name,
    case
      when gc.relationship_type = 'member' then 'Equipe interna'
      else coalesce(gc.role_title, 'Colaborador')
    end,
    true
  from public.get_my_company_contexts() gc

  order by 1, 3;
$$;

revoke all on function public.get_fio_message_contexts() from public;
grant execute on function public.get_fio_message_contexts() to authenticated;


create or replace function public.get_fio_direct_candidates()
returns table (
  context_type text,
  context_id uuid,
  context_title text,
  user_id uuid,
  full_name text,
  avatar_url text,
  role_title text
)
language sql
stable
security definer
set search_path = ''
as $$
  with work_candidates as (
    select
      'work'::text as context_type,
      w.id as context_id,
      coalesce(nullif(btrim(w.code), ''), 'Obra') || ' · ' || w.client_name
        as context_title,
      other.user_id,
      coalesce(nullif(btrim(p.full_name), ''), 'Participante') as full_name,
      p.avatar_url,
      coalesce(other.role_title, p.job_title) as role_title
    from public.work_participants mine
    join public.works w on w.id = mine.work_id
    join public.work_participants other
      on other.work_id = mine.work_id
     and other.user_id <> auth.uid()
     and other.status = 'active'
     and other.removed_at is null
    left join public.profiles p on p.id = other.user_id
    where mine.user_id = auth.uid()
      and mine.status = 'active'
      and mine.removed_at is null
      and mine.access_level in ('owner', 'manager', 'collaborator')
  ),
  company_people as (
    select cm.company_id, cm.user_id, cm.role::text as role_title
    from public.company_members cm
    where cm.status = 'active'
    union
    select cc.company_id, cc.user_id, cc.role_title
    from public.company_collaborators cc
    where cc.status = 'approved'
  ),
  company_candidates as (
    select distinct on (gc.company_id, cp.user_id)
      'company'::text as context_type,
      gc.company_id as context_id,
      gc.company_name as context_title,
      cp.user_id,
      coalesce(nullif(btrim(p.full_name), ''), 'Profissional') as full_name,
      p.avatar_url,
      coalesce(cp.role_title, p.job_title) as role_title
    from public.get_my_company_contexts() gc
    join company_people cp
      on cp.company_id = gc.company_id
     and cp.user_id <> auth.uid()
    left join public.profiles p on p.id = cp.user_id
    order by gc.company_id, cp.user_id, full_name
  )
  select * from work_candidates
  union all
  select * from company_candidates
  order by full_name, context_title;
$$;

revoke all on function public.get_fio_direct_candidates() from public;
grant execute on function public.get_fio_direct_candidates() to authenticated;


create or replace function public.open_fio_conversation(
  p_conversation_type text,
  p_context_id uuid,
  p_user_id uuid default null,
  p_direct_context_type text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversation_id uuid;
  v_direct_key text;
  v_first_user text;
  v_second_user text;
begin
  if auth.uid() is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  if p_conversation_type = 'work' then
    if not public.is_work_participant(p_context_id) then
      raise exception 'Voce nao possui acesso a esta obra.';
    end if;

    insert into public.fio_conversations (
      conversation_type, work_id, created_by
    ) values (
      'work', p_context_id, auth.uid()
    ) on conflict do nothing
    returning id into v_conversation_id;

    if v_conversation_id is null then
      select c.id into v_conversation_id
      from public.fio_conversations c
      where c.conversation_type = 'work'
        and c.work_id = p_context_id
        and c.active = true;
    end if;

    insert into public.fio_conversation_members (conversation_id, user_id)
    select v_conversation_id, wp.user_id
    from public.work_participants wp
    where wp.work_id = p_context_id
      and wp.status = 'active'
      and wp.removed_at is null
    on conflict (conversation_id, user_id) do update set active = true;

  elsif p_conversation_type = 'company' then
    if not public.can_use_company_context(p_context_id) then
      raise exception 'Voce nao possui acesso a esta empresa.';
    end if;

    insert into public.fio_conversations (
      conversation_type, company_id, created_by
    ) values (
      'company', p_context_id, auth.uid()
    ) on conflict do nothing
    returning id into v_conversation_id;

    if v_conversation_id is null then
      select c.id into v_conversation_id
      from public.fio_conversations c
      where c.conversation_type = 'company'
        and c.company_id = p_context_id
        and c.active = true;
    end if;

    insert into public.fio_conversation_members (conversation_id, user_id)
    select v_conversation_id, people.user_id
    from (
      select cm.user_id
      from public.company_members cm
      where cm.company_id = p_context_id and cm.status = 'active'
      union
      select cc.user_id
      from public.company_collaborators cc
      where cc.company_id = p_context_id and cc.status = 'approved'
    ) people
    on conflict (conversation_id, user_id) do update set active = true;

  elsif p_conversation_type = 'direct' then
    if p_user_id is null or p_user_id = auth.uid() then
      raise exception 'Escolha outro participante para a conversa.';
    end if;
    if p_direct_context_type not in ('work', 'company') then
      raise exception 'Contexto da conversa direta invalido.';
    end if;

    if p_direct_context_type = 'work' then
      if not exists (
        select 1
        from public.work_participants mine
        join public.work_participants other
          on other.work_id = mine.work_id
         and other.user_id = p_user_id
         and other.status = 'active'
         and other.removed_at is null
        where mine.work_id = p_context_id
          and mine.user_id = auth.uid()
          and mine.status = 'active'
          and mine.removed_at is null
          and mine.access_level in ('owner', 'manager', 'collaborator')
      ) then
        raise exception 'Voce nao pode iniciar esta conversa.';
      end if;
    else
      if not public.can_use_company_context(p_context_id)
        or not exists (
          select 1
          from (
            select cm.user_id
            from public.company_members cm
            where cm.company_id = p_context_id and cm.status = 'active'
            union
            select cc.user_id
            from public.company_collaborators cc
            where cc.company_id = p_context_id and cc.status = 'approved'
          ) people
          where people.user_id = p_user_id
        )
      then
        raise exception 'Voce nao pode iniciar esta conversa.';
      end if;
    end if;

    v_first_user := least(auth.uid()::text, p_user_id::text);
    v_second_user := greatest(auth.uid()::text, p_user_id::text);
    v_direct_key := p_direct_context_type || ':' || p_context_id::text
      || ':' || v_first_user || ':' || v_second_user;

    insert into public.fio_conversations (
      conversation_type,
      work_id,
      company_id,
      direct_key,
      created_by
    ) values (
      'direct',
      case when p_direct_context_type = 'work' then p_context_id else null end,
      case when p_direct_context_type = 'company' then p_context_id else null end,
      v_direct_key,
      auth.uid()
    ) on conflict do nothing
    returning id into v_conversation_id;

    if v_conversation_id is null then
      select c.id into v_conversation_id
      from public.fio_conversations c
      where c.conversation_type = 'direct'
        and c.direct_key = v_direct_key
        and c.active = true;
    end if;

    insert into public.fio_conversation_members (conversation_id, user_id)
    values
      (v_conversation_id, auth.uid()),
      (v_conversation_id, p_user_id)
    on conflict (conversation_id, user_id) do update set active = true;

  else
    raise exception 'Tipo de conversa invalido.';
  end if;

  update public.fio_conversation_members
  set last_read_at = now()
  where conversation_id = v_conversation_id
    and user_id = auth.uid();

  return v_conversation_id;
end;
$$;

revoke all on function public.open_fio_conversation(text, uuid, uuid, text)
from public;
grant execute on function public.open_fio_conversation(text, uuid, uuid, text)
to authenticated;


create or replace function public.get_fio_conversations()
returns table (
  conversation_id uuid,
  conversation_type text,
  work_id uuid,
  company_id uuid,
  title text,
  context_label text,
  avatar_url text,
  last_message text,
  last_message_type text,
  last_message_at timestamptz,
  unread_count bigint,
  can_send boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id,
    c.conversation_type,
    c.work_id,
    c.company_id,
    case
      when c.conversation_type = 'direct'
        then coalesce(nullif(btrim(other_profile.full_name), ''), 'Participante')
      when c.conversation_type = 'work'
        then coalesce(nullif(btrim(w.code), ''), 'Obra') || ' · ' || w.client_name
      else company.name
    end,
    case
      when c.work_id is not null
        then coalesce(nullif(btrim(w.code), ''), 'Obra') || ' · ' || w.client_name
      else company.name
    end,
    case when c.conversation_type = 'direct' then other_profile.avatar_url else null end,
    case
      when last_message.message_type = 'text' then last_message.body
      when last_message.message_type = 'image' then 'Foto'
      when last_message.message_type = 'file' then coalesce(last_message.file_name, 'Documento')
      else 'Conversa iniciada'
    end,
    last_message.message_type,
    coalesce(last_message.created_at, c.created_at),
    (
      select count(*)
      from public.fio_messages unread
      where unread.conversation_id = c.id
        and unread.sender_id <> auth.uid()
        and unread.created_at > member.last_read_at
    ),
    public.can_send_fio_conversation(c.id)
  from public.fio_conversations c
  join public.fio_conversation_members member
    on member.conversation_id = c.id
   and member.user_id = auth.uid()
   and member.active = true
  left join public.works w on w.id = c.work_id
  left join public.companies company on company.id = c.company_id
  left join lateral (
    select cm.user_id
    from public.fio_conversation_members cm
    where cm.conversation_id = c.id
      and cm.user_id <> auth.uid()
      and cm.active = true
    order by cm.joined_at
    limit 1
  ) other_member on true
  left join public.profiles other_profile on other_profile.id = other_member.user_id
  left join lateral (
    select m.body, m.message_type, m.file_name, m.created_at
    from public.fio_messages m
    where m.conversation_id = c.id
    order by m.created_at desc
    limit 1
  ) last_message on true
  where public.can_access_fio_conversation(c.id)
  order by coalesce(last_message.created_at, c.created_at) desc;
$$;

revoke all on function public.get_fio_conversations() from public;
grant execute on function public.get_fio_conversations() to authenticated;


create or replace function public.get_fio_messages(
  p_conversation_id uuid
)
returns table (
  message_id uuid,
  sender_id uuid,
  sender_name text,
  sender_avatar_url text,
  body text,
  message_type text,
  storage_path text,
  file_name text,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.can_access_fio_conversation(p_conversation_id) then
    raise exception 'Voce nao possui acesso a esta conversa.';
  end if;

  return query
  select ordered.*
  from (
    select
      m.id,
      m.sender_id,
      coalesce(nullif(btrim(p.full_name), ''), 'Participante'),
      p.avatar_url,
      m.body,
      m.message_type,
      m.storage_path,
      m.file_name,
      m.mime_type,
      m.size_bytes,
      m.created_at
    from public.fio_messages m
    left join public.profiles p on p.id = m.sender_id
    where m.conversation_id = p_conversation_id
    order by m.created_at desc
    limit 200
  ) ordered
  order by ordered.created_at;
end;
$$;

revoke all on function public.get_fio_messages(uuid) from public;
grant execute on function public.get_fio_messages(uuid) to authenticated;


create or replace function public.send_fio_message(
  p_conversation_id uuid,
  p_body text default null,
  p_message_type text default 'text',
  p_storage_path text default null,
  p_file_name text default null,
  p_mime_type text default null,
  p_size_bytes bigint default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_message_id uuid;
  v_body text;
begin
  if not public.can_send_fio_conversation(p_conversation_id) then
    raise exception 'Seu perfil nao pode enviar mensagens nesta conversa.';
  end if;

  v_body := nullif(btrim(p_body), '');
  if v_body is not null and char_length(v_body) > 4000 then
    raise exception 'A mensagem deve possuir no maximo 4000 caracteres.';
  end if;
  if p_message_type not in ('text', 'image', 'file') then
    raise exception 'Tipo de mensagem invalido.';
  end if;
  if p_message_type = 'text' and v_body is null then
    raise exception 'Escreva uma mensagem.';
  end if;
  if p_message_type in ('image', 'file') then
    if nullif(btrim(p_storage_path), '') is null
      or nullif(btrim(p_file_name), '') is null
      or p_storage_path not like p_conversation_id::text || '/%'
    then
      raise exception 'Arquivo da mensagem invalido.';
    end if;
    if coalesce(p_size_bytes, 0) > 52428800 then
      raise exception 'O arquivo deve possuir no maximo 50 MB.';
    end if;
  end if;

  insert into public.fio_messages (
    conversation_id,
    sender_id,
    body,
    message_type,
    storage_path,
    file_name,
    mime_type,
    size_bytes
  ) values (
    p_conversation_id,
    auth.uid(),
    v_body,
    p_message_type,
    nullif(btrim(p_storage_path), ''),
    nullif(btrim(p_file_name), ''),
    nullif(btrim(p_mime_type), ''),
    p_size_bytes
  ) returning id into v_message_id;

  update public.fio_conversations
  set updated_at = now()
  where id = p_conversation_id;

  update public.fio_conversation_members
  set last_read_at = now()
  where conversation_id = p_conversation_id
    and user_id = auth.uid();

  return v_message_id;
end;
$$;

revoke all on function public.send_fio_message(
  uuid, text, text, text, text, text, bigint
) from public;
grant execute on function public.send_fio_message(
  uuid, text, text, text, text, text, bigint
) to authenticated;


create or replace function public.mark_fio_conversation_read(
  p_conversation_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_access_fio_conversation(p_conversation_id) then
    raise exception 'Voce nao possui acesso a esta conversa.';
  end if;

  update public.fio_conversation_members
  set last_read_at = now()
  where conversation_id = p_conversation_id
    and user_id = auth.uid();

  update public.fio_notifications
  set read_at = coalesce(read_at, now())
  where user_id = auth.uid()
    and conversation_id = p_conversation_id;
end;
$$;

revoke all on function public.mark_fio_conversation_read(uuid) from public;
grant execute on function public.mark_fio_conversation_read(uuid) to authenticated;


create or replace function public.get_my_message_unread_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(unread.total), 0)::integer
  from public.fio_conversation_members cm
  join public.fio_conversations c on c.id = cm.conversation_id
  cross join lateral (
    select count(*) as total
    from public.fio_messages m
    where m.conversation_id = cm.conversation_id
      and m.sender_id <> auth.uid()
      and m.created_at > cm.last_read_at
  ) unread
  where cm.user_id = auth.uid()
    and cm.active = true
    and c.active = true
    and public.can_access_fio_conversation(c.id);
$$;

revoke all on function public.get_my_message_unread_count() from public;
grant execute on function public.get_my_message_unread_count() to authenticated;


create or replace function public.notify_fio_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversation public.fio_conversations%rowtype;
  v_sender_name text;
begin
  select * into v_conversation
  from public.fio_conversations c
  where c.id = new.conversation_id;

  select coalesce(nullif(btrim(p.full_name), ''), 'Participante')
  into v_sender_name
  from public.profiles p
  where p.id = new.sender_id;

  insert into public.fio_notifications (
    user_id,
    work_id,
    conversation_id,
    title,
    description
  )
  select
    cm.user_id,
    v_conversation.work_id,
    new.conversation_id,
    'Nova mensagem de ' || coalesce(v_sender_name, 'Participante'),
    case
      when new.message_type = 'text' then left(new.body, 180)
      when new.message_type = 'image' then 'Enviou uma foto.'
      else 'Enviou o documento ' || coalesce(new.file_name, 'Arquivo') || '.'
    end
  from public.fio_conversation_members cm
  where cm.conversation_id = new.conversation_id
    and cm.active = true
    and cm.user_id <> new.sender_id;

  return new;
end;
$$;

drop trigger if exists notify_fio_message_trigger on public.fio_messages;
create trigger notify_fio_message_trigger
after insert on public.fio_messages
for each row execute function public.notify_fio_message();


drop policy if exists fio_notifications_select
on public.fio_notifications;

create policy fio_notifications_select
on public.fio_notifications
for select to authenticated
using (
  user_id = auth.uid()
  and (
    (
      conversation_id is not null
      and public.can_access_fio_conversation(conversation_id)
    )
    or (
      conversation_id is null
      and (
        event_id is null
        or public.can_access_work_event(event_id)
      )
    )
  )
);


drop function if exists public.get_my_notifications();

create function public.get_my_notifications()
returns table (
  id uuid,
  work_id uuid,
  event_id uuid,
  event_type text,
  entity_type text,
  entity_id text,
  target_section text,
  title text,
  description text,
  read_at timestamptz,
  created_at timestamptz,
  can_confirm_visit boolean,
  can_edit_visit boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    n.id,
    n.work_id,
    n.event_id,
    case
      when n.conversation_id is not null then 'MENSAGEM_RECEBIDA'
      else we.event_type
    end,
    case
      when n.conversation_id is not null then 'message'
      when coalesce(we.event_type, '') like 'DOCUMENTO_%' then 'document'
      when coalesce(we.event_type, '') like 'VISITA_%' then 'visit'
      when coalesce(we.event_type, '') like 'PENDENCIA_%' then 'pending'
      else 'work'
    end,
    case
      when n.conversation_id is not null then n.conversation_id::text
      when coalesce(we.event_type, '') like 'DOCUMENTO_%'
        then we.metadata ->> 'document_id'
      when coalesce(we.event_type, '') like 'VISITA_%'
        then we.metadata ->> 'visit_id'
      when coalesce(we.event_type, '') like 'PENDENCIA_%'
        then we.metadata ->> 'pending_item_id'
      else null
    end,
    case
      when n.conversation_id is not null then 'messages'
      when coalesce(we.event_type, '') like 'DOCUMENTO_%'
        and d.category = 'project' then 'projects'
      when coalesce(we.event_type, '') like 'DOCUMENTO_%'
        and d.category = 'measurement' then 'measurements'
      when coalesce(we.event_type, '') like 'DOCUMENTO_%' then 'documents'
      when coalesce(we.event_type, '') like 'PENDENCIA_%' then 'pending'
      when coalesce(we.event_type, '') like 'FOTO_%' then 'photos'
      when coalesce(we.event_type, '') like '%AMBIENTE%' then 'environments'
      else 'fio'
    end,
    n.title,
    n.description,
    n.read_at,
    n.created_at,
    coalesce(
      v.status in ('scheduled', 'rescheduled')
      and (
        public.can_manage_work(v.work_id)
        or (
          v.responsible_user_id = auth.uid()
          and public.can_write_work(v.work_id)
        )
      ),
      false
    ),
    coalesce(
      v.status in ('scheduled', 'confirmed', 'rescheduled')
      and (
        public.can_manage_work(v.work_id)
        or (
          v.responsible_user_id = auth.uid()
          and public.can_write_work(v.work_id)
        )
      ),
      false
    )
  from public.fio_notifications n
  left join public.work_events we on we.id = n.event_id
  left join public.work_documents d
    on d.id::text = we.metadata ->> 'document_id'
  left join public.work_visits v
    on v.id::text = we.metadata ->> 'visit_id'
  where n.user_id = auth.uid()
    and (
      (
        n.conversation_id is not null
        and public.can_access_fio_conversation(n.conversation_id)
      )
      or (
        n.conversation_id is null
        and n.event_id is not null
        and public.can_access_work_event(n.event_id)
      )
    )
  order by n.created_at desc
  limit 50;
$$;

revoke all on function public.get_my_notifications() from public;
grant execute on function public.get_my_notifications() to authenticated;


create or replace function public.get_my_notification_unread_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.fio_notifications n
  where n.user_id = auth.uid()
    and n.read_at is null
    and (
      (
        n.conversation_id is not null
        and public.can_access_fio_conversation(n.conversation_id)
      )
      or (
        n.conversation_id is null
        and (
          n.event_id is null
          or public.can_access_work_event(n.event_id)
        )
      )
    );
$$;

revoke all on function public.get_my_notification_unread_count() from public;
grant execute on function public.get_my_notification_unread_count() to authenticated;

commit;
