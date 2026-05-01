-- Migration: content performance tracker for brands
-- Run after 022_creator_workspace.sql

CREATE TABLE IF NOT EXISTS public.content_entries (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_user_id text NOT NULL,
  deal_id text,
  creator_name text DEFAULT '',
  platform text DEFAULT 'Instagram',
  post_url text DEFAULT '',
  date_posted date,
  caption text DEFAULT '',
  views integer DEFAULT 0,
  likes integer DEFAULT 0,
  comments integer DEFAULT 0,
  shares integer DEFAULT 0,
  clicks integer DEFAULT 0,
  conversions integer DEFAULT 0,
  revenue_cents integer DEFAULT 0,
  notes text DEFAULT '',
  campaign_title text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Index for fast lookup by brand
CREATE INDEX IF NOT EXISTS idx_content_entries_brand ON public.content_entries(brand_user_id);
