-- 024: Partial escrow (upfront %), LIVE status, Net 30 payment terms
-- Allows creators/brands to set an upfront escrow percentage instead of 100%.
-- Remaining balance is due Net 30 after content goes live.

-- Deals: partial escrow + LIVE tracking
ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS upfront_pct              integer     DEFAULT 100,
  ADD COLUMN IF NOT EXISTS content_live_at           timestamptz,
  ADD COLUMN IF NOT EXISTS net30_due_at              timestamptz,
  ADD COLUMN IF NOT EXISTS remaining_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS remaining_transfer_id     text,
  ADD COLUMN IF NOT EXISTS upfront_released          boolean     DEFAULT false;

-- Brand profiles: delinquency tracking for overdue Net 30 payments
ALTER TABLE public.brand_profiles
  ADD COLUMN IF NOT EXISTS payment_delinquent boolean   DEFAULT false,
  ADD COLUMN IF NOT EXISTS delinquent_at      timestamptz;
