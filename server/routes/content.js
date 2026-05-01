"use strict";

const express = require("express");
const { db } = require("../../lib/db");

const router = express.Router();

// GET /api/content?userId=X — list all content entries for a brand
router.get("/", async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: "userId is required." });

  try {
    const { data, error } = await db
      .from("content_entries")
      .select("*")
      .eq("brand_user_id", userId)
      .order("date_posted", { ascending: false });

    if (error) throw error;
    res.json({ entries: data || [] });
  } catch (err) {
    console.error("[content/list]", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/content — create a new content entry
router.post("/", async (req, res) => {
  const { userId, entry } = req.body;
  if (!userId || !entry) return res.status(400).json({ error: "userId and entry are required." });

  try {
    const { data, error } = await db
      .from("content_entries")
      .insert({
        brand_user_id: userId,
        deal_id: entry.dealId || null,
        creator_name: entry.creatorName || "",
        platform: entry.platform || "Instagram",
        post_url: entry.postUrl || "",
        date_posted: entry.datePosted || null,
        caption: entry.caption || "",
        views: entry.views || 0,
        likes: entry.likes || 0,
        comments: entry.comments || 0,
        shares: entry.shares || 0,
        clicks: entry.clicks || 0,
        conversions: entry.conversions || 0,
        revenue_cents: Math.round((Number(entry.revenue) || 0) * 100),
        notes: entry.notes || "",
        campaign_title: entry.campaignTitle || "",
      })
      .select()
      .single();

    if (error) throw error;
    res.json({ entry: data });
  } catch (err) {
    console.error("[content/create]", err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/content/:id — update a content entry
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { userId, fields } = req.body;
  if (!id || !userId || !fields) return res.status(400).json({ error: "id, userId, and fields are required." });

  try {
    // Verify ownership
    const { data: existing } = await db.from("content_entries").select("brand_user_id").eq("id", id).single();
    if (!existing || existing.brand_user_id !== userId) return res.status(403).json({ error: "Not authorized." });

    const allowed = ["creator_name", "platform", "post_url", "date_posted", "caption",
      "views", "likes", "comments", "shares", "clicks", "conversions", "revenue_cents",
      "notes", "campaign_title"];
    const updates = { updated_at: new Date().toISOString() };
    for (const [k, v] of Object.entries(fields)) {
      if (allowed.includes(k)) updates[k] = v;
    }

    const { data, error } = await db.from("content_entries").update(updates).eq("id", id).select().single();
    if (error) throw error;
    res.json({ entry: data });
  } catch (err) {
    console.error("[content/update]", err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/content/:id — delete a content entry
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  const { userId } = req.query;
  if (!id || !userId) return res.status(400).json({ error: "id and userId are required." });

  try {
    const { error } = await db.from("content_entries").delete().eq("id", id).eq("brand_user_id", userId);
    if (error) throw error;
    res.json({ deleted: true });
  } catch (err) {
    console.error("[content/delete]", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
