"use strict";

const express = require("express");
const router = express.Router();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const {
  getSubscriptionStatus,
  updateSubscription,
  getCreatorProfile,
  upsertCreatorProfile,
  getBrandProfile,
  upsertBrandProfile,
} = require("../../lib/db");

const CLIENT_URL = process.env.CLIENT_URL || process.env.APP_URL || "http://localhost:3000";

const PRICES = {
  creator: process.env.STRIPE_CREATOR_PRICE_ID,
  brand: process.env.STRIPE_BRAND_PRICE_ID,
};

// ── Get or create a Stripe Customer for subscription billing ────────────────
async function getOrCreateCustomer(userId, email, role) {
  if (role === "brand") {
    const profile = await getBrandProfile(userId);
    if (profile?.stripe_customer_id) return profile.stripe_customer_id;
    const customer = await stripe.customers.create({
      email,
      metadata: { bridgn_user_id: userId, role },
    });
    await upsertBrandProfile(userId, { stripe_customer_id: customer.id });
    return customer.id;
  } else {
    const profile = await getCreatorProfile(userId);
    if (profile?.stripe_sub_customer_id) return profile.stripe_sub_customer_id;
    const customer = await stripe.customers.create({
      email,
      metadata: { bridgn_user_id: userId, role },
    });
    await upsertCreatorProfile(userId, { stripe_sub_customer_id: customer.id });
    return customer.id;
  }
}

// ── POST /api/subscription/create-checkout ──────────────────────────────────
router.post("/create-checkout", async (req, res) => {
  const { userId, email, role } = req.body;
  if (!userId || !email || !role) {
    return res.status(400).json({ error: "userId, email, and role are required" });
  }

  const priceId = PRICES[role];
  if (!priceId) {
    return res.status(400).json({ error: `No price configured for role: ${role}` });
  }

  try {
    const customerId = await getOrCreateCustomer(userId, email, role);
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: 30,
        metadata: { bridgn_user_id: userId, role },
      },
      success_url: `${CLIENT_URL}/?sub=success`,
      cancel_url: `${CLIENT_URL}/?page=settings`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("[subscription] Checkout error:", err.message);
    res.status(500).json({ error: "Failed to create checkout session" });
  }
});

// ── POST /api/subscription/create-portal ────────────────────────────────────
router.post("/create-portal", async (req, res) => {
  const { userId, role } = req.body;
  if (!userId || !role) {
    return res.status(400).json({ error: "userId and role are required" });
  }

  try {
    const table = role === "brand" ? "brand_profiles" : "creator_profiles";
    const customerField = role === "brand" ? "stripe_customer_id" : "stripe_sub_customer_id";
    const profile = role === "brand" ? await getBrandProfile(userId) : await getCreatorProfile(userId);
    const customerId = profile?.[customerField];

    if (!customerId) {
      return res.status(400).json({ error: "No subscription customer found" });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${CLIENT_URL}/?page=settings`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("[subscription] Portal error:", err.message);
    res.status(500).json({ error: "Failed to create portal session" });
  }
});

// ── GET /api/subscription/status ────────────────────────────────────────────
router.get("/status", async (req, res) => {
  const { userId, role } = req.query;
  if (!userId || !role) {
    return res.status(400).json({ error: "userId and role are required" });
  }

  try {
    const status = await getSubscriptionStatus(userId, role);
    res.json(status);
  } catch (err) {
    console.error("[subscription] Status error:", err.message);
    res.status(500).json({ error: "Failed to fetch subscription status" });
  }
});

module.exports = router;
