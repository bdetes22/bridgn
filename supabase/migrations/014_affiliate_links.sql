-- Migration: affiliate links table
-- Run after 013_deliverable_approvals.sql

create table if not exists public.affiliate_links (
  id              uuid        primary key default gen_random_uuid(),
  brand_id        uuid        references auth.users(id) on delete cascade,
  creator_id      uuid        references auth.users(id) on delete set null,
  code            text        not null unique,
  destination_url text,
  campaign_name   text,
  creator_name    text,
  clicks          integer     not null default 0,
  conversions     integer     not null default 0,
  revenue         integer     not null default 0,   -- cents
  commission_rate integer     not null default 10,   -- percentage
  created_at      timestamptz not null default now()
);

create index if not exists affiliate_links_brand_id_idx on public.affiliate_links (brand_id);
create index if not exists affiliate_links_code_idx on public.affiliate_links (code);

alter table public.affiliate_links enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'affiliate_links' and policyname = 'Brands manage own affiliate links'
  ) then
    create policy "Brands manage own affiliate links"
      on public.affiliate_links for all
      using (auth.uid() = brand_id);
  end if;
end $$;
