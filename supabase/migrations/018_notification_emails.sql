-- Migration: notification emails for brand accounts
-- Run after 017_affiliate_payouts.sql

alter table public.brand_profiles
  add column if not exists notification_emails text[] default '{}';
