#!/usr/bin/env node
"use strict";

/**
 * Run migration 024 via the Supabase service-role client.
 * Usage: node supabase/run-migration-024.js
 */

require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

async function run() {
  console.log("Running migration 024: partial escrow + Net 30...\n");

  // Strategy: try to read the new columns. If they don't exist, tell the user.
  const { data: testDeal, error: testErr } = await db
    .from("deals")
    .select("upfront_pct")
    .limit(1);

  if (testErr && testErr.message.includes("upfront_pct")) {
    console.log("Column 'upfront_pct' does NOT exist yet.");
    console.log("\nYou need to run this SQL in the Supabase Dashboard SQL Editor:");
    console.log("  https://supabase.com/dashboard/project/uyucrqodrhrtqcgsfuei/sql\n");
    console.log("─".repeat(60));
    const fs = require("fs");
    const sql = fs.readFileSync(__dirname + "/migrations/024_partial_escrow_net30.sql", "utf8");
    console.log(sql);
    console.log("─".repeat(60));
    process.exit(1);
  } else if (testErr) {
    console.error("Unexpected error:", testErr.message);
    process.exit(1);
  } else {
    console.log("Migration 024 columns already exist! Nothing to do.");
    console.log("  - upfront_pct: OK");

    // Check the other columns too
    const checks = ["content_live_at", "net30_due_at", "remaining_payment_intent_id", "upfront_released"];
    for (const col of checks) {
      const { error } = await db.from("deals").select(col).limit(1);
      console.log(`  - ${col}: ${error ? "MISSING" : "OK"}`);
    }

    const { error: bpErr } = await db.from("brand_profiles").select("payment_delinquent").limit(1);
    console.log(`  - brand_profiles.payment_delinquent: ${bpErr ? "MISSING" : "OK"}`);
  }
}

run().catch(e => { console.error(e); process.exit(1); });
