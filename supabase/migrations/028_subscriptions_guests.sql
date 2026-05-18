-- 028: Subscriptions, guest access, optional payment processing
-- Adds subscription billing fields to profile tables
-- Adds payment method choice and guest token fields to deals

-- ── Creator subscription fields ──
ALTER TABLE public.creator_profiles
  ADD COLUMN IF NOT EXISTS stripe_sub_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;

-- ── Brand subscription fields ──
ALTER TABLE public.brand_profiles
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;

-- ── Deal-level fields ──
ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'escrow',
  ADD COLUMN IF NOT EXISTS external_payment_sent boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS external_payment_confirmed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS brand_contact_email text,
  ADD COLUMN IF NOT EXISTS guest_token text UNIQUE;

-- Fast lookups for tokenized guest actions
CREATE INDEX IF NOT EXISTS idx_deals_guest_token
  ON public.deals(guest_token)
  WHERE guest_token IS NOT NULL;
