alter table public.mercadolibre_oauth_sessions
  add column if not exists admin_session_id uuid
  references public.admin_sessions(id) on delete cascade;

create index if not exists idx_mercadolibre_oauth_sessions_admin_session
  on public.mercadolibre_oauth_sessions (admin_session_id);

create or replace function public.mercadolibre_disconnect()
returns void
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  v_access_id uuid;
  v_refresh_id uuid;
begin
  select access_secret_id, refresh_secret_id
    into v_access_id, v_refresh_id
  from public.mercadolibre_connection
  where id = 1
  for update;

  -- A callback started before disconnect must never be able to reconnect later.
  delete from public.mercadolibre_oauth_sessions;

  if v_access_id is not null then
    delete from vault.secrets where id = v_access_id;
  end if;
  if v_refresh_id is not null then
    delete from vault.secrets where id = v_refresh_id;
  end if;

  insert into public.mercadolibre_connection (id,status,updated_at,refresh_lock_until)
  values (1,'disconnected',now(),null)
  on conflict (id) do update set
    user_id = null,
    site_id = null,
    nickname = null,
    token_type = null,
    scope = null,
    access_secret_id = null,
    refresh_secret_id = null,
    expires_at = null,
    connected_at = null,
    last_refresh_at = null,
    refresh_lock_until = null,
    updated_at = now(),
    status = 'disconnected',
    last_error = null;
end;
$$;

revoke all on function public.mercadolibre_disconnect() from public, anon, authenticated;
grant execute on function public.mercadolibre_disconnect() to service_role;
