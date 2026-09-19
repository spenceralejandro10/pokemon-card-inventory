-- A transient refresh failure must not permanently disable future token refreshes.
-- The function remains service-role only and serializes refresh rotation per account.
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
    and status in ('connected','error')
    and refresh_secret_id is not null
    and (refresh_lock_until is null or refresh_lock_until < now())
  returning true into v_acquired;

  return coalesce(v_acquired,false);
end;
$$;

revoke all on function public.mercadolibre_acquire_refresh_lock() from public, anon, authenticated;
grant execute on function public.mercadolibre_acquire_refresh_lock() to service_role;
