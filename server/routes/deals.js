"use strict";

/**
 * Deal CRUD routes.
 *
 * POST /api/deals          — creator creates a deal (persists to Supabase)
 * GET  /api/deals          — load all deals for the authenticated user
 * POST /api/deals/join     — brand claims a deal via invite
 * PUT  /api/deals/status   — update deal status (e.g. content_delivered)
 */

const express = require("express");
const {
  insertDeal,
  getDealsForUser,
  getDealByBridgnDealId,
  updateDealById,
} = require("../../lib/db");

const router = express.Router();

// ─── Helpers: convert between frontend shape (dollars) and DB shape (cents) ──

function dealToFrontend(row) {
  return {
    id:              row.bridgn_deal_id,
    dbId:            row.id,
    brand:           row.brand_name || "Brand",
    bi:              (row.brand_name || "BR").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase(),
    ci:              Math.abs(hashCode(row.bridgn_deal_id)) % 6,
    amount:          Math.round((row.amount_cents || 0) / 100),
    platform:        row.platform || "Instagram",
    status:          row.status || "pending",
    deadline:        row.deadline || "TBD",
    deliverables:    row.deliverables || "",
    progress:        row.progress || 0,
    source:          row.source || "external",
    campaignTitle:   row.campaign_title || "",
    creatorUserId:   row.creator_user_id,
    brandUserId:     row.brand_user_id,
    creatorName:     row.creator_name || "",
    escrow:          ["payment_held", "content_delivered", "payment_released", "payment_disputed"].includes(row.status),
    escrowReleased:  row.status === "payment_released",
    paymentIntentId: row.payment_intent_id,
    autoReleaseAt:   row.auto_release_at,
    escrowReleaseDays: row.auto_release_days || 14,
  };
}

function hashCode(str) {
  let h = 0;
  for (let i = 0; i < (str || "").length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return h;
}

// ─── POST /api/deals — create a deal ──────────────────────────────────────────

router.post("/", async (req, res) => {
  const {
    bridgnDealId, creatorUserId, creatorName,
    brandName, brandEmail, amount, platform,
    deliverables, deadline, campaignTitle,
  } = req.body;

  if (!bridgnDealId || !creatorUserId) {
    return res.status(400).json({ error: "bridgnDealId and creatorUserId are required." });
  }

  try {
    const row = await insertDeal({
      bridgn_deal_id:  String(bridgnDealId),
      creator_user_id: creatorUserId,
      creator_name:    creatorName || "",
      brand_name:      brandName || "",
      amount_cents:    Math.round((Number(amount) || 0) * 100),
      platform:        platform || "Instagram",
      deliverables:    deliverables || "",
      deadline:        deadline || "TBD",
      campaign_title:  campaignTitle || "",
      source:          "external",
      status:          "pending",
      progress:        0,
    });

    res.json({ deal: dealToFrontend(row) });
  } catch (err) {
    console.error("[deals/create]", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/deals?userId=X — load deals for a user ─────────────────────────

router.get("/", async (req, res) => {
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({ error: "userId query parameter is required." });
  }

  try {
    const rows = await getDealsForUser(userId);
    res.json({ deals: rows.map(dealToFrontend) });
  } catch (err) {
    console.error("[deals/list]", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/deals/join — brand claims a deal ──────────────────────────────

router.post("/join", async (req, res) => {
  const { bridgnDealId, brandUserId } = req.body;

  if (!bridgnDealId || !brandUserId) {
    return res.status(400).json({ error: "bridgnDealId and brandUserId are required." });
  }

  try {
    const deal = await getDealByBridgnDealId(bridgnDealId);

    if (!deal) {
      return res.status(404).json({ error: "Deal not found." });
    }

    // Only set brand if not already claimed
    if (!deal.brand_user_id) {
      await updateDealById(deal.id, { brand_user_id: brandUserId, status: "Active" });
    }

    // Re-fetch to get updated row
    const updated = await getDealByBridgnDealId(bridgnDealId);
    res.json({ deal: dealToFrontend(updated) });
  } catch (err) {
    console.error("[deals/join]", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/deals/status — update deal status ──────────────────────────────

router.put("/status", async (req, res) => {
  const { bridgnDealId, status, userId } = req.body;

  if (!bridgnDealId || !status) {
    return res.status(400).json({ error: "bridgnDealId and status are required." });
  }

  try {
    const deal = await getDealByBridgnDealId(bridgnDealId);

    if (!deal) {
      return res.status(404).json({ error: "Deal not found." });
    }

    // Verify the user is part of this deal
    if (userId && deal.creator_user_id !== userId && deal.brand_user_id !== userId) {
      return res.status(403).json({ error: "Not authorized to update this deal." });
    }

    const updated = await updateDealById(deal.id, { status });
    res.json({ deal: dealToFrontend(updated) });
  } catch (err) {
    console.error("[deals/status]", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
