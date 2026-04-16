"use strict";

/**
 * Affiliate link routes.
 *
 * GET /r/:code — public redirect endpoint, tracks clicks
 * POST /api/affiliate/conversion — log a conversion manually
 */

const express = require("express");
const { db } = require("../../lib/db");

const router = express.Router();

/**
 * GET /r/:code
 * Tracks a click and redirects to the destination URL.
 * If no destination URL, redirects to bridgn.com.
 */
router.get("/r/:code", async (req, res) => {
  const { code } = req.params;

  try {
    // Look up the link
    const { data: links } = await db
      .from("affiliate_links")
      .select("destination_url, is_active")
      .eq("code", code)
      .limit(1);

    const link = links?.[0];

    if (!link || !link.is_active) {
      return res.redirect("https://bridgn.com");
    }

    // Track the click asynchronously — don't block the redirect
    db.from("affiliate_clicks").insert({
      link_code:  code,
      user_agent: req.headers["user-agent"] || null,
      referrer:   req.headers["referer"] || null,
    }).then(() => {
      // Increment the clicks counter on the link
      db.rpc("increment_affiliate_clicks", { link_code: code }).catch(() => {});
    }).catch(() => {});

    // Redirect to the destination
    const dest = link.destination_url || "https://bridgn.com";
    res.redirect(302, dest);
  } catch (err) {
    console.error("[affiliate/redirect]", err);
    res.redirect("https://bridgn.com");
  }
});

/**
 * POST /api/affiliate/conversion
 * Log a conversion manually.
 *
 * Body: { code, conversionValue, notes }
 * conversionValue is in dollars — stored as cents.
 */
router.post("/conversion", async (req, res) => {
  const { code, conversionValue, notes } = req.body;

  if (!code) {
    return res.status(400).json({ error: "code is required." });
  }

  try {
    // Look up the link to get commission rate
    const { data: links } = await db
      .from("affiliate_links")
      .select("*")
      .eq("code", code)
      .limit(1);

    const link = links?.[0];
    if (!link) return res.status(404).json({ error: "Link not found." });

    const valueCents = Math.round((Number(conversionValue) || 0) * 100);
    let commissionCents;

    if (link.commission_type === "flat" && link.commission_flat_amount) {
      commissionCents = link.commission_flat_amount;
    } else {
      commissionCents = Math.round(valueCents * (link.commission_rate || 10) / 100);
    }

    // Insert conversion record
    const { data: conv, error: convErr } = await db
      .from("affiliate_conversions")
      .insert({
        link_code:        code,
        conversion_value: valueCents,
        commission_amount: commissionCents,
        logged_by:        "manual",
        notes:            notes || null,
      })
      .select()
      .single();

    if (convErr) throw convErr;

    // Update aggregates on the link
    await db
      .from("affiliate_links")
      .update({
        conversions:       (link.conversions || 0) + 1,
        revenue:           (link.revenue || 0) + valueCents,
        commission_earned: (link.commission_earned || 0) + commissionCents,
      })
      .eq("id", link.id);

    res.json({
      conversion: conv,
      link_totals: {
        conversions: (link.conversions || 0) + 1,
        revenue:     (link.revenue || 0) + valueCents,
        commission:  (link.commission_earned || 0) + commissionCents,
      },
    });
  } catch (err) {
    console.error("[affiliate/conversion]", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
