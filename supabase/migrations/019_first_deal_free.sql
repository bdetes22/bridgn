-- Migration: track whether brand has used their free first deal
-- Run after 018_notification_emails.sql

alter table public.brand_profiles
  add column if not exists first_deal_used boolean not null default false;
