-- Migration: track which deadline reminders have been sent
-- Run after 019_first_deal_free.sql

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS sent_reminders text DEFAULT '';
