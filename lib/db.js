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

module.exports = { db, getCreatorProfile, upsertCreatorProfile };
