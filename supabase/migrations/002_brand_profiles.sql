-- Migration: Stripe customer IDs for brands
-- Run after 001_stripe_connect.sql

create table if not exists public.brand_profiles (
  user_id            uuid primary key references auth.users(id) on delete cascade,

  -- Stripe Billing
  stripe_customer_id text unique,   -- cus_XXXXXXXXXXXX

  -- Timestamps
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create trigger brand_profiles_updated_at
  before update on public.brand_profiles
  for each row execute procedure public.set_updated_at();  -- reuses function from migration 001

alter table public.brand_profiles enable row level security;

create policy "Brands can read own profile"
  on public.brand_profiles for select
  using (auth.uid() = user_id);
