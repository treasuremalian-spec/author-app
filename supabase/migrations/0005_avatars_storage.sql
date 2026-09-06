-- Author profile pictures: a third public Storage bucket, same
-- ownership-by-path-prefix privacy pattern as covers (0003) and
-- manuscript-images (0004) -- one avatar per user, so uploads use a fixed
-- "<user id>/avatar.<ext>" path (like covers' "<user id>/<projectId>/cover.<ext>",
-- just without the project segment since a profile picture isn't per-book).

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "Avatars are publicly readable"
on storage.objects for select
using (bucket_id = 'avatars');

create policy "Users can upload their own avatar"
on storage.objects for insert
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can replace their own avatar"
on storage.objects for update
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can delete their own avatar"
on storage.objects for delete
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
