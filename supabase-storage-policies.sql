-- Run this in Supabase SQL Editor after creating a public bucket named:
-- tender-documents
--
-- This app currently uploads directly from the browser with the anon key.
-- That means inserts must be allowed for anon users on this bucket.

create policy "Allow public reads for tender documents"
on storage.objects
for select
to anon
using (bucket_id = 'tender-documents');

create policy "Allow browser uploads for tender documents"
on storage.objects
for insert
to anon
with check (bucket_id = 'tender-documents');
