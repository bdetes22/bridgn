"use strict";

require("dotenv").config();

const path    = require("path");
const express = require("express");
const cors    = require("cors");

const stripeRoutes  = require("./routes/stripe");
const webhookRouter = require("./routes/webhook");

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:3000",
  credentials: true,
}));

// Webhook must receive the raw request body for Stripe signature verification.
// Mount with app.use() so the sub-router's POST "/" can match correctly.
// express.raw() is applied only to this path — the global JSON parser below
// handles everything else.
app.use(
  "/api/stripe/webhooks",
  express.raw({ type: "application/json" }),
  webhookRouter
);

// All other routes get the standard JSON parser.
app.use(express.json());

// ─── API routes ───────────────────────────────────────────────────────────────

app.use("/api/stripe", stripeRoutes);

// Health check
app.get("/api/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));

// ─── Static frontend ──────────────────────────────────────────────────────────
// Serve the single-file React app for every non-API route so that
// /onboarding/complete etc. all fall through to index.html

app.use(express.static(path.join(__dirname, "..")));

// Express 5 requires named splat params — "*" is no longer valid.
app.get("/{*splat}", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "index.html"));
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`bridgn server running on http://localhost:${PORT}`);
});

module.exports = app; // for testing
