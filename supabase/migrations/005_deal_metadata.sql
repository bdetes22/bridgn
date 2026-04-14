-- Migration: deal metadata columns for frontend-created deals
-- Run after 004_escrow.sql
--
-- The deals table was originally designed for payment tracking only.
-- These columns let us persist deals from the moment a creator creates one,
-- before any payment exists.

alter table public.deals
  add column if not exists brand_name      text,
  add column if not exists platform        text,
  add column if not exists deliverables    text,
  add column if not exists deadline        text,
  add column if not exists campaign_title  text,
  add column if not exists creator_name    text,
  add column if not exists source          text default 'external',
  add column if not exists progress        integer default 0;

-- amount_cents was NOT NULL with no default — deals created before payment
-- need a sane default.  Alter default; existing rows are unaffected.
alter table public.deals alter column amount_cents set default 0;

-- Allow insert RLS for authenticated users (service role bypasses anyway,
-- but this lets us add client-side writes later if needed).
do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'deals' and policyname = 'Users can insert own deals'
  ) then
    create policy "Users can insert own deals"
      on public.deals for insert
      with check (auth.uid() = creator_user_id or auth.uid() = brand_user_id);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'deals' and policyname = 'Users can update own deals'
  ) then
    create policy "Users can update own deals"
      on public.deals for update
      using (auth.uid() = creator_user_id or auth.uid() = brand_user_id);
  end if;
end $$;
