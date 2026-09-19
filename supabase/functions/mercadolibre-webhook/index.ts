import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CLIENT_ID = Deno.env.get("MERCADOLIBRE_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("MERCADOLIBRE_CLIENT_SECRET") ?? "";
const MAX_BODY_BYTES = 256 * 1024;
const EXPECTED_SITE_ID = "MCO";
const API_ORIGIN = "https://api.mercadolibre.com";
const RESOURCE_PREFIXES: Record<string, string[]> = {
  items: ["/items/"],
  orders_v2: ["/orders/"],
  questions: ["/questions/"],
  messages: ["/messages/"],
  shipments: ["/shipments/"]
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY"
    }
  });
}
const clean = (v: unknown) => String(v ?? "").trim();

async function timedFetch(url: string, init: RequestInit = {}, timeoutMs = 8_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
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

function verificationUrl(topic: string, resource: string) {
  const prefixes = RESOURCE_PREFIXES[topic];
  if (!prefixes || resource.startsWith("//") || resource.includes("\\") || !prefixes.some((prefix) => resource.startsWith(prefix))) {
    return null;
  }
  try {
    const url = new URL(resource, API_ORIGIN);
    const pathAllowed = prefixes.some((prefix) => url.pathname.startsWith(prefix));
    return url.origin === API_ORIGIN && pathAllowed ? url.toString() : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  const configured = !!(
    SUPABASE_URL && SERVICE_ROLE && CLIENT_SECRET.length >= 8 && /^\d+$/.test(CLIENT_ID) &&
    Number.isSafeInteger(Number(CLIENT_ID)) && Number(CLIENT_ID) > 0
  );
  if (req.method === "GET") {
    return json({ ok: true, service: "CardNest Mercado Libre webhook", configured, expected_site_id: EXPECTED_SITE_ID });
  }
  if (req.method !== "POST") return json({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  if (!configured) return json({ ok: false, error: "SERVER_CONFIG" }, 503);

  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > MAX_BODY_BYTES) return json({ ok: false, error: "PAYLOAD_TOO_LARGE" }, 413);

  let event: Record<string, unknown>;
  try {
    const raw = await readLimitedBody(req);
    if (!raw) return json({ ok: false, error: "PAYLOAD_TOO_LARGE" }, 413);
    const parsed = JSON.parse(new TextDecoder().decode(raw) || "{}");
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error("invalid");
    event = parsed as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: "INVALID_JSON" }, 400);
  }

  const resource = clean(event.resource).slice(0, 500);
  const topic = clean(event.topic).slice(0, 120);
  const userId = Number(event.user_id || 0);
  const applicationId = Number(event.application_id || 0);
  const attempts = Math.max(0, Math.min(100, Number(event.attempts || 0) || 0));
  const sent = clean(event.sent).slice(0, 100);
  const eventId = clean(event.id).slice(0, 500);
  const resourceUrl = verificationUrl(topic, resource);

  // Acknowledge notifications that are not for this exact application without
  // storing them or making authenticated requests. Mercado Libre retries non-2xx.
  if (!Number.isSafeInteger(applicationId) || applicationId !== Number(CLIENT_ID) || !Number.isSafeInteger(userId) || userId <= 0 || !resourceUrl) {
    return json({ ok: true });
  }

  const dedupKey = eventId || [topic, resource, userId, sent].join("|");

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
    if (!row?.access_token || !["connected", "error"].includes(row.status) || row.site_id !== EXPECTED_SITE_ID) return null;
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
      const res = await timedFetch("https://api.mercadolibre.com/oauth/token", {
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

      const refreshedUserId = Number(data.user_id ?? row.user_id);
      if (!Number.isSafeInteger(refreshedUserId) || refreshedUserId !== Number(row.user_id)) {
        await db.rpc("mercadolibre_release_refresh_lock", { p_error: "refresh_user_mismatch" });
        return null;
      }

      const { error } = await db.rpc("mercadolibre_store_tokens", {
        p_access_token: String(data.access_token),
        p_refresh_token: String(data.refresh_token ?? row.refresh_token),
        p_user_id: refreshedUserId,
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
    const tokens = await getTokens();
    if (!tokens || Number(tokens.user_id) !== userId || tokens.site_id !== EXPECTED_SITE_ID) return;

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

    const accessToken = await refreshTokenIfNeeded(tokens);
    if (!accessToken) {
      await db.from("mercadolibre_webhook_events").update({
        processed_at: new Date().toISOString(),
        error: "no_valid_access_token"
      }).eq("id", inserted.id);
      return;
    }

    let status = 0;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    try {
      const verification = await fetch(resourceUrl, {
        headers: { Authorization: `Bearer ${accessToken}`, accept: "application/json" },
        signal: controller.signal
      });
      status = verification.status;
      // The webhook is treated only as an alert. We deliberately do not persist
      // the returned resource payload here because it can contain PII.
      await verification.body?.cancel().catch(() => {});
    } catch {
      status = 0;
    } finally {
      clearTimeout(timer);
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
  EdgeRuntime.waitUntil(processEvent().catch((error) => {
    console.error("mercadolibre webhook background failure", error instanceof Error ? error.name : "unknown");
  }));
  return json({ ok: true });
});
