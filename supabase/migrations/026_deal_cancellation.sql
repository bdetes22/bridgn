-- 026: Deal cancellation with mutual agreement
ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS cancel_requested_by text,
  ADD COLUMN IF NOT EXISTS cancel_reason text,
  ADD COLUMN IF NOT EXISTS cancel_agreed_at timestamptz;
