-- Migration: content file upload tracking
-- Run after 009_signed_contract.sql

alter table public.deals
  add column if not exists content_file_name text,
  add column if not exists content_file_data text;   -- public URL from Supabase Storage
