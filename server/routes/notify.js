"use strict";

/**
 * POST /api/notify — trigger email notifications for deal events.
 *
 * The frontend calls this when the brand/creator takes an action that
 * the other party should be notified about.
 *
 * Body: { type, dealId, senderUserId, ...extra fields per type }
 */

const express = require("express");
const { db } = require("../../lib/db");
const {
  sendEmail,
  briefSubmittedEmail,
  contractSentEmail,
  contractSignedEmail,
  contentSubmittedEmail,
  scriptSharedEmail,
  newMessageEmail,
} = require("../../lib/email");

const router = express.Router();

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
    res.json({ sent: true });
  } catch (err) {
    console.error("[notify]", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
