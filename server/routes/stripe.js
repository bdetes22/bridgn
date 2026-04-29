"use strict";

/**
 * Stripe Connect onboarding routes for Bridgn creators.
 *
 * GET /api/stripe/onboard
 *   → Creates (or reuses) a Stripe Express account for the creator,
 *     stores the account ID in Supabase, then redirects to Stripe's
 *     hosted onboarding page.
 *
 * GET /api/stripe/onboard/complete
 *   → Called by Stripe after the creator finishes onboarding.
 *     Marks the creator as onboarded in the DB, then redirects to the app.
 *
 * GET /api/stripe/onboard/refresh
 *   → Called by Stripe when the Account Link expires before completion.
 *     Generates a fresh link and redirects the creator back to Stripe.
 */

const express = require("express");
const { stripe, PLATFORM_FEE_PERCENT }                    = require("../../lib/stripe");
const {
  getCreatorProfile, upsertCreatorProfile,
  getBrandProfile,   upsertBrandProfile,
  getDealByBridgnDealId,
  updateDealById,
  upsertDeal,
  insertNotification,
} = require("../../lib/db");

const router = express.Router();

// Base URL for this server — used to build the Stripe return / refresh URLs.
// In production this should be your public HTTPS domain.
const APP_URL    = process.env.APP_URL    || "http://localhost:3000";
const CLIENT_URL = process.env.CLIENT_URL || APP_URL;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Create a new Stripe Express account for a Bridgn creator.
 */
async function createConnectedAccount(userId, email) {
  return stripe.accounts.create({
    type: "express",
    email,
    capabilities: {
      us_bank_account_ach_payments: { requested: true },
      transfers:                    { requested: true },
    },
    business_profile: {
      product_description: "Creator / influencer on the bridgn platform",
      url: "https://bridgn.com",
    },
    metadata: {
      bridgn_user_id: userId,
    },
  });
}

/**
 * Generate a Stripe Account Link for the given connected account.
 * `type` is either "account_onboarding" (first time) or "account_update" (refresh).
 */
async function createAccountLink(accountId, userId, type = "account_onboarding") {
  return stripe.accountLinks.create({
    account:     accountId,
    refresh_url: `${APP_URL}/api/stripe/onboard/refresh?userId=${userId}`,
    return_url:  `${APP_URL}/api/stripe/onboard/complete?userId=${userId}`,
    type,
  });
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /api/stripe/onboard?userId=<supabase-user-id>&email=<optional>
 *
 * Idempotent: if the creator already has a Stripe account we reuse it and
 * generate a fresh Account Link so they can complete or update onboarding.
 *
 * NOTE: In production, validate the userId by verifying the Supabase JWT
 * from the Authorization header rather than trusting a query param.
 */
router.get("/onboard", async (req, res) => {
  const { userId, email } = req.query;

  if (!userId) {
    return res.status(400).json({ error: "userId query parameter is required." });
  }

  try {
    let profile = await getCreatorProfile(userId);

    // Create the Stripe Express account if this creator doesn't have one yet
    if (!profile?.stripe_account_id) {
      const account = await createConnectedAccount(userId, email || undefined);

      profile = await upsertCreatorProfile(userId, {
        stripe_account_id: account.id,
      });
    }

    const link = await createAccountLink(profile.stripe_account_id, userId);

    // Redirect the creator's browser directly to Stripe's hosted onboarding
    res.redirect(303, link.url);
  } catch (err) {
    console.error("[stripe/onboard]", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/stripe/onboard/complete?userId=<supabase-user-id>
 *
 * Stripe redirects here after the creator submits their onboarding form.
 * The account may not be fully verified yet — Stripe will notify us via
 * the `account.updated` webhook when `charges_enabled` becomes true.
 * We still mark the creator as having completed the form flow.
 */
router.get("/onboard/complete", async (req, res) => {
  const { userId } = req.query;

  if (!userId) {
    return res.redirect(`${CLIENT_URL}/?stripe=error&reason=missing_user`);
  }

  try {
    // Verify the account is actually making progress before marking complete
    const profile = await getCreatorProfile(userId);

    if (profile?.stripe_account_id) {
      const account = await stripe.accounts.retrieve(profile.stripe_account_id);

      if (account.details_submitted) {
        await upsertCreatorProfile(userId, {
          stripe_onboarded_at: new Date().toISOString(),
        });
      }
    }

    // Send the creator back to the app with a success signal
    res.redirect(`${CLIENT_URL}/?stripe=connected`);
  } catch (err) {
    console.error("[stripe/onboard/complete]", err);
    res.redirect(`${CLIENT_URL}/?stripe=error&reason=server`);
  }
});

/**
 * GET /api/stripe/onboard/refresh?userId=<supabase-user-id>
 *
 * Stripe redirects here when the Account Link has expired (links are
 * single-use and expire after a few minutes). Generate a fresh one.
 */
router.get("/onboard/refresh", async (req, res) => {
  const { userId } = req.query;

  if (!userId) {
    return res.redirect(`${CLIENT_URL}/?stripe=error&reason=missing_user`);
  }

  try {
    const profile = await getCreatorProfile(userId);

    if (!profile?.stripe_account_id) {
      // No account exists yet — restart the full flow
      return res.redirect(`${APP_URL}/api/stripe/onboard?userId=${userId}`);
    }

    const link = await createAccountLink(
      profile.stripe_account_id,
      userId,
      "account_onboarding"
    );

    res.redirect(303, link.url);
  } catch (err) {
    console.error("[stripe/onboard/refresh]", err);
    res.redirect(`${CLIENT_URL}/?stripe=error&reason=server`);
  }
});

/**
 * GET /api/stripe/config
 *
 * Returns the Stripe publishable key so the frontend can initialise Stripe.js
 * without baking the key into the static HTML at build time.
 */
router.get("/config", (_req, res) => {
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
  if (!publishableKey) {
    return res.status(500).json({ error: "STRIPE_PUBLISHABLE_KEY is not configured." });
  }
  res.json({ publishableKey });
});

/**
 * POST /api/stripe/create-deal-payment
 *
 * Body:
 *   dealId           string  — bridgn deal identifier (stored in PaymentIntent metadata)
 *   amount           number  — deal value in dollars (e.g. 2500 → $2,500)
 *   brandUserId      string  — Supabase user id of the brand paying
 *   brandEmail       string  — brand's email (used for Stripe customer creation)
 *   brandName        string  — brand's display name
 *   creatorUserId    string  — Supabase user id of the creator receiving payment
 *   escrowReleaseDays number — auto-release window in days (default 14)
 *
 * Returns: { clientSecret, paymentIntentId, publishableKey }
 *
 * ESCROW MODEL — "separate charges and transfers":
 *   Funds land in bridgn's platform Stripe balance (NO transfer_data).
 *   A Transfer to the creator's connected account is only created when
 *   the brand calls POST /api/stripe/release-payment, or when the
 *   auto-release cron fires after escrowReleaseDays.
 */
router.post("/create-deal-payment", async (req, res) => {
  const {
    dealId, amount, brandUserId, brandEmail, brandName,
    creatorUserId, escrowReleaseDays,
  } = req.body;

  // ── Validate inputs ────────────────────────────────────────────────────────
  if (!dealId || !amount || !brandUserId || !creatorUserId) {
    return res.status(400).json({
      error: "dealId, amount, brandUserId, and creatorUserId are required.",
    });
  }

  const amountDollars = Number(amount);
  if (!Number.isFinite(amountDollars) || amountDollars <= 0) {
    return res.status(400).json({ error: "amount must be a positive number." });
  }

  const releaseDays         = Math.max(1, Math.min(90, Number(escrowReleaseDays) || 14));
  const creatorPayoutCents  = Math.round(amountDollars * 100);

  try {
    // ── 1. Get or create the Stripe Customer for this brand ──────────────────
    let brandProfile = await getBrandProfile(brandUserId);
    let customerId   = brandProfile?.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email:    brandEmail || undefined,
        name:     brandName  || undefined,
        metadata: { bridgn_user_id: brandUserId },
      });

      customerId = customer.id;
      await upsertBrandProfile(brandUserId, { stripe_customer_id: customer.id });
    }

    // ── 2. Check if this is the brand's first deal (free — no platform fee) ──
    const isFirstDeal = !brandProfile?.first_deal_used;
    const applicationFeeCents = isFirstDeal ? 0 : Math.round(creatorPayoutCents * PLATFORM_FEE_PERCENT);
    const totalChargeCents    = creatorPayoutCents + applicationFeeCents;

    // ── 3. Verify the creator has a connected account ────────────────────────
    const creatorProfile = await getCreatorProfile(creatorUserId);
    if (!creatorProfile?.stripe_account_id) {
      return res.status(422).json({
        error: "Creator has not completed Stripe onboarding. They must connect a bank account first.",
        code:  "creator_not_onboarded",
      });
    }

    // ── 4. Create PaymentIntent — NO transfer_data (funds stay on platform) ──
    const paymentIntent = await stripe.paymentIntents.create({
      amount:   totalChargeCents,
      currency: "usd",
      customer: customerId,
      payment_method_types: ["us_bank_account"],
      payment_method_options: {
        us_bank_account: {
          financial_connections: {
            permissions: ["payment_method", "balances"],
          },
        },
      },
      capture_method: "automatic",
      metadata: {
        bridgn_deal_id:           String(dealId),
        bridgn_brand_id:          brandUserId,
        bridgn_creator_id:        creatorUserId,
        creator_stripe_account:   creatorProfile.stripe_account_id,
        creator_payout_dollars:    String(amountDollars),
        total_charge_cents:       String(totalChargeCents),
        platform_fee_cents:       String(applicationFeeCents),
        platform_fee_pct:         String(isFirstDeal ? 0 : PLATFORM_FEE_PERCENT),
        first_deal_free:          isFirstDeal ? "true" : "false",
        escrow_release_days:      String(releaseDays),
      },
    });

    // ── 4. Update the existing deal row with the PaymentIntent ID ─────────────
    // If a deal already exists for this bridgn_deal_id, update it.
    // Otherwise create a new row (fallback for deals not created via the frontend).
    const existingDeal = await getDealByBridgnDealId(String(dealId));
    if (existingDeal) {
      await updateDealById(existingDeal.id, {
        payment_intent_id:     paymentIntent.id,
        amount_cents:          creatorPayoutCents,
        application_fee_cents: applicationFeeCents,
        auto_release_days:     releaseDays,
        status:                "payment_processing",
      });
    } else {
      await upsertDeal(paymentIntent.id, {
        bridgn_deal_id:        String(dealId),
        brand_user_id:         brandUserId,
        creator_user_id:       creatorUserId,
        amount_cents:          creatorPayoutCents,
        application_fee_cents: applicationFeeCents,
        auto_release_days:     releaseDays,
        status:                "payment_processing",
      });
    }

    // Mark the brand's first deal as used (for future fee calculation)
    if (isFirstDeal) {
      await upsertBrandProfile(brandUserId, { first_deal_used: true });
    }

    res.json({
      clientSecret:        paymentIntent.client_secret,
      paymentIntentId:     paymentIntent.id,
      publishableKey:      process.env.STRIPE_PUBLISHABLE_KEY,
      creatorPayoutCents,
      totalChargeCents,
      applicationFeeCents,
      isFirstDealFree:     isFirstDeal,
      escrowReleaseDays:   releaseDays,
    });
  } catch (err) {
    console.error("[stripe/create-deal-payment]", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Escrow: release payment ─────────────────────────────────────────────────

/**
 * POST /api/stripe/release-payment
 *
 * Body:
 *   dealId       string — bridgn deal id
 *   brandUserId  string — the brand requesting the release (auth check)
 *
 * Transfers the creator's share from the platform balance to their connected
 * account and records the Transfer ID on the deal row.
 *
 * Allowed when deal status is "payment_held" or "content_delivered".
 */
router.post("/release-payment", async (req, res) => {
  const { dealId, brandUserId } = req.body;

  if (!dealId || !brandUserId) {
    return res.status(400).json({ error: "dealId and brandUserId are required." });
  }

  try {
    const deal = await getDealByBridgnDealId(dealId);

    if (!deal) {
      return res.status(404).json({ error: "Deal not found." });
    }

    // Only the brand on the deal can release funds
    if (deal.brand_user_id !== brandUserId) {
      return res.status(403).json({ error: "Only the brand on this deal can release payment." });
    }

    const releasable = ["payment_held", "content_delivered"];
    if (!releasable.includes(deal.status)) {
      return res.status(409).json({
        error: `Cannot release payment — deal status is "${deal.status}". Must be one of: ${releasable.join(", ")}.`,
      });
    }

    // Look up the creator's connected account
    const creatorProfile = await getCreatorProfile(deal.creator_user_id);
    if (!creatorProfile?.stripe_account_id) {
      return res.status(422).json({ error: "Creator's Stripe account not found." });
    }

    // Creator gets the full deal amount — fee was charged on top to the brand
    const transferCents = deal.amount_cents;

    // Create the Transfer to the creator's connected account
    const transfer = await stripe.transfers.create({
      amount:      transferCents,
      currency:    "usd",
      destination: creatorProfile.stripe_account_id,
      metadata: {
        bridgn_deal_id:   deal.bridgn_deal_id,
        payment_intent_id: deal.payment_intent_id,
        platform_fee_cents: String(deal.application_fee_cents || 0),
      },
    });

    await updateDealById(deal.id, {
      status:             "payment_released",
      transfer_id:        transfer.id,
      escrow_released_at: new Date().toISOString(),
      escrow_released_by: brandUserId,
    });

    // Notify the creator
    if (deal.creator_user_id) {
      await insertNotification(deal.creator_user_id, "payment_released", {
        bridgn_deal_id: deal.bridgn_deal_id,
        amount_cents:   transferCents,
        message: `Payment of $${(transferCents / 100).toFixed(2)} has been released and is on its way to your bank account.`,
      });
    }

    res.json({
      status:       "payment_released",
      transferId:   transfer.id,
      amountCents:  transferCents,
      feeCents,
    });
  } catch (err) {
    console.error("[stripe/release-payment]", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Escrow: dispute deal ────────────────────────────────────────────────────

/**
 * POST /api/stripe/dispute-deal
 *
 * Body:
 *   dealId       string — bridgn deal id
 *   brandUserId  string — the brand disputing
 *   reason       string — freeform note explaining the dispute
 *
 * Flags the deal for admin review. Funds remain held on the platform —
 * no Transfer is created and no refund is issued until an admin resolves it.
 *
 * Allowed when deal status is "payment_held" or "content_delivered".
 */
router.post("/dispute-deal", async (req, res) => {
  const { dealId, brandUserId, reason } = req.body;

  if (!dealId || !brandUserId) {
    return res.status(400).json({ error: "dealId and brandUserId are required." });
  }

  try {
    const deal = await getDealByBridgnDealId(dealId);

    if (!deal) {
      return res.status(404).json({ error: "Deal not found." });
    }

    if (deal.brand_user_id !== brandUserId) {
      return res.status(403).json({ error: "Only the brand on this deal can dispute it." });
    }

    const disputable = ["payment_held", "content_delivered"];
    if (!disputable.includes(deal.status)) {
      return res.status(409).json({
        error: `Cannot dispute — deal status is "${deal.status}". Must be one of: ${disputable.join(", ")}.`,
      });
    }

    await updateDealById(deal.id, {
      status:                "payment_disputed",
      admin_review_required: true,
      disputed_at:           new Date().toISOString(),
      dispute_note:          reason || "No reason provided.",
      // Clear auto-release so the cron doesn't release disputed funds
      auto_release_at:       null,
    });

    // Notify the creator that the brand has raised a concern
    if (deal.creator_user_id) {
      await insertNotification(deal.creator_user_id, "deal_disputed", {
        bridgn_deal_id: deal.bridgn_deal_id,
        amount_cents:   deal.amount_cents,
        message: `The brand has raised a concern about this deal. Payment is on hold pending admin review.`,
      });
    }

    res.json({ status: "payment_disputed", dealId: deal.bridgn_deal_id });
  } catch (err) {
    console.error("[stripe/dispute-deal]", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
