import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Optional: brands can set a shared secret in their webhook config.
// Store it as a Supabase secret: supabase secrets set AFFILIATE_WEBHOOK_SECRET=your_secret
const WEBHOOK_SECRET = Deno.env.get("AFFILIATE_WEBHOOK_SECRET") || null;

serve(async (req: Request) => {
  // ── CORS preflight ────────────────────────────────────────────────────────
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info, x-webhook-secret",
      },
    });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed. Use POST." }, 405);
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: {
    code?: string;
    order_value?: number;
    secret?: string;
    order_id?: string;
    customer_email?: string;
    source?: string;
    notes?: string;
  };

  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const { code, order_value, secret, order_id, customer_email, source, notes } = body;

  if (!code) {
    return json({ error: "Missing required field: code" }, 400);
  }

  if (order_value === undefined || order_value === null) {
    return json({ error: "Missing required field: order_value (in cents)" }, 400);
  }

  // ── Verify secret (if configured) ─────────────────────────────────────────
  // The secret can come from the body or from a header.
  const headerSecret = req.headers.get("x-webhook-secret");
  const providedSecret = secret || headerSecret;

  if (WEBHOOK_SECRET && providedSecret !== WEBHOOK_SECRET) {
    return json({ error: "Invalid webhook secret." }, 401);
  }

  // ── Process conversion ────────────────────────────────────────────────────
  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // 1. Look up the affiliate link by code
    const { data: links, error: lookupErr } = await db
      .from("affiliate_links")
      .select("*")
      .eq("code", code)
      .limit(1);

    if (lookupErr) {
      console.error("[affiliate-conversion] Lookup error:", lookupErr);
      return json({ error: "Database error looking up code." }, 500);
    }

    const link = links?.[0];

    if (!link) {
      return json({ error: `Code "${code}" not found.` }, 404);
    }

    if (link.is_active === false) {
      return json({ error: `Code "${code}" is deactivated.` }, 410);
    }

    // 2. Calculate commission
    const orderCents = Math.round(Number(order_value));
    let commissionCents: number;

    if (link.commission_type === "flat" && link.commission_flat_amount) {
      commissionCents = link.commission_flat_amount;
    } else {
      commissionCents = Math.round(orderCents * (link.commission_rate || 10) / 100);
    }

    // 3. Insert conversion record
    const conversionRow = {
      link_code: code,
      conversion_value: orderCents,
      commission_amount: commissionCents,
      logged_by: source || "webhook",
      notes: [
        notes,
        order_id ? `Order: ${order_id}` : null,
        customer_email ? `Customer: ${customer_email}` : null,
      ].filter(Boolean).join(" | ") || null,
    };

    const { data: conversion, error: insertErr } = await db
      .from("affiliate_conversions")
      .insert(conversionRow)
      .select()
      .single();

    if (insertErr) {
      console.error("[affiliate-conversion] Insert error:", insertErr);
      return json({ error: "Failed to record conversion." }, 500);
    }

    // 4. Update aggregate counters on the affiliate link
    const { error: updateErr } = await db
      .from("affiliate_links")
      .update({
        conversions: (link.conversions || 0) + 1,
        revenue: (link.revenue || 0) + orderCents,
        commission_earned: (link.commission_earned || 0) + commissionCents,
      })
      .eq("id", link.id);

    if (updateErr) {
      console.error("[affiliate-conversion] Update error:", updateErr);
      // Conversion was still recorded — don't fail the response
    }

    // 5. Return success
    return json({
      success: true,
      conversion: {
        id: conversion.id,
        code,
        order_value_cents: orderCents,
        commission_cents: commissionCents,
        commission_type: link.commission_type,
        commission_rate: link.commission_rate,
        logged_at: conversion.logged_at,
      },
      link_totals: {
        conversions: (link.conversions || 0) + 1,
        revenue_cents: (link.revenue || 0) + orderCents,
        commission_earned_cents: (link.commission_earned || 0) + commissionCents,
      },
    });
  } catch (err) {
    console.error("[affiliate-conversion] Unhandled error:", err);
    return json({ error: (err as Error).message }, 500);
  }
});

// ── Helper ──────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
