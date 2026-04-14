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
const { stripe }                              = require("../../lib/stripe");
const { getCreatorProfile, upsertCreatorProfile } = require("../../lib/db");

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
      url: "https://bridgn.app",
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

module.exports = router;
