-- Migration: webhook-writable tables
-- Run after 002_brand_profiles.sql
--
-- Adds:
--   deals                      — persistent deal records keyed by payment_intent_id
--   inbox_notifications        — per-user notification rows written by webhooks
--   creator_profiles additions — charges_enabled, requirements_past_due flags

-- ─── deals ────────────────────────────────────────────────────────────────────
-- The authoritative payment-state record for every bridgn deal.
-- bridgn_deal_id mirrors the id the frontend generates so both sides
-- can reference the same deal.

create table if not exists public.deals (
  id                     uuid        primary key default gen_random_uuid(),
  bridgn_deal_id         text        not null,          -- frontend deal id
  payment_intent_id      text        unique,            -- pi_XXXX — indexed below
  brand_user_id          uuid        references auth.users(id) on delete set null,
  creator_user_id        uuid        references auth.users(id) on delete set null,
  amount_cents           integer     not null,
  application_fee_cents  integer,
  status                 text        not null default 'pending',
  -- payment_failed fields
  payment_failure_reason text,
  -- dispute fields
  dispute_id             text,
  dispute_reason         text,
  dispute_amount_cents   integer,
  dispute_evidence_due   timestamptz,
  admin_review_required  boolean     not null default false,
  disputed_at            timestamptz,
  -- timestamps
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists deals_payment_intent_id_idx
  on public.deals (payment_intent_id);

create index if not exists deals_bridgn_deal_id_idx
  on public.deals (bridgn_deal_id);

create trigger deals_updated_at
  before update on public.deals
  for each row execute procedure public.set_updated_at();

alter table public.deals enable row level security;

-- Brands see their own deals; creators see deals they're part of
create policy "Users see own deals"
  on public.deals for select
  using (auth.uid() = brand_user_id or auth.uid() = creator_user_id);

-- ─── inbox_notifications ──────────────────────────────────────────────────────
-- Lightweight notification rows created by the webhook handler.
-- The frontend can poll GET /api/notifications or subscribe via Supabase realtime.

create table if not exists public.inbox_notifications (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  type       text        not null,   -- 'payment_failed' | 'payout_received' | 'dispute_created'
  payload    jsonb       not null default '{}',
  read_at    timestamptz,            -- null = unread
  created_at timestamptz not null default now()
);

create index if not exists inbox_notifications_user_id_idx
  on public.inbox_notifications (user_id);

create trigger inbox_notifications_updated_at
  before update on public.inbox_notifications
  for each row execute procedure public.set_updated_at();

alter table public.inbox_notifications enable row level security;

create policy "Users read own notifications"
  on public.inbox_notifications for select
  using (auth.uid() = user_id);

-- ─── creator_profiles additions ───────────────────────────────────────────────

alter table public.creator_profiles
  add column if not exists charges_enabled        boolean not null default false,
  add column if not exists requirements_past_due  boolean not null default false;
