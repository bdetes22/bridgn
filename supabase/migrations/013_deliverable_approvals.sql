-- Migration: deliverable approval tracking
-- Run after 012_unique_deal_id.sql

alter table public.deals
  add column if not exists approved_deliverables jsonb not null default '[]';
