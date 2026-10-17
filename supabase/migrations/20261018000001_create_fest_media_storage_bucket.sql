-- Migration: 20261018000001_create_fest_media_storage_bucket.sql
-- Description: Create public storage bucket 'fest-media' for optimized event posters, podium celebrations, and festival gallery media.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'fest-media',
  'fest-media',
  true,
  5242880, -- 5 MB max per file
  array['image/webp', 'image/jpeg', 'image/png', 'image/gif']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/webp', 'image/jpeg', 'image/png', 'image/gif'];

-- Storage RLS: Anyone can view objects in 'fest-media'
do $$
begin
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'Public Read Access for fest-media'
  ) then
    create policy "Public Read Access for fest-media"
    on storage.objects for select
    using (bucket_id = 'fest-media');
  end if;
end $$;

-- Storage RLS: Authenticated users / service role can insert
do $$
begin
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'Authenticated / Service upload to fest-media'
  ) then
    create policy "Authenticated / Service upload to fest-media"
    on storage.objects for insert
    with check (bucket_id = 'fest-media');
  end if;
end $$;
