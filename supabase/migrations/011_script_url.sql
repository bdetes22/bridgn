-- Migration: script/draft URL shared by creator
-- Run after 010_content_file.sql

alter table public.deals
  add column if not exists script_url       text,
  add column if not exists script_submitted boolean not null default false;
