-- Inline manuscript images: a second public Storage bucket, separate from
-- "covers" (0003_covers_storage.sql) since a book can have many of these
-- (one per inserted image, not one per book) rather than exactly one --
-- same ownership-by-path-prefix privacy pattern as covers, though, so
-- writer uploads stay locked to their own projects at the database level,
-- not just in app code.

insert into storage.buckets (id, name, public)
values ('manuscript-images', 'manuscript-images', true)
on conflict (id) do nothing;

create policy "Manuscript images are publicly readable"
on storage.objects for select
using (bucket_id = 'manuscript-images');

create policy "Users can upload their own manuscript images"
on storage.objects for insert
with check (bucket_id = 'manuscript-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can replace their own manuscript images"
on storage.objects for update
using (bucket_id = 'manuscript-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can delete their own manuscript images"
on storage.objects for delete
using (bucket_id = 'manuscript-images' and (storage.foldername(name))[1] = auth.uid()::text);
