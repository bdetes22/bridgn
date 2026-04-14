-- Migration: escrow hold/release fields on deals
-- Run after 003_webhook_support.sql

alter table public.deals
  add column if not exists auto_release_days  integer     not null default 14,
  add column if not exists auto_release_at    timestamptz,         -- when funds auto-release if brand doesn't act
  add column if not exists transfer_id        text,                -- tr_XXXX — created when funds are released
  add column if not exists escrow_released_at timestamptz,         -- when release-payment was called
  add column if not exists escrow_released_by uuid references auth.users(id) on delete set null,
  add column if not exists dispute_note       text;                -- brand's reason when disputing in-app

-- Index for the auto-release cron job
create index if not exists deals_auto_release_at_idx
  on public.deals (auto_release_at)
  where status = 'payment_held' and auto_release_at is not null;
