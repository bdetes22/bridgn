-- Migration: RPC function for atomic click increment
-- Run after 015_affiliate_full_schema.sql

create or replace function public.increment_affiliate_clicks(link_code text)
returns void language plpgsql security definer as $$
begin
  update public.affiliate_links
  set clicks = clicks + 1
  where code = link_code;
end;
$$;
