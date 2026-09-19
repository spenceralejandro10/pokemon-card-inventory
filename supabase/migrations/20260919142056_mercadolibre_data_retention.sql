create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'cardnest-mercadolibre-data-retention',
  '17 3 * * *',
  $job$
    delete from public.mercadolibre_webhook_events
    where received_at < now() - interval '30 days';

    delete from public.mercadolibre_oauth_sessions
    where created_at < now() - interval '1 day';
  $job$
);

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

  delete from public.mercadolibre_oauth_sessions;
  delete from public.mercadolibre_webhook_events;

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
