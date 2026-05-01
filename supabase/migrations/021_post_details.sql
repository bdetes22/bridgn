-- Migration: post details (CTA, link, caption) for deal room
-- Run after 020_deadline_reminders.sql

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS post_cta text,
  ADD COLUMN IF NOT EXISTS post_link text,
  ADD COLUMN IF NOT EXISTS post_caption text,
  ADD COLUMN IF NOT EXISTS post_details_sent boolean DEFAULT false;
