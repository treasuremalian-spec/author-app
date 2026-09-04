-- Adds the "book command center" fields (synopsis, tropes, POV & tense,
-- deadline, release date, playlist link) to projects, and a new
-- action_items table for a lightweight per-book to-do board.
-- Run this in Supabase's SQL Editor the same way 0001_init.sql was run.

alter table "projects"
  add column "synopsis" text,
  add column "tropes" text[] not null default '{}',
  add column "povAndTense" text,
  add column "deadline" timestamptz,
  add column "releaseDate" timestamptz,
  add column "playlistUrl" text;

create table "action_items" (
  "id" text primary key default gen_random_uuid()::text,
  "projectId" text not null references "projects"("id") on delete cascade,
  "title" text not null,
  "status" text not null default 'NO_STATUS',
  "notes" text,
  "orderIndex" integer not null default 0,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);
create index "action_items_project_status_order_idx" on "action_items" ("projectId","status","orderIndex");
