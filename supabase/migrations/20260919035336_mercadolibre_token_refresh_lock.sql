alter table public.mercadolibre_connection
  add column if not exists refresh_lock_until timestamptz;

create or replace function public.mercadolibre_acquire_refresh_lock()
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_acquired boolean := false;
begin
  update public.mercadolibre_connection
  set refresh_lock_until = now() + interval '30 seconds',
      updated_at = now()
  where id = 1
    and status = 'connected'
    and (refresh_lock_until is null or refresh_lock_until < now())
  returning true into v_acquired;

  return coalesce(v_acquired,false);
end;
$$;

revoke all on function public.mercadolibre_acquire_refresh_lock() from public, anon, authenticated;
grant execute on function public.mercadolibre_acquire_refresh_lock() to service_role;

create or replace function public.mercadolibre_release_refresh_lock(p_error text default null)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.mercadolibre_connection
  set refresh_lock_until = null,
      last_error = case when p_error is null then last_error else left(p_error,500) end,
      status = case when p_error is null then status else 'error' end,
      updated_at = now()
  where id = 1;
$$;

revoke all on function public.mercadolibre_release_refresh_lock(text) from public, anon, authenticated;
grant execute on function public.mercadolibre_release_refresh_lock(text) to service_role;

create or replace function public.mercadolibre_store_tokens(
  p_access_token text,
  p_refresh_token text,
  p_user_id bigint,
  p_site_id text,
  p_nickname text,
  p_token_type text,
  p_scope text,
  p_expires_in integer
)
returns void
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  v_access_id uuid;
  v_refresh_id uuid;
  v_now timestamptz := now();
begin
  if coalesce(length(p_access_token),0) < 10 then
    raise exception 'invalid access token';
  end if;

  select access_secret_id, refresh_secret_id
    into v_access_id, v_refresh_id
  from public.mercadolibre_connection
  where id = 1
  for update;

  if v_access_id is null then
    select id into v_access_id
    from vault.decrypted_secrets
    where name = 'cardnest_mercadolibre_access_token'
    limit 1;
  end if;

  if v_access_id is null then
    v_access_id := vault.create_secret(
      p_access_token,
      'cardnest_mercadolibre_access_token',
      'CardNest Mercado Libre access token'
    );
  else
    perform vault.update_secret(v_access_id, p_access_token);
  end if;

  if coalesce(length(p_refresh_token),0) >= 10 then
    if v_refresh_id is null then
      select id into v_refresh_id
      from vault.decrypted_secrets
      where name = 'cardnest_mercadolibre_refresh_token'
      limit 1;
    end if;

    if v_refresh_id is null then
      v_refresh_id := vault.create_secret(
        p_refresh_token,
        'cardnest_mercadolibre_refresh_token',
        'CardNest Mercado Libre refresh token'
      );
    else
      perform vault.update_secret(v_refresh_id, p_refresh_token);
    end if;
  end if;

  insert into public.mercadolibre_connection (
    id,user_id,site_id,nickname,token_type,scope,
    access_secret_id,refresh_secret_id,expires_at,
    connected_at,last_refresh_at,updated_at,status,last_error,refresh_lock_until
  )
  values (
    1,p_user_id,p_site_id,p_nickname,p_token_type,p_scope,
    v_access_id,v_refresh_id,v_now + make_interval(secs => greatest(coalesce(p_expires_in,0),60)),
    v_now,v_now,v_now,'connected',null,null
  )
  on conflict (id) do update set
    user_id = excluded.user_id,
    site_id = excluded.site_id,
    nickname = excluded.nickname,
    token_type = excluded.token_type,
    scope = excluded.scope,
    access_secret_id = excluded.access_secret_id,
    refresh_secret_id = coalesce(excluded.refresh_secret_id, public.mercadolibre_connection.refresh_secret_id),
    expires_at = excluded.expires_at,
    connected_at = coalesce(public.mercadolibre_connection.connected_at, excluded.connected_at),
    last_refresh_at = excluded.last_refresh_at,
    updated_at = excluded.updated_at,
    status = 'connected',
    last_error = null,
    refresh_lock_until = null;
end;
$$;
