-- ═══════════════════════════════════════════════════════════════════════════════
-- BRIDGN — All migrations (001 through 004) combined
-- Paste this entire block into Supabase Dashboard → SQL Editor → Run
-- Safe to re-run: uses "if not exists" and "if not exists" throughout
-- ═══════════════════════════════════════════════════════════════════════════════


-- ─── 001: Stripe Connect — creator_profiles ──────────────────────────────────

create table if not exists public.creator_profiles (
  user_id              uuid primary key references auth.users(id) on delete cascade,
  stripe_account_id    text unique,
  stripe_onboarded_at  timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists creator_profiles_updated_at on public.creator_profiles;
create trigger creator_profiles_updated_at
  before update on public.creator_profiles
  for each row execute procedure public.set_updated_at();

alter table public.creator_profiles enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'creator_profiles' and policyname = 'Creators can read own profile'
  ) then
    create policy "Creators can read own profile"
      on public.creator_profiles for select
      using (auth.uid() = user_id);
  end if;
end $$;


-- ─── 002: Brand profiles ────────────────────────────────────────────────────

create table if not exists public.brand_profiles (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text unique,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

drop trigger if exists brand_profiles_updated_at on public.brand_profiles;
create trigger brand_profiles_updated_at
  before update on public.brand_profiles
  for each row execute procedure public.set_updated_at();

alter table public.brand_profiles enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'brand_profiles' and policyname = 'Brands can read own profile'
  ) then
    create policy "Brands can read own profile"
      on public.brand_profiles for select
      using (auth.uid() = user_id);
  end if;
end $$;


-- ─── 003: Webhook support — deals, notifications, creator flags ──────────────

create table if not exists public.deals (
  id                     uuid        primary key default gen_random_uuid(),
  bridgn_deal_id         text        not null,
  payment_intent_id      text        unique,
  brand_user_id          uuid        references auth.users(id) on delete set null,
  creator_user_id        uuid        references auth.users(id) on delete set null,
  amount_cents           integer     not null default 0,
  application_fee_cents  integer,
  status                 text        not null default 'pending',
  payment_failure_reason text,
  dispute_id             text,
  dispute_reason         text,
  dispute_amount_cents   integer,
  dispute_evidence_due   timestamptz,
  admin_review_required  boolean     not null default false,
  disputed_at            timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists deals_payment_intent_id_idx on public.deals (payment_intent_id);
create index if not exists deals_bridgn_deal_id_idx on public.deals (bridgn_deal_id);

drop trigger if exists deals_updated_at on public.deals;
create trigger deals_updated_at
  before update on public.deals
  for each row execute procedure public.set_updated_at();

alter table public.deals enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'deals' and policyname = 'Users see own deals'
  ) then
    create policy "Users see own deals"
      on public.deals for select
      using (auth.uid() = brand_user_id or auth.uid() = creator_user_id);
  end if;
end $$;

create table if not exists public.inbox_notifications (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  type       text        not null,
  payload    jsonb       not null default '{}',
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists inbox_notifications_user_id_idx on public.inbox_notifications (user_id);

alter table public.inbox_notifications enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'inbox_notifications' and policyname = 'Users read own notifications'
  ) then
    create policy "Users read own notifications"
      on public.inbox_notifications for select
      using (auth.uid() = user_id);
  end if;
end $$;

alter table public.creator_profiles
  add column if not exists charges_enabled        boolean not null default false,
  add column if not exists requirements_past_due  boolean not null default false;


-- ─── 004: Escrow columns on deals ───────────────────────────────────────────

alter table public.deals
  add column if not exists auto_release_days  integer     not null default 14,
  add column if not exists auto_release_at    timestamptz,
  add column if not exists transfer_id        text,
  add column if not exists escrow_released_at timestamptz,
  add column if not exists escrow_released_by uuid references auth.users(id) on delete set null,
  add column if not exists dispute_note       text;

create index if not exists deals_auto_release_at_idx
  on public.deals (auto_release_at)
  where status = 'payment_held' and auto_release_at is not null;


-- ═══════════════════════════════════════════════════════════════════════════════
-- Done. Verify with:
--   select table_name from information_schema.tables
--   where table_schema = 'public'
--   order by table_name;
-- ═══════════════════════════════════════════════════════════════════════════════
