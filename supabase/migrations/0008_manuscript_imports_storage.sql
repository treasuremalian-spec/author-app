-- A private Storage bucket for uploaded .docx manuscript files -- used by
-- both "start a new book from a Word file" and "re-import an edited
-- manuscript" (author request, 2026-09-07; see
-- apps/web/lib/actions/docx-import.ts). Deliberately private (unlike
-- "manuscript-images"/"covers", which are public) since these files carry
-- a writer's actual full manuscript text, not just an illustration --
-- only the uploading user (via their own authenticated session, both for
-- the client-side upload and the server action that reads it back to
-- parse) can read their own upload. Same ownership-by-path-prefix pattern
-- as the other buckets otherwise.

insert into storage.buckets (id, name, public)
values ('manuscript-imports', 'manuscript-imports', false)
on conflict (id) do nothing;

create policy "Users can read their own manuscript import uploads"
on storage.objects for select
using (bucket_id = 'manuscript-imports' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can upload their own manuscript imports"
on storage.objects for insert
with check (bucket_id = 'manuscript-imports' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can delete their own manuscript import uploads"
on storage.objects for delete
using (bucket_id = 'manuscript-imports' and (storage.foldername(name))[1] = auth.uid()::text);
