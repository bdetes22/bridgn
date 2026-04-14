"use strict";

/**
 * POST /api/stripe/webhooks
 *
 * Receives Stripe event notifications, verifies the signature, then dispatches
 * to the appropriate handler. Every handler is fire-and-forget from Stripe's
 * perspective — we always return 200 after signature verification so Stripe
 * does not retry events we've already accepted. Errors inside handlers are
 * caught, logged, and do not cause a non-200 response.
 *
 * Events handled:
 *   payment_intent.succeeded     → deal status "payment_complete"
 *   payment_intent.payment_failed → deal status "payment_failed" + brand notif
 *   account.updated              → creator onboarding / flagging
 *   payout.paid                  → log creator payout + creator notif
 *   charge.dispute.created       → deal status "disputed" + admin flag
 */

const express = require("express");
const { stripe, STRIPE_WEBHOOK_SECRET, PLATFORM_FEE_PERCENT } = require("../../lib/stripe");
const {
  getDealByPaymentIntentId,
  upsertDeal,
  getCreatorProfileByStripeAccount,
  updateCreatorProfileByStripeAccount,
  insertNotification,
} = require("../../lib/db");

const router = express.Router();

// ─── Structured logging helpers ───────────────────────────────────────────────

const log = {
  info:  (event, msg, data = {}) => console.log( JSON.stringify({ level:"info",  event, msg, ...data, ts: new Date().toISOString() })),
  warn:  (event, msg, data = {}) => console.warn( JSON.stringify({ level:"warn",  event, msg, ...data, ts: new Date().toISOString() })),
  error: (event, msg, data = {}) => console.error(JSON.stringify({ level:"error", event, msg, ...data, ts: new Date().toISOString() })),
};

// ─── Event handlers ───────────────────────────────────────────────────────────

/**
 * payment_intent.succeeded
 *
 * ACH debit settled. Funds are now on the bridgn platform balance (escrow).
 * Update the deal to "payment_held" and compute the auto-release date.
 * A separate Transfer will move funds to the creator when the brand releases.
 */
async function onPaymentIntentSucceeded(pi) {
  const dealId     = pi.metadata?.bridgn_deal_id           || null;
  const brandId    = pi.metadata?.bridgn_brand_id          || null;
  const creatorId  = pi.metadata?.bridgn_creator_id        || null;
  const releaseDays= parseInt(pi.metadata?.escrow_release_days, 10) || 14;

  const amountCents      = pi.amount;
  const feePct           = parseFloat(pi.metadata?.platform_fee_pct) || PLATFORM_FEE_PERCENT;
  const feeCents         = Math.round(amountCents * feePct);
  const creatorNetCents  = amountCents - feeCents;

  // Compute auto-release timestamp
  const autoReleaseAt = new Date(Date.now() + releaseDays * 24 * 60 * 60 * 1000).toISOString();

  log.info("payment_intent.succeeded", "ACH settled — funds held in escrow", {
    paymentIntentId:   pi.id,
    bridgn_deal_id:    dealId,
    charged_usd:       (amountCents     / 100).toFixed(2),
    platform_fee_usd:  (feeCents        / 100).toFixed(2),
    creator_net_usd:   (creatorNetCents / 100).toFixed(2),
    escrow_release_days: releaseDays,
    auto_release_at:   autoReleaseAt,
    brand_user_id:     brandId,
    creator_user_id:   creatorId,
  });

  await upsertDeal(pi.id, {
    bridgn_deal_id:        dealId || pi.id,
    status:                "payment_held",
    brand_user_id:         brandId   || undefined,
    creator_user_id:       creatorId || undefined,
    amount_cents:          amountCents,
    application_fee_cents: feeCents,
    auto_release_days:     releaseDays,
    auto_release_at:       autoReleaseAt,
    payment_failure_reason: null,
  });

  // Notify both parties
  if (brandId) {
    await insertNotification(brandId, "payment_held", {
      bridgn_deal_id: dealId,
      amount_cents:   amountCents,
      message: `Your payment of $${(amountCents / 100).toFixed(2)} has settled and is held in escrow. Release it after the creator delivers, or it auto-releases in ${releaseDays} days.`,
    });
  }
  if (creatorId) {
    await insertNotification(creatorId, "payment_held", {
      bridgn_deal_id: dealId,
      amount_cents:   creatorNetCents,
      message: `$${(creatorNetCents / 100).toFixed(2)} is held in escrow for your deal. Deliver your content and the brand will release payment.`,
    });
  }
}

/**
 * payment_intent.payment_failed
 *
 * ACH debit was rejected (insufficient funds, closed account, etc.).
 * Update the deal to "payment_failed", persist the failure reason, and
 * insert a notification so the brand is alerted in-app.
 */
async function onPaymentIntentFailed(pi) {
  const dealId   = pi.metadata?.bridgn_deal_id   || null;
  const brandId  = pi.metadata?.bridgn_brand_id   || null;
  const creatorId= pi.metadata?.bridgn_creator_id || null;

  // last_payment_error is the most recent decline reason from Stripe
  const failureCode    = pi.last_payment_error?.code    || "unknown";
  const failureMessage = pi.last_payment_error?.message || "Payment was declined.";
  const declineCode    = pi.last_payment_error?.decline_code || null;

  log.warn("payment_intent.payment_failed", "ACH payment failed", {
    paymentIntentId: pi.id,
    bridgn_deal_id:  dealId,
    failure_code:    failureCode,
    decline_code:    declineCode,
    failure_message: failureMessage,
    brand_user_id:   brandId,
  });

  await upsertDeal(pi.id, {
    bridgn_deal_id:         dealId || pi.id,
    status:                 "payment_failed",
    brand_user_id:          brandId    || undefined,
    creator_user_id:        creatorId  || undefined,
    amount_cents:           pi.amount,
    payment_failure_reason: failureMessage,
  });

  // Notify the brand in-app so they can retry with a different bank account
  if (brandId) {
    await insertNotification(brandId, "payment_failed", {
      paymentIntentId: pi.id,
      bridgn_deal_id:  dealId,
      amount_cents:    pi.amount,
      failure_code:    failureCode,
      failure_message: failureMessage,
      message: `Your ACH payment of $${(pi.amount / 100).toFixed(2)} failed. Reason: ${failureMessage} Please return to the Deal Room to retry.`,
    });
  }
}

/**
 * account.updated  (connected account event)
 *
 * Fired whenever Stripe updates a connected account's verification status.
 * Two cases we care about:
 *   - charges_enabled flipped to true  → mark creator fully onboarded
 *   - requirements.past_due is non-empty → flag the account for attention
 *
 * `event.account` is the connected account ID for Connect-originated events.
 */
async function onAccountUpdated(account, stripeAccountId) {
  const chargesEnabled  = !!account.charges_enabled;
  const pastDueItems    = account.requirements?.past_due ?? [];
  const hasPastDue      = pastDueItems.length > 0;

  log.info("account.updated", "Connected account status changed", {
    stripeAccountId,
    charges_enabled:      chargesEnabled,
    requirements_past_due: hasPastDue,
    past_due_items:       pastDueItems,
    details_submitted:    account.details_submitted,
    payouts_enabled:      account.payouts_enabled,
  });

  const updates = {
    charges_enabled:       chargesEnabled,
    requirements_past_due: hasPastDue,
  };

  // If Stripe has fully verified the account, stamp the onboarded timestamp
  if (chargesEnabled) {
    updates.stripe_onboarded_at = new Date().toISOString();
  }

  const updated = await updateCreatorProfileByStripeAccount(stripeAccountId, updates);

  if (!updated) {
    // The connected account isn't in our DB yet — this can happen if a test
    // account is registered directly in the Stripe Dashboard.
    log.warn("account.updated", "No creator_profiles row found for account", { stripeAccountId });
    return;
  }

  if (hasPastDue) {
    log.warn("account.updated", "Creator account has past-due requirements — payouts may be paused", {
      stripeAccountId,
      user_id:       updated.user_id,
      past_due_items: pastDueItems,
    });
  }
}

/**
 * payout.paid  (connected account event)
 *
 * Stripe has sent funds from the creator's Stripe balance to their bank.
 * Log it and insert an in-app notification.
 *
 * `stripeAccountId` is the connected account ID (`event.account`).
 */
async function onPayoutPaid(payout, stripeAccountId) {
  const amountCents  = payout.amount;
  const arrivalDate  = new Date(payout.arrival_date * 1000).toISOString().slice(0, 10);
  const bankLast4    = payout.destination_details?.bank?.last4 ?? null;

  log.info("payout.paid", "Creator payout sent to bank", {
    payoutId:        payout.id,
    stripeAccountId,
    amount_usd:      (amountCents / 100).toFixed(2),
    currency:        payout.currency,
    arrival_date:    arrivalDate,
    bank_last4:      bankLast4,
    method:          payout.method,
  });

  // Look up the creator so we can insert their notification
  const creatorProfile = await getCreatorProfileByStripeAccount(stripeAccountId);

  if (!creatorProfile) {
    log.warn("payout.paid", "No creator found for connected account", { stripeAccountId });
    return;
  }

  await insertNotification(creatorProfile.user_id, "payout_received", {
    payoutId:     payout.id,
    amount_cents: amountCents,
    amount_usd:   (amountCents / 100).toFixed(2),
    currency:     payout.currency,
    arrival_date: arrivalDate,
    bank_last4:   bankLast4,
    message: `$${(amountCents / 100).toFixed(2)} has been sent to your bank account${bankLast4 ? ` ending in ${bankLast4}` : ""}. Funds typically arrive by ${arrivalDate}.`,
  });
}

/**
 * charge.dispute.created
 *
 * A brand has filed a chargeback or Stripe has initiated a dispute on an ACH
 * debit. Update the deal to "disputed", flag it for admin review, and log the
 * dispute details so the ops team can pull the evidence.
 */
async function onDisputeCreated(dispute) {
  const paymentIntentId = dispute.payment_intent;

  if (!paymentIntentId) {
    log.warn("charge.dispute.created", "Dispute has no payment_intent — skipping deal update", {
      disputeId: dispute.id,
    });
    return;
  }

  // Fetch the PaymentIntent to recover the bridgn deal metadata
  const pi      = await stripe.paymentIntents.retrieve(paymentIntentId);
  const dealId  = pi.metadata?.bridgn_deal_id   || null;
  const brandId = pi.metadata?.bridgn_brand_id   || null;
  const creatorId = pi.metadata?.bridgn_creator_id || null;

  const evidenceDue = dispute.evidence_details?.due_by
    ? new Date(dispute.evidence_details.due_by * 1000).toISOString()
    : null;

  log.warn("charge.dispute.created", "Dispute opened — deal flagged for admin review", {
    disputeId:       dispute.id,
    paymentIntentId,
    bridgn_deal_id:  dealId,
    dispute_reason:  dispute.reason,
    dispute_status:  dispute.status,
    amount_usd:      (dispute.amount / 100).toFixed(2),
    evidence_due:    evidenceDue,
    brand_user_id:   brandId,
    creator_user_id: creatorId,
  });

  await upsertDeal(paymentIntentId, {
    bridgn_deal_id:        dealId || paymentIntentId,
    status:                "disputed",
    brand_user_id:         brandId    || undefined,
    creator_user_id:       creatorId  || undefined,
    amount_cents:          pi.amount,
    dispute_id:            dispute.id,
    dispute_reason:        dispute.reason,
    dispute_amount_cents:  dispute.amount,
    dispute_evidence_due:  evidenceDue,
    admin_review_required: true,
    disputed_at:           new Date().toISOString(),
  });
}

// ─── Webhook endpoint ─────────────────────────────────────────────────────────

/**
 * express.raw() is applied in server/index.js before this router is mounted,
 * so req.body is a Buffer here — exactly what constructEvent() requires.
 */
router.post("/", async (req, res) => {
  // ── 1. Signature verification ──────────────────────────────────────────────
  const sig = req.headers["stripe-signature"];

  if (!sig) {
    log.warn("webhook", "Request missing stripe-signature header");
    return res.status(400).json({ error: "Missing stripe-signature header." });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    log.error("webhook", "Signature verification failed", { message: err.message });
    return res.status(400).json({ error: `Webhook signature error: ${err.message}` });
  }

  // ── 2. Acknowledge immediately ─────────────────────────────────────────────
  // Stripe expects a 2xx within 30 s. We ack now and process async.
  res.json({ received: true, eventId: event.id });

  // ── 3. Dispatch ───────────────────────────────────────────────────────────
  const obj = event.data.object;

  // Connected account events carry `event.account` (the connected account ID).
  // Platform-level events (payment_intent.*) have event.account === undefined.
  const connectedAccountId = event.account || null;

  try {
    switch (event.type) {

      case "payment_intent.succeeded":
        await onPaymentIntentSucceeded(obj);
        break;

      case "payment_intent.payment_failed":
        await onPaymentIntentFailed(obj);
        break;

      case "account.updated":
        // `obj` is the Account object; `connectedAccountId` is the same value
        // but provided by the event envelope — more reliable than obj.id for
        // Connect events routed through a shared webhook endpoint.
        await onAccountUpdated(obj, connectedAccountId || obj.id);
        break;

      case "payout.paid":
        if (!connectedAccountId) {
          log.warn("payout.paid", "Missing event.account — cannot identify creator");
          break;
        }
        await onPayoutPaid(obj, connectedAccountId);
        break;

      case "charge.dispute.created":
        await onDisputeCreated(obj);
        break;

      default:
        log.info("webhook", `Unhandled event type: ${event.type}`, { eventId: event.id });
    }
  } catch (handlerErr) {
    // Log the failure but do NOT change the already-sent 200 response —
    // returning an error here would cause Stripe to retry the event.
    log.error("webhook", "Handler threw an unhandled exception", {
      eventType: event.type,
      eventId:   event.id,
      message:   handlerErr.message,
      stack:     handlerErr.stack,
    });
  }
});

module.exports = router;
