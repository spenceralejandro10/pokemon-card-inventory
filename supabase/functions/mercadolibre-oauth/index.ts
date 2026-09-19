import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const CLIENT_ID = Deno.env.get("MERCADOLIBRE_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("MERCADOLIBRE_CLIENT_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const REDIRECT_URI = "https://cnivcnexsqobipvqxero.supabase.co/functions/v1/mercadolibre-oauth";
const ADMIN_RETURN = "https://spenceralejandro10.github.io/pokemon-card-inventory/admin.html";
const AUTH_BASE = "https://auth.mercadolibre.com.co/authorization";
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
function randomUrlSafe(size: number) {
  return b64url(crypto.getRandomValues(new Uint8Array(size)));
}
function cors(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  const allow = allowedOrigins.has(origin) ? origin : "https://spenceralejandro10.github.io";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "content-type, apikey, x-admin-token",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Vary": "Origin"
  };
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
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
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

  const url = new URL(req.url);

  if (req.method === "GET") {
    const providerError = url.searchParams.get("error");
    if (providerError) return redirectStatus("denied");

    const code = clean(url.searchParams.get("code"));
    const state = clean(url.searchParams.get("state"));
    if (!code || !state) {
      return json(req, { ok: true, service: "CardNest Mercado Libre OAuth", configured: true });
    }

    const stateHash = await sha256Hex(state);
    const now = new Date().toISOString();
    const { data: session } = await db
      .from("mercadolibre_oauth_sessions")
      .select("id,admin_user_id,code_verifier,expires_at,used_at")
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

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: session.code_verifier
    });

    const tokenRes = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: {
        "accept": "application/json",
        "content-type": "application/x-www-form-urlencoded"
      },
      body
    });

    const tokenData = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !tokenData?.access_token) {
      console.error("mercadolibre token exchange failed", tokenRes.status);
      await audit(session.admin_user_id, "mercadolibre_oauth_failed", { http_status: tokenRes.status });
      return redirectStatus("token_error");
    }

    const meRes = await fetch("https://api.mercadolibre.com/users/me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}`, accept: "application/json" }
    });
    const me = meRes.ok ? await meRes.json().catch(() => ({})) : {};

    const userId = Number(tokenData.user_id ?? me?.id ?? 0);
    if (!Number.isFinite(userId) || userId <= 0) {
      await audit(session.admin_user_id, "mercadolibre_oauth_failed", { reason: "invalid_user_id" });
      return redirectStatus("token_error");
    }

    const { error: storeError } = await db.rpc("mercadolibre_store_tokens", {
      p_access_token: String(tokenData.access_token),
      p_refresh_token: String(tokenData.refresh_token ?? ""),
      p_user_id: userId,
      p_site_id: clean(me?.site_id) || null,
      p_nickname: clean(me?.nickname) || null,
      p_token_type: clean(tokenData.token_type) || "bearer",
      p_scope: clean(tokenData.scope),
      p_expires_in: Number(tokenData.expires_in) || 21600
    });

    if (storeError) {
      console.error("mercadolibre token storage failed", storeError.code);
      await audit(session.admin_user_id, "mercadolibre_oauth_failed", { reason: "secure_storage" });
      return redirectStatus("storage_error");
    }

    await audit(session.admin_user_id, "mercadolibre_connected", {
      user_id: userId,
      site_id: clean(me?.site_id) || null,
      nickname: clean(me?.nickname) || null
    });

    await db
      .from("mercadolibre_oauth_sessions")
      .delete()
      .lt("expires_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());

    return redirectStatus("connected");
  }

  if (req.method !== "POST") return json(req, { ok: false, error: "METHOD_NOT_ALLOWED" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(req, { ok: false, error: "INVALID_JSON" }, 400);
  }

  const auth = await requireAdmin();
  if (!auth) return json(req, { ok: false, error: "UNAUTHORIZED", message: "La sesión administrativa no es válida." }, 401);

  const action = clean(body.action);

  if (action === "status") {
    const { data } = await db
      .from("mercadolibre_connection")
      .select("user_id,site_id,nickname,scope,expires_at,connected_at,last_refresh_at,updated_at,status,last_error")
      .eq("id", 1)
      .maybeSingle();

    const connected = data?.status === "connected" && !!data?.user_id;
    return json(req, {
      ok: true,
      connected,
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
    const verifier = randomUrlSafe(64);
    const challenge = b64url(await sha256Bytes(verifier));
    const state = randomUrlSafe(32);
    const stateHash = await sha256Hex(state);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await db.from("mercadolibre_oauth_sessions").delete().lt("expires_at", new Date().toISOString());

    const { error } = await db.from("mercadolibre_oauth_sessions").insert({
      admin_user_id: auth.user.id,
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
