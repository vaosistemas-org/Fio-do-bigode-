begin;

create table if not exists public.fio_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null,
  platform text not null default 'ios',
  updated_at timestamptz not null default now(),
  unique(user_id, token)
);

alter table public.fio_push_tokens enable row level security;
revoke all on public.fio_push_tokens from anon, authenticated;

create or replace function public.register_fio_push_token(p_token text, p_platform text default 'ios')
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or nullif(btrim(p_token), '') is null then return; end if;
  insert into public.fio_push_tokens (user_id, token, platform, updated_at)
  values (auth.uid(), btrim(p_token), coalesce(nullif(btrim(p_platform), ''), 'ios'), now())
  on conflict (user_id, token) do update set platform = excluded.platform, updated_at = now();
end;
$$;

revoke all on function public.register_fio_push_token(text, text) from public;
grant execute on function public.register_fio_push_token(text, text) to authenticated;
commit;
