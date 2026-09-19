import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CLIENT_ID = Deno.env.get("MERCADOLIBRE_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("MERCADOLIBRE_CLIENT_SECRET") ?? "";
const MAX_BODY_BYTES = 1_048_576;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff"
    }
  });
}
const clean = (v: unknown) => String(v ?? "").trim();

Deno.serve(async (req: Request) => {
  if (req.method === "GET") return json({ ok: true, service: "CardNest Mercado Libre webhook" });
  if (req.method !== "POST") return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE) return json({ ok: false, error: "SERVER_CONFIG" }, 503);

  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > MAX_BODY_BYTES) return json({ ok: false, error: "PAYLOAD_TOO_LARGE" }, 413);

  let event: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) return json({ ok: false, error: "PAYLOAD_TOO_LARGE" }, 413);
    const parsed = JSON.parse(raw || "{}");
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error("invalid");
    event = parsed as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: "INVALID_JSON" }, 400);
  }

  const resource = clean(event.resource).slice(0, 500);
  const topic = clean(event.topic).slice(0, 120);
  const userId = Number(event.user_id || 0) || null;
  const applicationId = Number(event.application_id || 0) || null;
  const attempts = Number(event.attempts || 0) || 0;
  const sent = clean(event.sent);
  const eventId = clean(event.id);
  const dedupKey = eventId || [topic, resource, userId ?? "", sent].join("|");

  const db = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  async function getTokens() {
    const { data, error } = await db.rpc("mercadolibre_get_tokens");
    if (error) return null;
    const row = Array.isArray(data) ? data[0] : data;
    return row ?? null;
  }

  async function refreshTokenIfNeeded(row: any) {
    if (!row?.access_token) return null;
    const expires = row.expires_at ? new Date(row.expires_at).getTime() : 0;
    if (expires > Date.now() + 5 * 60 * 1000) return row.access_token;
    if (!row.refresh_token || !CLIENT_ID || !CLIENT_SECRET) return null;

    const { data: acquired } = await db.rpc("mercadolibre_acquire_refresh_lock");
    if (!acquired) {
      for (let i = 0; i < 4; i++) {
        await new Promise((resolve) => setTimeout(resolve, 600));
        const latest = await getTokens();
        const latestExpiry = latest?.expires_at ? new Date(latest.expires_at).getTime() : 0;
        if (latest?.access_token && latestExpiry > Date.now() + 5 * 60 * 1000) return latest.access_token;
      }
      return null;
    }

    try {
      const body = new URLSearchParams({
        grant_type: "refresh_token",
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: row.refresh_token
      });
      const res = await fetch("https://api.mercadolibre.com/oauth/token", {
        method: "POST",
        headers: {
          "accept": "application/json",
          "content-type": "application/x-www-form-urlencoded"
        },
        body
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.access_token) {
        await db.rpc("mercadolibre_release_refresh_lock", { p_error: `refresh_http_${res.status}` });
        return null;
      }

      const { error } = await db.rpc("mercadolibre_store_tokens", {
        p_access_token: String(data.access_token),
        p_refresh_token: String(data.refresh_token ?? ""),
        p_user_id: Number(data.user_id ?? row.user_id),
        p_site_id: row.site_id ?? null,
        p_nickname: row.nickname ?? null,
        p_token_type: clean(data.token_type) || "bearer",
        p_scope: clean(data.scope) || clean(row.scope),
        p_expires_in: Number(data.expires_in) || 21600
      });
      if (error) {
        await db.rpc("mercadolibre_release_refresh_lock", { p_error: "refresh_storage_failed" });
        return null;
      }
      return String(data.access_token);
    } catch {
      await db.rpc("mercadolibre_release_refresh_lock", { p_error: "refresh_request_failed" });
      return null;
    }
  }

  async function processEvent() {
    const sentAt = sent && !Number.isNaN(new Date(sent).getTime()) ? new Date(sent).toISOString() : null;
    const { data: inserted, error: insertError } = await db
      .from("mercadolibre_webhook_events")
      .upsert({
        dedup_key: dedupKey.slice(0, 900),
        topic: topic || null,
        resource: resource || null,
        user_id: userId,
        application_id: applicationId,
        attempts,
        sent_at: sentAt
      }, { onConflict: "dedup_key", ignoreDuplicates: true })
      .select("id")
      .maybeSingle();

    if (insertError || !inserted?.id) return;

    if (!resource.startsWith("/")) {
      await db.from("mercadolibre_webhook_events").update({
        processed_at: new Date().toISOString(),
        error: "invalid_resource"
      }).eq("id", inserted.id);
      return;
    }

    const tokens = await getTokens();
    const accessToken = await refreshTokenIfNeeded(tokens);
    if (!accessToken) {
      await db.from("mercadolibre_webhook_events").update({
        processed_at: new Date().toISOString(),
        error: "no_valid_access_token"
      }).eq("id", inserted.id);
      return;
    }

    let status = 0;
    try {
      const verification = await fetch(`https://api.mercadolibre.com${resource}`, {
        headers: { Authorization: `Bearer ${accessToken}`, accept: "application/json" }
      });
      status = verification.status;
      // The webhook is treated only as an alert. We deliberately do not persist
      // the returned resource payload here because it can contain PII.
      await verification.body?.cancel().catch(() => {});
    } catch {
      status = 0;
    }

    await db.from("mercadolibre_webhook_events").update({
      verified_at: new Date().toISOString(),
      verification_status: status || null,
      processed_at: new Date().toISOString(),
      error: status >= 200 && status < 300 ? null : `verification_http_${status || "network"}`
    }).eq("id", inserted.id);
  }

  // Mercado Libre expects a very fast 200 response. Process securely in background.
  // @ts-ignore EdgeRuntime is provided by Supabase.
  EdgeRuntime.waitUntil(processEvent());
  return json({ ok: true });
});
