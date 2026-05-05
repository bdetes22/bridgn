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
  db,
  insertDeal,
  getDealsForUser,
  getDealByBridgnDealId,
  updateDealById,
  insertNotification,
  getCreatorProfile,
  getBrandProfile,
  upsertBrandProfile,
} = require("../../lib/db");
const { sendEmail, dealInviteEmail, deadlineReminderEmail } = require("../../lib/email");
const { stripe } = require("../../lib/stripe");

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
    escrow:          ["payment_held", "content_delivered", "content_live", "payment_released", "payment_disputed"].includes(row.status),
    escrowReleased:  row.status === "payment_released",
    paymentIntentId: row.payment_intent_id,
    autoReleaseAt:   row.auto_release_at,
    escrowReleaseDays: row.auto_release_days || 14,
    // Brief
    briefFile:         row.brief_file_name ? { name: row.brief_file_name, size: 0, dataUrl: row.brief_file_data || "" } : null,
    briefLink:         row.brief_link || "",
    briefComments:     row.brief_comments || "",
    briefSubmitted:    !!row.brief_submitted,
    briefAcknowledged: !!row.brief_acknowledged,
    // Contract
    contractFile:      row.contract_file_name ? { name: row.contract_file_name, size: 0, dataUrl: row.contract_file_data || "" } : null,
    signedFile:        row.signed_file_name ? { name: row.signed_file_name, size: 0, dataUrl: row.signed_file_data || "" } : null,
    contentFile:       row.content_file_name ? { name: row.content_file_name, size: 0, dataUrl: row.content_file_data || "" } : null,
    scriptUrl:         row.script_url || "",
    scriptSubmitted:   !!row.script_submitted,
    approvedDeliverables: row.approved_deliverables || [],
    contractLink:      row.contract_link || "",
    contractNotes:     row.contract_notes || "",
    contractSent:      !!row.contract_sent,
    contractSigned:    !!row.contract_signed,
    contractSignedAt:  row.contract_signed_at,
    // Post details
    postCta:           row.post_cta || "",
    postLink:          row.post_link || "",
    postCaption:       row.post_caption || "",
    postDetailsSent:   !!row.post_details_sent,
    // Partial escrow / Net 30
    upfrontPct:        row.upfront_pct ?? 100,
    contentLiveAt:     row.content_live_at,
    net30DueAt:        row.net30_due_at,
    upfrontReleased:   !!row.upfront_released,
    remainingPaid:     !!row.remaining_payment_intent_id,
    // Creator workspace (private)
    creatorWorkspace:  row.creator_workspace || {},
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
    brandUserId, brandName, brandEmail,
    creatorEmail, inviteeEmail,
    amount, platform, deliverables, deadline, campaignTitle,
    inviteLink, createdBy, upfrontPct,
  } = req.body;

  // Either side can create a deal
  if (!bridgnDealId || (!creatorUserId && !brandUserId)) {
    return res.status(400).json({ error: "bridgnDealId and either creatorUserId or brandUserId are required." });
  }

  try {
    // Block delinquent brands from creating new deals
    if (brandUserId) {
      const brandProfile = await getBrandProfile(brandUserId);
      if (brandProfile?.payment_delinquent) {
        return res.status(403).json({ error: "Account flagged for overdue payments. Please settle outstanding balances before creating new deals." });
      }
    }

    const row = await insertDeal({
      bridgn_deal_id:  String(bridgnDealId),
      creator_user_id: creatorUserId || null,
      creator_name:    creatorName || "",
      brand_user_id:   brandUserId || null,
      brand_name:      brandName || "",
      amount_cents:    Math.round((Number(amount) || 0) * 100),
      platform:        platform || "Instagram",
      deliverables:    deliverables || "",
      deadline:        deadline || "TBD",
      campaign_title:  campaignTitle || "",
      source:          "external",
      status:          "pending",
      progress:        0,
      upfront_pct:     Math.max(0, Math.min(100, parseInt(upfrontPct) || 100)),
    });

    // Send invite email to the other party (non-blocking)
    const emailTo = inviteeEmail || (createdBy === "brand" ? creatorEmail : brandEmail);
    if (emailTo && inviteLink) {
      const senderName = createdBy === "brand" ? (brandName || "A brand") : (creatorName || "A creator");
      const recipientName = createdBy === "brand" ? (creatorName || "") : (brandName || "");
      const email = dealInviteEmail({
        recipientName,
        senderName,
        senderRole: createdBy || "creator",
        dealTitle: campaignTitle || "External Deal",
        amount: Number(amount) || 0,
        platform: platform || "Instagram",
        deliverables: deliverables || "",
        deadline: deadline || "TBD",
        inviteLink,
      });
      sendEmail({ to: emailTo, ...email }).catch(err => {
        console.warn("[deals/create] Invite email failed:", err.message);
      });
    }

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

// ─── POST /api/deals/join — brand or creator claims a deal ──────────────────

router.post("/join", async (req, res) => {
  const { bridgnDealId, brandUserId, creatorUserId } = req.body;

  if (!bridgnDealId || (!brandUserId && !creatorUserId)) {
    return res.status(400).json({ error: "bridgnDealId and either brandUserId or creatorUserId are required." });
  }

  try {
    const deal = await getDealByBridgnDealId(bridgnDealId);

    if (!deal) {
      return res.status(404).json({ error: "Deal not found." });
    }

    const updates = { status: "Active" };

    // Brand joining a creator-created deal
    if (brandUserId && !deal.brand_user_id) {
      updates.brand_user_id = brandUserId;
    }

    // Creator joining a brand-created deal
    if (creatorUserId && !deal.creator_user_id) {
      updates.creator_user_id = creatorUserId;
    }

    if (Object.keys(updates).length > 1) {
      await updateDealById(deal.id, updates);
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

// ─── PUT /api/deals/mark-live — creator marks content as LIVE ────────────────
// Sets content_live_at, net30_due_at, and auto-releases upfront escrow to creator.

router.put("/mark-live", async (req, res) => {
  const { bridgnDealId, userId, postLink } = req.body;

  if (!bridgnDealId || !userId) {
    return res.status(400).json({ error: "bridgnDealId and userId are required." });
  }

  try {
    const deal = await getDealByBridgnDealId(bridgnDealId);
    if (!deal) return res.status(404).json({ error: "Deal not found." });

    // Only the creator can mark content as LIVE
    if (deal.creator_user_id !== userId) {
      return res.status(403).json({ error: "Only the creator can mark content as LIVE." });
    }

    // Don't allow re-marking
    if (deal.content_live_at) {
      return res.status(409).json({ error: "Content is already marked as LIVE." });
    }

    const now = new Date();
    const net30Due = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const updates = {
      post_link: postLink || deal.post_link || "",
      content_live_at: now.toISOString(),
      net30_due_at: net30Due.toISOString(),
      status: "content_live",
    };

    // Auto-release upfront escrow to creator if partial payment was held
    const upPct = deal.upfront_pct || 100;
    const isPartial = upPct < 100;
    const hasPaid = !!deal.payment_intent_id;
    const isHeld = ["payment_held", "content_delivered"].includes(deal.status);

    if (isPartial && hasPaid && isHeld && !deal.upfront_released) {
      const creatorProfile = await getCreatorProfile(deal.creator_user_id);
      if (creatorProfile?.stripe_account_id) {
        const upfrontCents = Math.round(deal.amount_cents * upPct / 100);
        const transfer = await stripe.transfers.create({
          amount: upfrontCents,
          currency: "usd",
          destination: creatorProfile.stripe_account_id,
          metadata: {
            bridgn_deal_id: deal.bridgn_deal_id,
            payment_intent_id: deal.payment_intent_id,
            transfer_type: "upfront_release",
            upfront_pct: String(upPct),
          },
        });
        updates.upfront_released = true;
        updates.transfer_id = transfer.id;
        updates.escrow_released_at = now.toISOString();

        // Notify creator about upfront release
        await insertNotification(deal.creator_user_id, "payment_released", {
          bridgn_deal_id: deal.bridgn_deal_id,
          amount_cents: upfrontCents,
          message: `Upfront payment of $${(upfrontCents / 100).toFixed(2)} (${upPct}%) has been released — content is LIVE!`,
        });
      }
    }

    // For full-payment deals, also release on LIVE
    if (!isPartial && hasPaid && isHeld && !deal.transfer_id) {
      const creatorProfile = await getCreatorProfile(deal.creator_user_id);
      if (creatorProfile?.stripe_account_id) {
        const transfer = await stripe.transfers.create({
          amount: deal.amount_cents,
          currency: "usd",
          destination: creatorProfile.stripe_account_id,
          metadata: {
            bridgn_deal_id: deal.bridgn_deal_id,
            payment_intent_id: deal.payment_intent_id,
            transfer_type: "full_release_on_live",
          },
        });
        updates.status = "payment_released";
        updates.transfer_id = transfer.id;
        updates.escrow_released_at = now.toISOString();
        updates.upfront_released = true;

        await insertNotification(deal.creator_user_id, "payment_released", {
          bridgn_deal_id: deal.bridgn_deal_id,
          amount_cents: deal.amount_cents,
          message: `Payment of $${(deal.amount_cents / 100).toFixed(2)} has been released — content is LIVE!`,
        });
      }
    }

    // Notify brand about content going LIVE
    if (deal.brand_user_id) {
      const remainingCents = isPartial ? deal.amount_cents - Math.round(deal.amount_cents * upPct / 100) : 0;
      await insertNotification(deal.brand_user_id, "content_live", {
        bridgn_deal_id: deal.bridgn_deal_id,
        post_link: postLink || "",
        message: isPartial
          ? `Content is LIVE! Remaining balance of $${(remainingCents / 100).toFixed(2)} is due by ${net30Due.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.`
          : `Content is LIVE! ${postLink ? "View it here: " + postLink : ""}`,
      });
    }

    const updated = await updateDealById(deal.id, updates);
    res.json({ deal: dealToFrontend(updated) });
  } catch (err) {
    console.error("[deals/mark-live]", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/deals/update — update arbitrary deal fields ────────────────────
// Used to persist brief, contract, and other deal state changes.

const ALLOWED_FIELDS = [
  "brief_file_name", "brief_file_data", "brief_link", "brief_comments",
  "brief_submitted", "brief_acknowledged",
  "contract_file_name", "contract_file_data", "contract_link", "contract_notes",
  "contract_sent", "contract_signed", "contract_signed_at",
  "signed_file_name", "signed_file_data",
  "content_file_name", "content_file_data",
  "script_url", "script_submitted",
  "approved_deliverables",
  "status", "progress",
  "deadline", "campaign_title", "sent_reminders",
  "post_cta", "post_link", "post_caption", "post_details_sent",
  "creator_workspace",
  "upfront_pct", "content_live_at", "net30_due_at", "upfront_released",
];

router.put("/update", async (req, res) => {
  const { bridgnDealId, userId, fields } = req.body;

  if (!bridgnDealId || !fields || typeof fields !== "object") {
    return res.status(400).json({ error: "bridgnDealId and fields are required." });
  }

  try {
    const deal = await getDealByBridgnDealId(bridgnDealId);
    if (!deal) return res.status(404).json({ error: "Deal not found." });

    if (userId && deal.creator_user_id !== userId && deal.brand_user_id !== userId) {
      return res.status(403).json({ error: "Not authorized." });
    }

    // Only allow whitelisted columns
    const safe = {};
    for (const [k, v] of Object.entries(fields)) {
      if (ALLOWED_FIELDS.includes(k)) safe[k] = v;
    }

    if (Object.keys(safe).length === 0) {
      return res.status(400).json({ error: "No valid fields to update." });
    }

    const updated = await updateDealById(deal.id, safe);
    res.json({ deal: dealToFrontend(updated) });
  } catch (err) {
    console.error("[deals/update]", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/deals/check-deadlines — send deadline reminder emails ──────────
// Called by a cron job (Render Cron) once daily at 9am ET.
// Sends reminders at 7 days, 3 days, and 1 day before deadline.
// Tracks sent reminders via deal metadata to avoid duplicates.

router.get("/check-deadlines", async (req, res) => {
  // Only run between 8am-11am ET to avoid middle-of-night emails
  const etHour = new Date().toLocaleString("en-US", { timeZone: "America/New_York", hour: "numeric", hour12: false });
  const hour = parseInt(etHour);
  if (hour < 8 || hour > 11) {
    return res.json({ skipped: true, reason: `Outside notification window (${hour} ET)` });
  }

  try {
    const { data: allDeals, error } = await db
      .from("deals")
      .select("*")
      .not("deadline", "is", null)
      .not("status", "in", '("payment_released","Completed")');

    if (error) throw error;
    if (!allDeals?.length) return res.json({ checked: 0, sent: 0 });

    const now = new Date();
    let sent = 0;

    for (const deal of allDeals) {
      if (!deal.deadline || deal.deadline === "TBD") continue;

      const deadlineDate = new Date(deal.deadline + "T00:00:00");
      const diffMs = deadlineDate - now;
      const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      // Determine which reminder to send (if any)
      let reminderKey = null;
      if (daysLeft === 7) reminderKey = "reminder_7d";
      else if (daysLeft === 3) reminderKey = "reminder_3d";
      else if (daysLeft === 1) reminderKey = "reminder_1d";
      else continue;

      // Check if we already sent this reminder (stored as comma-separated string in deal metadata)
      const sentReminders = (deal.sent_reminders || "").split(",").filter(Boolean);
      if (sentReminders.includes(reminderKey)) continue;

      // Format deadline for email
      const deadlineFormatted = deadlineDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
      const dealTitle = deal.campaign_title || "Deal";

      // Look up both users
      const getUser = async (userId) => {
        if (!userId) return null;
        const { data, error } = await db.auth.admin.getUserById(userId);
        if (error || !data?.user) return null;
        const u = data.user;
        return { email: u.email, name: u.user_metadata?.full_name || u.user_metadata?.company_name || u.email?.split("@")[0] || "" };
      };

      const creator = await getUser(deal.creator_user_id);
      const brand = await getUser(deal.brand_user_id);

      // Send to creator
      if (creator?.email) {
        const email = deadlineReminderEmail({
          recipientName: creator.name, dealTitle, deadline: deadlineFormatted,
          daysLeft, partnerName: brand?.name || deal.brand_name || "the brand",
        });
        await sendEmail({ to: creator.email, ...email });
        sent++;
      }

      // Send to brand
      if (brand?.email) {
        const email = deadlineReminderEmail({
          recipientName: brand.name, dealTitle, deadline: deadlineFormatted,
          daysLeft, partnerName: creator?.name || deal.creator_name || "the creator",
        });
        await sendEmail({ to: brand.email, ...email });
        sent++;
      }

      // Mark reminder as sent
      sentReminders.push(reminderKey);
      await updateDealById(deal.id, { sent_reminders: sentReminders.join(",") });
    }

    // ── Net 30 escalation for remaining balance payments ──
    const { data: liveDealRows } = await db
      .from("deals")
      .select("*")
      .not("content_live_at", "is", null)
      .is("remaining_payment_intent_id", null)
      .not("status", "in", '("payment_released","Completed","payment_disputed")');

    for (const deal of (liveDealRows || [])) {
      const upPct = deal.upfront_pct || 100;
      if (upPct >= 100) continue; // Full payment deal, no remaining balance

      const liveAt = new Date(deal.content_live_at);
      const daysSinceLive = Math.floor((now - liveAt) / (1000 * 60 * 60 * 24));
      const sentReminders = (deal.sent_reminders || "").split(",").filter(Boolean);

      // Day 25: reminder
      if (daysSinceLive >= 25 && !sentReminders.includes("net30_day25")) {
        if (deal.brand_user_id) {
          const remainCents = Math.round(deal.amount_cents * (100 - upPct) / 100);
          await insertNotification(deal.brand_user_id, "payment_reminder", {
            bridgn_deal_id: deal.bridgn_deal_id,
            amount_cents: remainCents,
            message: `Reminder: Remaining payment of $${(remainCents / 100).toFixed(2)} is due in 5 days.`,
          });
        }
        sentReminders.push("net30_day25");
        await updateDealById(deal.id, { sent_reminders: sentReminders.join(",") });
        sent++;
      }

      // Day 30: status → payment_overdue
      if (daysSinceLive >= 30 && deal.status !== "payment_overdue") {
        await updateDealById(deal.id, { status: "payment_overdue" });
        if (deal.brand_user_id) {
          const remainCents = Math.round(deal.amount_cents * (100 - upPct) / 100);
          await insertNotification(deal.brand_user_id, "payment_overdue", {
            bridgn_deal_id: deal.bridgn_deal_id,
            amount_cents: remainCents,
            message: `Payment of $${(remainCents / 100).toFixed(2)} is now overdue. Please pay immediately to avoid account restrictions.`,
          });
        }
        if (deal.creator_user_id) {
          await insertNotification(deal.creator_user_id, "payment_overdue", {
            bridgn_deal_id: deal.bridgn_deal_id,
            message: `The brand's remaining payment is now overdue. We're following up with them.`,
          });
        }
        sent++;
      }

      // Day 37: warning about account flagging
      if (daysSinceLive >= 37 && !sentReminders.includes("net30_day37")) {
        if (deal.brand_user_id) {
          await insertNotification(deal.brand_user_id, "payment_warning", {
            bridgn_deal_id: deal.bridgn_deal_id,
            message: `Final warning: Your account will be flagged in 8 days if the remaining balance is not paid. You will be unable to create new deals.`,
          });
        }
        sentReminders.push("net30_day37");
        await updateDealById(deal.id, { sent_reminders: sentReminders.join(",") });
        sent++;
      }

      // Day 45: flag brand as delinquent
      if (daysSinceLive >= 45 && !sentReminders.includes("net30_day45")) {
        if (deal.brand_user_id) {
          await upsertBrandProfile(deal.brand_user_id, {
            payment_delinquent: true,
            delinquent_at: new Date().toISOString(),
          });
          await insertNotification(deal.brand_user_id, "account_flagged", {
            bridgn_deal_id: deal.bridgn_deal_id,
            message: `Your account has been flagged for overdue payments. You cannot create new deals until the outstanding balance is settled.`,
          });
        }
        sentReminders.push("net30_day45");
        await updateDealById(deal.id, { sent_reminders: sentReminders.join(",") });
        sent++;
      }
    }

    res.json({ checked: allDeals.length, liveChecked: (liveDealRows||[]).length, sent });
  } catch (err) {
    console.error("[check-deadlines]", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/deals/collaborators — past deal partners ──────────────────────

router.get("/collaborators", async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: "userId is required." });

  try {
    const { data: completedDeals, error } = await db
      .from("deals")
      .select("*")
      .or(`creator_user_id.eq.${userId},brand_user_id.eq.${userId}`)
      .in("status", ["payment_released", "Completed", "content_live"]);

    if (error) throw error;
    if (!completedDeals?.length) return res.json({ collaborators: [] });

    // Group by partner
    const partnerMap = {};
    for (const deal of completedDeals) {
      const isCreator = deal.creator_user_id === userId;
      const partnerId = isCreator ? deal.brand_user_id : deal.creator_user_id;
      const partnerName = isCreator ? (deal.brand_name || "Brand") : (deal.creator_name || "Creator");
      if (!partnerId) continue;

      if (!partnerMap[partnerId]) {
        partnerMap[partnerId] = {
          userId: partnerId,
          name: partnerName,
          initials: partnerName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase(),
          dealCount: 0,
          lastDealDate: null,
          totalAmount: 0,
        };
      }
      partnerMap[partnerId].dealCount++;
      partnerMap[partnerId].totalAmount += Math.round((deal.amount_cents || 0) / 100);
      const dealDate = deal.created_at || deal.updated_at;
      if (!partnerMap[partnerId].lastDealDate || dealDate > partnerMap[partnerId].lastDealDate) {
        partnerMap[partnerId].lastDealDate = dealDate;
      }
    }

    const collaborators = Object.values(partnerMap).sort((a, b) => {
      if (b.lastDealDate && a.lastDealDate) return new Date(b.lastDealDate) - new Date(a.lastDealDate);
      return b.dealCount - a.dealCount;
    });

    res.json({ collaborators });
  } catch (err) {
    console.error("[deals/collaborators]", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/deals/profile/:userId — public profile info ────────────────────

router.get("/profile/:userId", async (req, res) => {
  const { userId } = req.params;
  if (!userId) return res.status(400).json({ error: "userId is required." });

  try {
    const { data, error } = await db.auth.admin.getUserById(userId);
    if (error || !data?.user) return res.json({ profile: null });

    const meta = data.user.user_metadata || {};
    res.json({
      profile: {
        name: meta.full_name || meta.company_name || data.user.email?.split("@")[0] || "",
        email: data.user.email,
        role: meta.role || "creator",
        socials: meta.brand_socials || null,
      },
    });
  } catch (err) {
    console.error("[deals/profile]", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
