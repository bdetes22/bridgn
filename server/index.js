"use strict";

require("dotenv").config();

const path    = require("path");
const express = require("express");
const cors    = require("cors");

const stripeRoutes = require("./routes/stripe");

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:3000",
  credentials: true,
}));

// Raw body needed for Stripe webhook signature verification (added later)
app.use((req, res, next) => {
  if (req.originalUrl === "/api/stripe/webhook") {
    next(); // stripe webhook route will call express.raw() itself
  } else {
    express.json()(req, res, next);
  }
});

// ─── API routes ───────────────────────────────────────────────────────────────

app.use("/api/stripe", stripeRoutes);

// Health check
app.get("/api/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));

// ─── Static frontend ──────────────────────────────────────────────────────────
// Serve the single-file React app for every non-API route so that
// /onboarding/complete etc. all fall through to index.html

app.use(express.static(path.join(__dirname, "..")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "index.html"));
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`bridgn server running on http://localhost:${PORT}`);
});

module.exports = app; // for testing
