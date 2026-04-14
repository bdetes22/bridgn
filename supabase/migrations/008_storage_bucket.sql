-- Migration: Storage bucket for deal files (briefs, contracts)
-- Run after 007_brief_contract.sql

-- Create the bucket (public so files can be downloaded via URL)
insert into storage.buckets (id, name, public)
values ('deal-files', 'deal-files', true)
on conflict (id) do nothing;

-- Allow authenticated users to upload files
create policy "Authenticated users can upload deal files"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'deal-files');

-- Allow anyone to read (public bucket)
create policy "Public read access for deal files"
  on storage.objects for select
  to public
  using (bucket_id = 'deal-files');
