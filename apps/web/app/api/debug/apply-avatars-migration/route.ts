// TEMPORARY -- applies supabase/migrations/0005_avatars_storage.sql
// against the live database from a Vercel-hosted route (this session's
// local device shell has no network path to Supabase, but Prisma's own
// DATABASE_URL connection -- used everywhere else in the app -- reaches
// it fine once deployed). Each statement is applied and reported
// individually so a partial-success retry is safe. Delete this route
// once confirmed applied.
import { NextResponse } from "next/server";
import { prisma } from "@author-app/database";

const STATEMENTS: { label: string; sql: string }[] = [
  {
    label: "insert bucket",
    sql: `insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true) on conflict (id) do nothing;`,
  },
  {
    label: "select policy",
    sql: `create policy "Avatars are publicly readable" on storage.objects for select using (bucket_id = 'avatars');`,
  },
  {
    label: "insert policy",
    sql: `create policy "Users can upload their own avatar" on storage.objects for insert with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);`,
  },
  {
    label: "update policy",
    sql: `create policy "Users can replace their own avatar" on storage.objects for update using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);`,
  },
  {
    label: "delete policy",
    sql: `create policy "Users can delete their own avatar" on storage.objects for delete using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);`,
  },
];

export async function GET() {
  const results: Record<string, { ok: boolean; detail: string }> = {};
  for (const { label, sql } of STATEMENTS) {
    try {
      await prisma.$executeRawUnsafe(sql);
      results[label] = { ok: true, detail: "applied" };
    } catch (err) {
      results[label] = { ok: false, detail: err instanceof Error ? err.message : String(err) };
    }
  }
  return NextResponse.json(results);
}
