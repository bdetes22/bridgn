-- Migration: Stripe Connect creator profiles
-- Run once against your Supabase project:
--   Dashboard → SQL Editor → paste & run, OR
--   supabase db push (if using the Supabase CLI)

create table if not exists public.creator_profiles (
  -- One row per Supabase auth user (creators only)
  user_id              uuid primary key references auth.users(id) on delete cascade,

  -- Stripe Connect
  stripe_account_id    text unique,          -- acct_XXXXXXXXXXXX
  stripe_onboarded_at  timestamptz,          -- set when account.updated webhook confirms charges_enabled

  -- Timestamps
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- Auto-update updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger creator_profiles_updated_at
  before update on public.creator_profiles
  for each row execute procedure public.set_updated_at();

-- Row-level security: creators can only read their own row
alter table public.creator_profiles enable row level security;

create policy "Creators can read own profile"
  on public.creator_profiles for select
  using (auth.uid() = user_id);

-- Service role (used by our backend) bypasses RLS automatically
