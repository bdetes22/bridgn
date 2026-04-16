-- Migration: prevent duplicate deals with the same bridgn_deal_id
-- Run after 011_script_url.sql

-- Drop the old non-unique index first
drop index if exists deals_bridgn_deal_id_idx;

-- Create a unique index — the database will reject any insert/upsert
-- that tries to create a second row with the same bridgn_deal_id
create unique index deals_bridgn_deal_id_unique
  on public.deals (bridgn_deal_id);
