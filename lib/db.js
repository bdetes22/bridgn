"use strict";

/**
 * Server-side Supabase client using the service role key.
 * This bypasses Row Level Security and must NEVER be exposed to the browser.
 */

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  throw new Error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables.\n" +
    "Copy .env.example to .env and fill in your Supabase credentials."
  );
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

// ─── Creator profile helpers ──────────────────────────────────────────────────

/**
 * Return the creator_profiles row for a user, or null if it doesn't exist yet.
 */
async function getCreatorProfile(userId) {
  const { data, error } = await db
    .from("creator_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * Upsert the creator_profiles row, merging only the supplied fields.
 */
async function upsertCreatorProfile(userId, fields) {
  const { data, error } = await db
    .from("creator_profiles")
    .upsert({ user_id: userId, ...fields }, { onConflict: "user_id" })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ─── Brand profile helpers ────────────────────────────────────────────────────

/**
 * Return the brand_profiles row for a user, or null if it doesn't exist yet.
 */
async function getBrandProfile(userId) {
  const { data, error } = await db
    .from("brand_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * Upsert the brand_profiles row, merging only the supplied fields.
 */
async function upsertBrandProfile(userId, fields) {
  const { data, error } = await db
    .from("brand_profiles")
    .upsert({ user_id: userId, ...fields }, { onConflict: "user_id" })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ─── Deal helpers (webhook-facing) ───────────────────────────────────────────

/**
 * Look up a deal row by its Stripe PaymentIntent ID.
 * Returns null when no matching row exists.
 */
async function getDealByPaymentIntentId(paymentIntentId) {
  const { data, error } = await db
    .from("deals")
    .select("*")
    .eq("payment_intent_id", paymentIntentId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * Upsert a deal row keyed on bridgn_deal_id + payment_intent_id.
 * Creates the row if it doesn't exist, updates matching fields otherwise.
 *
 * We upsert on payment_intent_id because that's the stable identifier
 * Stripe includes in every related event.
 */
async function upsertDeal(paymentIntentId, fields) {
  const { data, error } = await db
    .from("deals")
    .upsert(
      { payment_intent_id: paymentIntentId, ...fields },
      { onConflict: "payment_intent_id" }
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Look up a creator_profiles row by the Stripe connected account ID.
 */
async function getCreatorProfileByStripeAccount(stripeAccountId) {
  const { data, error } = await db
    .from("creator_profiles")
    .select("*")
    .eq("stripe_account_id", stripeAccountId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * Update a creator_profiles row by its Stripe connected account ID.
 * Returns null when no matching row exists (account not yet in our DB).
 */
async function updateCreatorProfileByStripeAccount(stripeAccountId, fields) {
  const { data, error } = await db
    .from("creator_profiles")
    .update(fields)
    .eq("stripe_account_id", stripeAccountId)
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
}

// ─── Notification helpers ─────────────────────────────────────────────────────

/**
 * Insert a row into inbox_notifications for the given Supabase user.
 * `type` is a short string like "payment_failed", `payload` is arbitrary JSON.
 */
async function insertNotification(userId, type, payload = {}) {
  const { data, error } = await db
    .from("inbox_notifications")
    .insert({ user_id: userId, type, payload })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Look up a deal by its frontend-generated bridgn_deal_id.
 * When multiple rows share the same bridgn_deal_id (shouldn't happen, but
 * guard against it), returns the most recently updated one.
 */
async function getDealByBridgnDealId(bridgnDealId) {
  const { data, error } = await db
    .from("deals")
    .select("*")
    .eq("bridgn_deal_id", String(bridgnDealId))
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * Update a deal row by its internal UUID (primary key).
 */
async function updateDealById(id, fields) {
  const { data, error } = await db
    .from("deals")
    .update(fields)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Insert a new deal row (no payment_intent_id yet).
 * Used when a creator first creates a deal from the frontend.
 */
async function insertDeal(fields) {
  const { data, error } = await db
    .from("deals")
    .insert(fields)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Load all deals where the user is either the creator or the brand.
 * Returns newest first.
 */
async function getDealsForUser(userId) {
  const { data, error } = await db
    .from("deals")
    .select("*")
    .or(`creator_user_id.eq.${userId},brand_user_id.eq.${userId}`)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

module.exports = {
  db,
  // Creator profiles
  getCreatorProfile,
  upsertCreatorProfile,
  getCreatorProfileByStripeAccount,
  updateCreatorProfileByStripeAccount,
  // Brand profiles
  getBrandProfile,
  upsertBrandProfile,
  // Deals
  getDealByPaymentIntentId,
  getDealByBridgnDealId,
  upsertDeal,
  updateDealById,
  insertDeal,
  getDealsForUser,
  // Notifications
  insertNotification,
};
