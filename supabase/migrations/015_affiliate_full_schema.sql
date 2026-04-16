-- Migration: full affiliate system schema
-- Run after 014_affiliate_links.sql
-- Adds new columns to affiliate_links + creates clicks and conversions tables.
-- Safe to re-run: uses IF NOT EXISTS throughout.

-- ─── Extend affiliate_links with new columns ────────────────────────────────

alter table public.affiliate_links
  add column if not exists deal_id               text,
  add column if not exists type                   text not null default 'link',
  add column if not exists commission_type        text not null default 'percentage',
  add column if not exists commission_flat_amount integer,
  add column if not exists commission_earned      integer not null default 0,
  add column if not exists is_active              boolean not null default true;

-- ─── affiliate_clicks — raw click tracking ───────────────────────────────────

create table if not exists public.affiliate_clicks (
  id          uuid        primary key default gen_random_uuid(),
  link_code   text        not null,
  clicked_at  timestamptz not null default now(),
  user_agent  text,
  referrer    text
);

create index if not exists affiliate_clicks_code_idx
  on public.affiliate_clicks (link_code, clicked_at desc);

alter table public.affiliate_clicks enable row level security;

-- Brands can read clicks for their own links
do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'affiliate_clicks' and policyname = 'Brands read own link clicks'
  ) then
    create policy "Brands read own link clicks"
      on public.affiliate_clicks for select
      using (
        exists (
          select 1 from public.affiliate_links
          where affiliate_links.code = affiliate_clicks.link_code
            and affiliate_links.brand_id = auth.uid()
        )
      );
  end if;
end $$;

-- Service role can insert (from redirect endpoint)
do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'affiliate_clicks' and policyname = 'Service inserts clicks'
  ) then
    create policy "Service inserts clicks"
      on public.affiliate_clicks for insert
      with check (true);
  end if;
end $$;

-- ─── affiliate_conversions — conversion + commission tracking ────────────────

create table if not exists public.affiliate_conversions (
  id                uuid        primary key default gen_random_uuid(),
  link_code         text        not null,
  conversion_value  integer     not null default 0,   -- cents
  commission_amount integer     not null default 0,   -- cents
  logged_by         text        not null default 'manual',  -- 'manual' | 'webhook' | 'shopify'
  logged_at         timestamptz not null default now(),
  notes             text
);

create index if not exists affiliate_conversions_code_idx
  on public.affiliate_conversions (link_code, logged_at desc);

alter table public.affiliate_conversions enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'affiliate_conversions' and policyname = 'Brands read own conversions'
  ) then
    create policy "Brands read own conversions"
      on public.affiliate_conversions for select
      using (
        exists (
          select 1 from public.affiliate_links
          where affiliate_links.code = affiliate_conversions.link_code
            and affiliate_links.brand_id = auth.uid()
        )
      );
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'affiliate_conversions' and policyname = 'Brands insert own conversions'
  ) then
    create policy "Brands insert own conversions"
      on public.affiliate_conversions for insert
      with check (
        exists (
          select 1 from public.affiliate_links
          where affiliate_links.code = affiliate_conversions.link_code
            and affiliate_links.brand_id = auth.uid()
        )
      );
  end if;
end $$;
