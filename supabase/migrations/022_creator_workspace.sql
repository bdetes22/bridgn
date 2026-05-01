-- Migration: creator workspace (private notes, files, links, checklist per deal)
-- Run after 021_post_details.sql

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS creator_workspace jsonb DEFAULT '{}';
