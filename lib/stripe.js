"use strict";

const Stripe = require("stripe");

const missingVars = [];
if (!process.env.STRIPE_SECRET_KEY)    missingVars.push("STRIPE_SECRET_KEY");
if (!process.env.STRIPE_WEBHOOK_SECRET) missingVars.push("STRIPE_WEBHOOK_SECRET");
if (missingVars.length) {
  throw new Error(
    `Missing required Stripe environment variable(s): ${missingVars.join(", ")}.\n` +
    "Copy .env.example to .env and fill in your Stripe credentials."
  );
}

// Bridgn platform fee: 8% charged on every transaction
const PLATFORM_FEE_PERCENT = 0.08;

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-02-24.acacia",
  appInfo: {
    name: "bridgn",
    version: "0.1.0",
    url: "https://bridgn.com",
  },
});

// Exported as a plain string so callers don't need to reference process.env directly.
// The startup guard above already ensures this is non-empty.
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

module.exports = {
  stripe,
  PLATFORM_FEE_PERCENT,
  STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY || "",
  STRIPE_WEBHOOK_SECRET,
};
