"use strict";

/**
 * POST /api/notify — trigger email notifications for deal events.
 *
 * The frontend calls this endpoint. It:
 *   1. Looks up the deal and both users from Supabase
 *   2. Determines the recipient
 *   3. Calls the Supabase Edge Function "send-notification-email" to send the email
 *
 * Falls back to sending via Resend directly if the Edge Function isn't available.
 *
 * Body: { type, dealId, senderUserId, ...extra fields per type }
 */

const express = require("express");
const { db } = require("../../lib/db");
const { sendEmail } = require("../../lib/email");

const router = express.Router();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

/**
 * Look up a user's email and name from Supabase auth.
 */
async function getUser(userId) {
  const { data, error } = await db.auth.admin.getUserById(userId);
  if (error || !data?.user) return null;
  const u = data.user;
  return {
    email: u.email,
    name: u.user_metadata?.full_name || u.user_metadata?.company_name || u.email?.split("@")[0] || "",
  };
}

/**
 * Map frontend notification types to Edge Function types.
 */
const TYPE_MAP = {
  brief_submitted:   "brief_sent",
  contract_sent:     "deal_accepted",     // closest match
  contract_signed:   "content_approved",  // closest match
  content_submitted: "content_submitted",
  script_shared:     "new_message",       // script shares as messages
  new_message:       "new_message",
};

/**
 * Call the Supabase Edge Function to send the email.
 */
async function callEdgeFunction(payload) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;

  try {
    const resp = await fetch(
      `${SUPABASE_URL}/functions/v1/send-notification-email`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          apikey: SUPABASE_SERVICE_KEY,
        },
        body: JSON.stringify(payload),
      }
    );
    const data = await resp.json();
    if (resp.ok && data.sent) return data;
    console.warn("[notify] Edge function returned:", data);
    return null;
  } catch (err) {
    console.warn("[notify] Edge function call failed:", err.message);
    return null;
  }
}

router.post("/", async (req, res) => {
  const { type, dealId, senderUserId, fileName, scriptUrl, messagePreview } = req.body;

  if (!type || !dealId || !senderUserId) {
    return res.status(400).json({ error: "type, dealId, and senderUserId are required." });
  }

  try {
    // Look up the deal
    const { data: deals } = await db
      .from("deals")
      .select("*")
      .eq("bridgn_deal_id", String(dealId))
      .limit(1);

    const deal = deals?.[0];
    if (!deal) return res.status(404).json({ error: "Deal not found." });

    const dealTitle = deal.campaign_title || "Deal";

    // Determine sender and recipient
    const isSenderBrand = senderUserId === deal.brand_user_id;
    const recipientId = isSenderBrand ? deal.creator_user_id : deal.brand_user_id;

    if (!recipientId) return res.json({ sent: false, reason: "No recipient on this deal." });

    const sender = await getUser(senderUserId);
    const recipient = await getUser(recipientId);

    if (!recipient?.email) return res.json({ sent: false, reason: "Recipient has no email." });

    const senderName = sender?.name || (isSenderBrand ? (deal.brand_name || "Brand") : (deal.creator_name || "Creator"));
    const recipientName = recipient.name;

    // Try the Edge Function first (uses the branded HTML template)
    const edgeType = TYPE_MAP[type] || type;
    const edgeResult = await callEdgeFunction({
      to: recipient.email,
      type: edgeType,
      senderName,
      recipientName,
      dealName: dealTitle,
      amount: deal.amount_cents ? (deal.amount_cents / 100).toFixed(0) : undefined,
    });

    if (edgeResult?.sent) {
      return res.json({ sent: true, via: "edge-function" });
    }

    // Fall back to direct Resend send via lib/email.js
    const { briefSubmittedEmail, contractSentEmail, contractSignedEmail,
            contentSubmittedEmail, scriptSharedEmail, newMessageEmail } = require("../../lib/email");

    let email;
    switch (type) {
      case "brief_submitted":
        email = briefSubmittedEmail({ creatorName: recipientName, brandName: senderName, dealTitle });
        break;
      case "contract_sent":
        email = contractSentEmail({ creatorName: recipientName, brandName: senderName, dealTitle, hasLink: !!deal.contract_link });
        break;
      case "contract_signed":
        email = contractSignedEmail({ brandName: recipientName, creatorName: senderName, dealTitle });
        break;
      case "content_submitted":
        email = contentSubmittedEmail({ brandName: recipientName, creatorName: senderName, fileName: fileName || null, dealTitle });
        break;
      case "script_shared":
        email = scriptSharedEmail({ brandName: recipientName, creatorName: senderName, scriptUrl: scriptUrl || null, dealTitle });
        break;
      case "new_message":
        email = newMessageEmail({ recipientName, senderName, messagePreview: (messagePreview || "").slice(0, 200), dealTitle });
        break;
      default:
        return res.status(400).json({ error: `Unknown notification type: ${type}` });
    }

    await sendEmail({ to: recipient.email, ...email });
    res.json({ sent: true, via: "resend-direct" });
  } catch (err) {
    console.error("[notify]", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
