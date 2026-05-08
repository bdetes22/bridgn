-- 027: Offer negotiation — counter offers, decline reasons, expiration
ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS offer_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS decline_reason text,
  ADD COLUMN IF NOT EXISTS counter_amount_cents integer,
  ADD COLUMN IF NOT EXISTS counter_upfront_pct integer,
  ADD COLUMN IF NOT EXISTS counter_deliverables text,
  ADD COLUMN IF NOT EXISTS counter_message text,
  ADD COLUMN IF NOT EXISTS counter_by text;
