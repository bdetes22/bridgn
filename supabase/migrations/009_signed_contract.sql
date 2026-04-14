-- Migration: signed contract upload from creator
-- Run after 008_storage_bucket.sql

alter table public.deals
  add column if not exists signed_file_name text,
  add column if not exists signed_file_data text;   -- public URL from Supabase Storage
