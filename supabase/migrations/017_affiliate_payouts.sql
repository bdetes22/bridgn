-- Migration: affiliate payouts tracking
-- Run after 016_affiliate_rpc.sql

create table if not exists public.affiliate_payouts (
  id              uuid        primary key default gen_random_uuid(),
  brand_id        uuid        not null references auth.users(id) on delete cascade,
  creator_name    text        not null,
  amount          integer     not null default 0,  -- cents
  codes           text[],                          -- array of link codes included
  paid_at         timestamptz not null default now(),
  notes           text
);

create index if not exists affiliate_payouts_brand_id_idx
  on public.affiliate_payouts (brand_id, paid_at desc);

alter table public.affiliate_payouts enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'affiliate_payouts' and policyname = 'Brands manage own payouts'
  ) then
    create policy "Brands manage own payouts"
      on public.affiliate_payouts for all
      using (auth.uid() = brand_id);
  end if;
end $$;

-- Enable realtime on affiliate_links so click counts update live
alter publication supabase_realtime add table public.affiliate_links;
