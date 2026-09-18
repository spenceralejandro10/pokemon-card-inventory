import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });
const clean = (value: unknown) => String(value ?? "").trim();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const saleCodePattern = /^[A-Z0-9][A-Z0-9-]{5,39}$/;
const shippingZones = new Set(["L", "R", "N", "Z", "O", "E"]);
const topLoaderPreferences = new Set([
  "one_per_card",
  "up_to_three",
  "send_loose",
  "custom",
]);
const paymentDestinations: Record<string, string> = {
  Nequi: "300 000 0000 · DEMO — NO PAGAR",
  "Bre-B / llave bancaria": "@CARDNEST-DEMO · DEMO — NO PAGAR",
  Bancolombia: "000-000000-00 · DEMO — NO PAGAR",
  Daviplata: "300 000 0000 · DEMO — NO PAGAR",
};

const topLoaderPrice = (quantity: number) => {
  const safeQuantity = Math.max(0, Math.min(100, Math.floor(quantity || 0)));
  return Math.floor(safeQuantity / 6) * 10000 + (safeQuantity % 6) * 2000;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 25000) return json({ error: "PAYLOAD_TOO_LARGE" }, 413);

  try {
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return json({ error: "INVALID_JSON", message: "La solicitud no es válida." }, 400);
    }

    const action = clean(body.action);
    if (action !== "validate" && action !== "create_order") {
      return json({ error: "UNKNOWN_ACTION" }, 400);
    }

    const saleCode = clean(body.code).toUpperCase();
    if (!saleCodePattern.test(saleCode)) {
      return json(
        action === "validate"
          ? { valid: false, message: "Código inválido, vencido o ya utilizado." }
          : { error: "INVALID_CODE", message: "El código no es válido." },
        400,
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase runtime configuration");

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authorization, error: authorizationError } = await supabase
      .from("sale_authorization_codes")
      .select("code,status,agreed_total,expires_at,items,shipping_weight_kg")
      .eq("code", saleCode)
      .maybeSingle();
    if (authorizationError) throw authorizationError;

    const expiration = authorization?.expires_at
      ? new Date(authorization.expires_at).getTime()
      : Number.POSITIVE_INFINITY;
    const agreedTotal = Number(authorization?.agreed_total || 0);
    const valid = Boolean(
      authorization &&
        authorization.status === "active" &&
        Number.isFinite(expiration) &&
        expiration > Date.now() &&
        Number.isInteger(agreedTotal) &&
        agreedTotal >= 3000 &&
        agreedTotal <= 10000000,
    );

    const codeItems = Array.isArray(authorization?.items) ? authorization.items : [];
    if (action === "validate") {
      if (!valid) return json({ valid: false, message: "Código inválido, vencido o ya utilizado." });
      if (!codeItems.length) {
        return json({ valid: false, message: "Este código aún no está listo para procesar el envío." });
      }

      return json({
        valid: true,
        ready_for_shipping: true,
        message: "Código validado.",
        handling_price: Math.round(agreedTotal * 0.01),
        shipping_weight_kg: Math.max(
          1,
          Math.min(5, Math.floor(Number(authorization.shipping_weight_kg) || 1)),
        ),
      });
    }

    if (!valid) {
      return json(
        {
          error: "INVALID_OR_EXPIRED_CODE",
          message: "El código no es válido, venció o ya fue utilizado.",
        },
        409,
      );
    }
    if (!codeItems.length) {
      return json(
        {
          error: "CODE_HAS_NO_ITEMS",
          message: "Este código no está listo para procesar el envío.",
        },
        409,
      );
    }

    const buyer = (body.buyer ?? {}) as Record<string, unknown>;
    const name = clean(buyer.name);
    const email = clean(buyer.email).toLowerCase();
    const phone = clean(buyer.phone);
    const document = clean(buyer.document);
    const department = clean(buyer.department);
    const city = clean(buyer.city);
    const address = clean(buyer.address);
    const neighborhood = clean(buyer.neighborhood);
    const reference = clean(buyer.reference);
    const customerNotes = clean(body.customerNotes ?? buyer.notes);
    const consent = body.deliveryConsent === true || buyer.consent === true;
    const paymentMethod = clean(body.paymentMethod);
    const zone = clean(body.shippingZone || "N");
    const topQuantity = Math.max(0, Math.min(100, Math.floor(Number(body.topLoaderQty) || 0)));
    const topPreference = clean(body.topLoaderPreference).slice(0, 60);
    const topNotes = clean(body.topLoaderNotes).slice(0, 180);

    const namePattern = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' .-]{2,80}$/;
    const placePattern = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' .-]{2,60}$/;

    if (!namePattern.test(name)) {
      return json({ error: "INVALID_NAME", message: "Escribe un nombre válido, solo letras y espacios." }, 400);
    }
    if (!emailPattern.test(email) || email.length > 100) {
      return json({ error: "INVALID_EMAIL", message: "Escribe un correo electrónico válido." }, 400);
    }
    if (!/^\d{7,15}$/.test(phone)) {
      return json({ error: "INVALID_PHONE", message: "El celular debe contener entre 7 y 15 números." }, 400);
    }
    if (!/^\d{5,20}$/.test(document)) {
      return json({ error: "INVALID_DOCUMENT", message: "La identificación debe contener solo números." }, 400);
    }
    if (!placePattern.test(department) || !placePattern.test(city)) {
      return json({ error: "INVALID_LOCATION", message: "Revisa el departamento y la ciudad." }, 400);
    }
    if (address.length < 5 || address.length > 120) {
      return json({ error: "INVALID_ADDRESS", message: "Revisa la dirección de entrega." }, 400);
    }
    if (neighborhood.length < 2 || neighborhood.length > 80) {
      return json({ error: "INVALID_NEIGHBORHOOD", message: "Completa el barrio o sector." }, 400);
    }
    if (reference.length > 160) return json({ error: "REFERENCE_TOO_LONG" }, 400);
    if (customerNotes.length > 300) return json({ error: "NOTES_TOO_LONG" }, 400);
    if (!consent) {
      return json(
        { error: "CONSENT_REQUIRED", message: "Debes confirmar que los datos de entrega son correctos." },
        400,
      );
    }
    if (!paymentDestinations[paymentMethod]) {
      return json({ error: "INVALID_PAYMENT_METHOD", message: "Selecciona un medio de pago válido." }, 400);
    }
    if (!shippingZones.has(zone)) {
      return json({ error: "INVALID_ZONE", message: "Selecciona una zona de envío válida." }, 400);
    }
    if (
      topQuantity > 0 &&
      (!topLoaderPreferences.has(topPreference) || (topPreference === "custom" && topNotes.length < 3))
    ) {
      return json(
        { error: "INVALID_TOP_LOADER_PREFERENCE", message: "Revisa la configuración de Top Loaders." },
        400,
      );
    }

    const safeItems = codeItems
      .slice(0, 100)
      .map((item: Record<string, unknown>) => ({
        id: clean(item.id).slice(0, 60),
        name: clean(item.name).slice(0, 120),
        number: clean(item.number).slice(0, 50),
        category: clean(item.category).slice(0, 40),
        qty: Math.max(1, Math.min(50, Math.floor(Number(item.qty) || 1))),
      }))
      .filter((item) => item.id && item.name);
    if (!safeItems.length) {
      return json(
        { error: "CODE_HAS_NO_VALID_ITEMS", message: "Este código no está listo para procesar el envío." },
        409,
      );
    }

    const billableWeight = Math.max(
      1,
      Math.min(5, Math.floor(Number(authorization.shipping_weight_kg) || 1)),
    );
    const { data: rate, error: rateError } = await supabase
      .from("shipping_rates")
      .select("base_rate")
      .eq("zone_code", zone)
      .eq("weight_kg", billableWeight)
      .maybeSingle();
    if (rateError) throw rateError;
    if (!rate || Number(rate.base_rate || 0) <= 0) {
      return json(
        { error: "SHIPPING_RATE_NOT_FOUND", message: "No hay una tarifa válida configurada para este envío." },
        409,
      );
    }

    const shippingPrice = Number(rate.base_rate);
    const handlingPrice = Math.round(agreedTotal * 0.01);
    const protectionPrice = topLoaderPrice(topQuantity);
    const orderId = `CN-${crypto.randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}`;
    const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();

    const { error: createError } = await supabase.rpc("create_web_order_with_code_v2", {
      p_code: saleCode,
      p_order_id: orderId,
      p_buyer_name: name,
      p_buyer_phone: phone,
      p_buyer_email: email,
      p_buyer_document: document,
      p_department: department,
      p_city: city,
      p_address: address,
      p_neighborhood: neighborhood,
      p_reference: reference,
      p_customer_notes: customerNotes,
      p_delivery_consent: consent,
      p_payment_method: paymentMethod,
      p_shipping_zone: zone,
      p_shipping_price: shippingPrice,
      p_handling_price: handlingPrice,
      p_top_loader_qty: topQuantity,
      p_top_loader_preference: topQuantity > 0 ? topPreference : "",
      p_top_loader_notes: topQuantity > 0 ? topNotes : "",
      p_protection_price: protectionPrice,
      p_items: safeItems,
      p_expires_at: expiresAt,
    });
    if (createError) {
      console.error("sale-order create failed", createError.code);
      return json(
        {
          error: "ORDER_CREATE_FAILED",
          message: createError.message.includes("INVALID_OR_EXPIRED_CODE")
            ? "El código ya no está disponible. Solicita uno nuevo al analista."
            : "No se pudo generar el pedido.",
        },
        409,
      );
    }

    return json({
      ok: true,
      order: {
        id: orderId,
        sale_code: saleCode,
        expires_at: expiresAt,
        shipping_price: shippingPrice,
        handling_price: handlingPrice,
        protection_price: protectionPrice,
        shipping_total: shippingPrice + handlingPrice + protectionPrice,
        payment_method: paymentMethod,
        payment_destination: paymentDestinations[paymentMethod],
        payment_demo: true,
        top_loader_qty: topQuantity,
        top_loader_preference: topQuantity > 0 ? topPreference : "",
        top_loader_notes: topQuantity > 0 ? topNotes : "",
      },
    });
  } catch (error) {
    console.error("sale-order unexpected failure", error instanceof Error ? error.name : "unknown");
    return json({ error: "SERVER_ERROR", message: "No se pudo completar la operación." }, 500);
  }
});
