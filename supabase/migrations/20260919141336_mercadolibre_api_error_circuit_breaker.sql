-- Stop repeated authenticated API calls after authorization or rate-limit errors.
-- Refresh failures remain retryable because Mercado Libre rotates refresh tokens.
drop function if exists public.mercadolibre_get_tokens();

create function public.mercadolibre_get_tokens()
returns table (
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  user_id bigint,
  site_id text,
  nickname text,
  scope text,
  status text,
  last_error text
)
language sql
security definer
set search_path = public, vault, pg_temp
as $$
  select
    a.decrypted_secret,
    r.decrypted_secret,
    c.expires_at,
    c.user_id,
    c.site_id,
    c.nickname,
    c.scope,
    c.status,
    c.last_error
  from public.mercadolibre_connection c
  left join vault.decrypted_secrets a on a.id = c.access_secret_id
  left join vault.decrypted_secrets r on r.id = c.refresh_secret_id
  where c.id = 1
  limit 1;
$$;

revoke all on function public.mercadolibre_get_tokens() from public, anon, authenticated;
grant execute on function public.mercadolibre_get_tokens() to service_role;

create or replace function public.mercadolibre_mark_connection_error(p_error text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.mercadolibre_connection
  set status = 'error',
      last_error = left(coalesce(nullif(p_error, ''), 'api_error'), 500),
      refresh_lock_until = null,
      updated_at = now()
  where id = 1;
$$;

revoke all on function public.mercadolibre_mark_connection_error(text) from public, anon, authenticated;
grant execute on function public.mercadolibre_mark_connection_error(text) to service_role;
