-- Migration: brief + contract fields on deals
-- Run after 006_deal_messages.sql

alter table public.deals
  add column if not exists brief_file_name   text,
  add column if not exists brief_file_data   text,      -- base64 dataUrl (small files only)
  add column if not exists brief_link        text,
  add column if not exists brief_comments    text,
  add column if not exists brief_submitted   boolean not null default false,
  add column if not exists brief_acknowledged boolean not null default false,
  add column if not exists contract_file_name text,
  add column if not exists contract_file_data text,
  add column if not exists contract_link      text,
  add column if not exists contract_notes     text,
  add column if not exists contract_sent      boolean not null default false,
  add column if not exists contract_signed    boolean not null default false,
  add column if not exists contract_signed_at timestamptz;
