import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CLIENT_ID = Deno.env.get("MERCADOLIBRE_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("MERCADOLIBRE_CLIENT_SECRET") ?? "";
const AUTHORIZATION_ENABLED = Deno.env.get("MERCADOLIBRE_AUTHORIZATION_ENABLED") === "true";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const REDIRECT_URI = "https://cnivcnexsqobipvqxero.supabase.co/functions/v1/mercadolibre-oauth";
const WEBHOOK_URI = "https://cnivcnexsqobipvqxero.supabase.co/functions/v1/mercadolibre-webhook";
const ADMIN_RETURN = "https://spenceralejandro10.github.io/pokemon-card-inventory/admin.html";
const AUTH_BASE = "https://auth.mercadolibre.com.co/authorization";
const EXPECTED_SITE_ID = "MCO";
const MAX_BODY_BYTES = 25 * 1024;
const allowedOrigins = new Set([
  "https://spenceralejandro10.github.io",
  "https://cardnest.co",
  "https://www.cardnest.co",
  "http://localhost:8000",
  "http://127.0.0.1:8000"
]);

const enc = new TextEncoder();
const clean = (v: unknown) => String(v ?? "").trim();
const hex = (bytes: Uint8Array) => Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
const b64url = (bytes: Uint8Array) => {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};
async function sha256Bytes(value: string) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(value)));
}
async function sha256Hex(value: string) {
  return hex(await sha256Bytes(value));
}
async function timedFetch(url: string, init: RequestInit = {}, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
function randomUrlSafe(size: number) {
  return b64url(crypto.getRandomValues(new Uint8Array(size)));
}
async function readLimitedBody(req: Request) {
  if (!req.body) return new Uint8Array();
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return joined;
}
function cors(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "content-type, apikey, x-admin-token",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Vary": "Origin"
  };
  if (allowedOrigins.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}
function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: cors(req) });
}
function redirectStatus(status: string) {
  const u = new URL(ADMIN_RETURN);
  u.searchParams.set("ml", status);
  u.hash = "integrations";
  return Response.redirect(u.toString(), 302);
}

Deno.serve(async (req: Request) => {
  const requestOrigin = req.headers.get("origin") ?? "";
  if ((req.method === "POST" || req.method === "OPTIONS") && requestOrigin && !allowedOrigins.has(requestOrigin)) {
    return json(req, { ok: false, error: "ORIGIN_NOT_ALLOWED" }, 403);
  }
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  if (!SUPABASE_URL || !SERVICE_ROLE || !CLIENT_ID || !CLIENT_SECRET) {
    return json(req, { ok: false, error: "SERVER_CONFIG" }, 503);
  }

  const db = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  async function requireAdmin() {
    const token = clean(req.headers.get("x-admin-token"));
    if (token.length < 40) return null;
    const tokenHash = await sha256Hex(token);
    const now = new Date().toISOString();
    const { data: session } = await db
      .from("admin_sessions")
      .select("id,admin_user_id,expires_at,revoked_at")
      .eq("token_hash", tokenHash)
      .is("revoked_at", null)
      .gt("expires_at", now)
      .maybeSingle();
    if (!session) return null;
    const { data: user } = await db
      .from("admin_users")
      .select("id,display_name,role,is_active")
      .eq("id", session.admin_user_id)
      .eq("is_active", true)
      .maybeSingle();
    return user ? { session, user } : null;
  }

  async function audit(userId: string | null, action: string, details: Record<string, unknown> = {}) {
    const { error } = await db.from("admin_audit_log").insert({
      admin_user_id: userId,
      action,
      entity_type: "mercadolibre",
      entity_id: "connection",
      details
    });
    if (error) console.error("ml audit failed", error.code);
  }

  async function readiness() {
    const clientIdOk = /^\d+$/.test(CLIENT_ID) && Number.isSafeInteger(Number(CLIENT_ID)) && Number(CLIENT_ID) > 0;
    const { data: connection, error: connectionError } = await db
      .from("mercadolibre_connection")
      .select("user_id,site_id,nickname,scope,access_secret_id,refresh_secret_id,expires_at,connected_at,last_refresh_at,updated_at,status,last_error")
      .eq("id", 1)
      .maybeSingle();

    const hasConnectionValues = !!(
      connection?.user_id || connection?.site_id || connection?.access_secret_id || connection?.refresh_secret_id
    );
    const completeConnection = !!(
      connection?.user_id && connection?.access_secret_id && connection?.refresh_secret_id
    );
    const storageOk = !connectionError && (
      !connection || (!hasConnectionValues && connection.status === "disconnected") || completeConnection
    );
    const siteOk = !connection?.site_id || connection.site_id === EXPECTED_SITE_ID;

    let webhookOk = false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    try {
      const response = await fetch(WEBHOOK_URI, {
        headers: { accept: "application/json" },
        signal: controller.signal
      });
      const health = await response.json().catch(() => ({}));
      webhookOk = response.ok && health?.ok === true && health?.configured === true;
    } catch {
      webhookOk = false;
    } finally {
      clearTimeout(timer);
    }

    const checks = [
      { key: "configuration", label: "Credenciales y App ID configurados", ok: clientIdOk && CLIENT_SECRET.length >= 8 },
      { key: "secure_storage", label: "Almacenamiento cifrado consistente", ok: storageOk },
      { key: "webhook", label: "Webhook disponible y configurado", ok: webhookOk },
      { key: "site", label: "Restricción técnica a Mercado Libre Colombia activa", ok: siteOk },
      { key: "authorization_gate", label: "Habilitación productiva aprobada", ok: AUTHORIZATION_ENABLED }
    ];

    return {
      ready: checks.every((check) => check.ok),
      checks,
      connection,
      redirect_uri: REDIRECT_URI,
      webhook_uri: WEBHOOK_URI,
      expected_site_id: EXPECTED_SITE_ID,
      checked_at: new Date().toISOString()
    };
  }

  const url = new URL(req.url);

  if (req.method === "GET") {
    const providerError = url.searchParams.get("error");
    const callbackState = clean(url.searchParams.get("state"));
    if (providerError) {
      if (callbackState && callbackState.length <= 512) {
        const deniedStateHash = await sha256Hex(callbackState);
        const { data: deniedSession } = await db
          .from("mercadolibre_oauth_sessions")
          .update({ used_at: new Date().toISOString() })
          .eq("state_hash", deniedStateHash)
          .is("used_at", null)
          .select("admin_user_id")
          .maybeSingle();
        if (deniedSession) await audit(deniedSession.admin_user_id, "mercadolibre_oauth_denied");
      }
      return redirectStatus("denied");
    }

    const code = clean(url.searchParams.get("code"));
    const state = callbackState;
    if (!code || !state) {
      return json(req, {
        ok: true,
        service: "CardNest Mercado Libre OAuth",
        configured: true,
        authorization_enabled: AUTHORIZATION_ENABLED,
        redirect_uri: REDIRECT_URI,
        webhook_uri: WEBHOOK_URI
      });
    }
    if (code.length > 2_048 || state.length > 512) return redirectStatus("invalid_state");

    const stateHash = await sha256Hex(state);
    const now = new Date().toISOString();
    const { data: session } = await db
      .from("mercadolibre_oauth_sessions")
      .select("id,admin_user_id,admin_session_id,code_verifier,expires_at,used_at")
      .eq("state_hash", stateHash)
      .is("used_at", null)
      .gt("expires_at", now)
      .maybeSingle();

    if (!session) return redirectStatus("invalid_state");

    const { data: claimed } = await db
      .from("mercadolibre_oauth_sessions")
      .update({ used_at: now })
      .eq("id", session.id)
      .is("used_at", null)
      .select("id")
      .maybeSingle();
    if (!claimed) return redirectStatus("invalid_state");

    if (!session.admin_session_id) return redirectStatus("invalid_state");
    const { data: boundAdminSession } = await db
      .from("admin_sessions")
      .select("id,admin_user_id")
      .eq("id", session.admin_session_id)
      .eq("admin_user_id", session.admin_user_id)
      .is("revoked_at", null)
      .gt("expires_at", now)
      .maybeSingle();
    const { data: activeAdmin } = await db
      .from("admin_users")
      .select("id")
      .eq("id", session.admin_user_id)
      .eq("is_active", true)
      .maybeSingle();
    if (!boundAdminSession || !activeAdmin) {
      await audit(session.admin_user_id, "mercadolibre_oauth_failed", { reason: "admin_session_inactive" });
      return redirectStatus("invalid_state");
    }

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: session.code_verifier
    });

    let tokenRes: Response;
    try {
      tokenRes = await timedFetch("https://api.mercadolibre.com/oauth/token", {
        method: "POST",
        headers: {
          "accept": "application/json",
          "content-type": "application/x-www-form-urlencoded"
        },
        body
      });
    } catch {
      await audit(session.admin_user_id, "mercadolibre_oauth_failed", { reason: "token_request_failed" });
      return redirectStatus("token_error");
    }

    const tokenData = await tokenRes.json().catch(() => ({}));
    const accessToken = clean(tokenData?.access_token);
    const refreshToken = clean(tokenData?.refresh_token);
    const tokenType = clean(tokenData?.token_type).toLowerCase();
    const expiresIn = Number(tokenData?.expires_in);
    if (!tokenRes.ok || accessToken.length < 10 || accessToken.length > 4096 ||
      tokenType !== "bearer" || !Number.isSafeInteger(expiresIn) || expiresIn < 60 || expiresIn > 86400) {
      console.error("mercadolibre token exchange failed", tokenRes.status);
      await audit(session.admin_user_id, "mercadolibre_oauth_failed", {
        http_status: tokenRes.status,
        reason: "token_exchange"
      });
      return redirectStatus("token_error");
    }
    if (refreshToken.length < 10 || refreshToken.length > 4096) {
      await audit(session.admin_user_id, "mercadolibre_oauth_failed", { reason: "missing_refresh_token" });
      return redirectStatus("token_error");
    }
    const scope = clean(tokenData.scope);
    const scopes = new Set(scope.toLowerCase().split(/[\s,]+/).filter(Boolean));
    if (!scopes.has("offline_access") || !scopes.has("read") || !scopes.has("write")) {
      await audit(session.admin_user_id, "mercadolibre_oauth_failed", { reason: "insufficient_scope" });
      return redirectStatus("insufficient_scope");
    }

    let meRes: Response;
    try {
      meRes = await timedFetch("https://api.mercadolibre.com/users/me", {
        headers: { Authorization: `Bearer ${accessToken}`, accept: "application/json" }
      });
    } catch {
      await audit(session.admin_user_id, "mercadolibre_oauth_failed", { reason: "profile_request_failed" });
      return redirectStatus("token_error");
    }
    const me = meRes.ok ? await meRes.json().catch(() => ({})) : {};
    const tokenUserId = Number(tokenData.user_id ?? 0);
    const profileUserId = Number(me?.id ?? 0);
    const siteId = clean(me?.site_id);

    if (!meRes.ok || !Number.isSafeInteger(tokenUserId) || tokenUserId <= 0 || tokenUserId !== profileUserId) {
      await audit(session.admin_user_id, "mercadolibre_oauth_failed", { reason: "invalid_user_id" });
      return redirectStatus("token_error");
    }
    if (siteId !== EXPECTED_SITE_ID) {
      await audit(session.admin_user_id, "mercadolibre_oauth_failed", {
        reason: "wrong_site",
        received_site_id: siteId || null
      });
      return redirectStatus("wrong_site");
    }

    const userId = tokenUserId;

    const { error: storeError } = await db.rpc("mercadolibre_store_tokens", {
      p_access_token: accessToken,
      p_refresh_token: refreshToken,
      p_user_id: userId,
      p_site_id: siteId,
      p_nickname: clean(me?.nickname) || null,
      p_token_type: tokenType,
      p_scope: scope,
      p_expires_in: expiresIn
    });

    if (storeError) {
      console.error("mercadolibre token storage failed", storeError.code);
      await audit(session.admin_user_id, "mercadolibre_oauth_failed", { reason: "secure_storage" });
      return redirectStatus("storage_error");
    }

    await audit(session.admin_user_id, "mercadolibre_connected", {
      user_id: userId,
      site_id: siteId
    });

    await db
      .from("mercadolibre_oauth_sessions")
      .delete()
      .lt("expires_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());

    return redirectStatus("connected");
  }

  if (req.method !== "POST") return json(req, { ok: false, error: "METHOD_NOT_ALLOWED" }, 405);

  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > MAX_BODY_BYTES) return json(req, { ok: false, error: "PAYLOAD_TOO_LARGE" }, 413);

  let body: Record<string, unknown>;
  try {
    const raw = await readLimitedBody(req);
    if (!raw) return json(req, { ok: false, error: "PAYLOAD_TOO_LARGE" }, 413);
    const parsed = JSON.parse(new TextDecoder().decode(raw) || "{}");
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error("invalid");
    body = parsed as Record<string, unknown>;
  } catch {
    return json(req, { ok: false, error: "INVALID_JSON" }, 400);
  }

  const auth = await requireAdmin();
  if (!auth) return json(req, { ok: false, error: "UNAUTHORIZED", message: "La sesión administrativa no es válida." }, 401);

  const action = clean(body.action);

  if (action === "status" || action === "preflight") {
    const result = await readiness();
    const data = result.connection;
    const connected = data?.status === "connected" && !!data?.user_id && !!data?.access_secret_id && !!data?.refresh_secret_id;
    return json(req, {
      ok: true,
      connected,
      ready: result.ready,
      checks: result.checks,
      redirect_uri: result.redirect_uri,
      webhook_uri: result.webhook_uri,
      expected_site_id: result.expected_site_id,
      checked_at: result.checked_at,
      connection: data ? {
        status: data.status,
        user_id: data.user_id,
        site_id: data.site_id,
        nickname: data.nickname,
        scope: data.scope,
        expires_at: data.expires_at,
        connected_at: data.connected_at,
        last_refresh_at: data.last_refresh_at,
        updated_at: data.updated_at
      } : null
    });
  }

  if (action === "start") {
    if (!AUTHORIZATION_ENABLED) {
      await audit(auth.user.id, "mercadolibre_oauth_start_blocked", { reason: "authorization_disabled" });
      return json(req, {
        ok: false,
        error: "AUTHORIZATION_DISABLED",
        message: "La autorización productiva permanece desactivada hasta completar la revisión de cumplimiento."
      }, 423);
    }

    const manualChecks = body.manual_checks && typeof body.manual_checks === "object"
      ? body.manual_checks as Record<string, unknown>
      : {};
    const manualChecksOk = manualChecks.redirect_uri === true &&
      manualChecks.webhook_topics === true && manualChecks.permissions_account === true &&
      manualChecks.test_users === true;
    if (!manualChecksOk) {
      await audit(auth.user.id, "mercadolibre_oauth_manual_checks_failed");
      return json(req, {
        ok: false,
        error: "MANUAL_CHECKS_REQUIRED",
        message: "Confirma los ajustes de Mercado Libre Developers antes de autorizar."
      }, 409);
    }

    const result = await readiness();
    if (!result.ready) {
      const failedChecks = result.checks.filter((check) => !check.ok).map((check) => check.key);
      await audit(auth.user.id, "mercadolibre_oauth_preflight_failed", { failed_checks: failedChecks });
      return json(req, {
        ok: false,
        error: "PREFLIGHT_FAILED",
        message: "La revisión previa no está completa. No se inició la autorización.",
        ready: false,
        checks: result.checks
      }, 409);
    }

    const verifier = randomUrlSafe(64);
    const challenge = b64url(await sha256Bytes(verifier));
    const state = randomUrlSafe(32);
    const stateHash = await sha256Hex(state);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { error: cleanupError } = await db
      .from("mercadolibre_oauth_sessions")
      .delete()
      .eq("admin_user_id", auth.user.id)
      .is("used_at", null);
    if (cleanupError) return json(req, { ok: false, error: "OAUTH_SESSION_FAILED" }, 500);

    const { error } = await db.from("mercadolibre_oauth_sessions").insert({
      admin_user_id: auth.user.id,
      admin_session_id: auth.session.id,
      state_hash: stateHash,
      code_verifier: verifier,
      expires_at: expiresAt
    });
    if (error) return json(req, { ok: false, error: "OAUTH_SESSION_FAILED" }, 500);

    const authUrl = new URL(AUTH_BASE);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", CLIENT_ID);
    authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("code_challenge", challenge);
    authUrl.searchParams.set("code_challenge_method", "S256");

    await audit(auth.user.id, "mercadolibre_oauth_started");
    return json(req, { ok: true, authorization_url: authUrl.toString(), expires_at: expiresAt });
  }

  if (action === "disconnect") {
    const { error } = await db.rpc("mercadolibre_disconnect");
    if (error) return json(req, { ok: false, error: "DISCONNECT_FAILED" }, 500);
    await audit(auth.user.id, "mercadolibre_disconnected");
    return json(req, { ok: true, connected: false });
  }

  return json(req, { ok: false, error: "UNKNOWN_ACTION" }, 400);
});
