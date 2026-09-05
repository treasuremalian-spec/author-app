-- Book cover images: a public Storage bucket, with write access locked to
-- each file's owning user via a "<user id>/..." path prefix (the same
-- privacy pattern the rest of this project uses -- enforced in the
-- database, not just in app code). Public read is intentional: covers are
-- meant to be seen by readers (embedded in exported EPUB/PDF files, shown
-- on the library shelf), so there's nothing to protect on the read side.

insert into storage.buckets (id, name, public)
values ('covers', 'covers', true)
on conflict (id) do nothing;

create policy "Cover images are publicly readable"
on storage.objects for select
using (bucket_id = 'covers');

create policy "Users can upload their own covers"
on storage.objects for insert
with check (bucket_id = 'covers' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can replace their own covers"
on storage.objects for update
using (bucket_id = 'covers' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can delete their own covers"
on storage.objects for delete
using (bucket_id = 'covers' and (storage.foldername(name))[1] = auth.uid()::text);
