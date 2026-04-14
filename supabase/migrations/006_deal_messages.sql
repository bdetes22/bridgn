-- Migration: real-time deal messages
-- Run after 005_deal_metadata.sql

create table if not exists public.deal_messages (
  id              uuid        primary key default gen_random_uuid(),
  deal_id         text        not null,     -- bridgn_deal_id, matches deals.bridgn_deal_id
  sender_id       uuid        not null references auth.users(id) on delete cascade,
  sender_role     text        not null,     -- 'creator' | 'brand'
  sender_name     text,
  body            text        not null,
  created_at      timestamptz not null default now()
);

create index if not exists deal_messages_deal_id_idx
  on public.deal_messages (deal_id, created_at);

-- RLS: users can read messages for deals they're part of
alter table public.deal_messages enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'deal_messages' and policyname = 'Users read deal messages'
  ) then
    create policy "Users read deal messages"
      on public.deal_messages for select
      using (
        exists (
          select 1 from public.deals
          where deals.bridgn_deal_id = deal_messages.deal_id
            and (deals.creator_user_id = auth.uid() or deals.brand_user_id = auth.uid())
        )
      );
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'deal_messages' and policyname = 'Users send deal messages'
  ) then
    create policy "Users send deal messages"
      on public.deal_messages for insert
      with check (sender_id = auth.uid());
  end if;
end $$;

-- Enable Supabase Realtime on this table
alter publication supabase_realtime add table public.deal_messages;
