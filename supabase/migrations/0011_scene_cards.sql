-- Adds the Story Bible "Scene Cards" corkboard (author request,
-- 2026-09-11): short synopsis/note index cards that can be dragged
-- between chapters (mirroring the real manuscript) or left in an
-- "Unassigned" pool, and reordered within a chapter.
--
-- Deliberately a separate table from the existing (unused) plot_board_cards
-- -- that one organizes by an author-defined column/Act, this one
-- organizes by the manuscript's real chapters via chapterNodeId.
--
-- chapterNodeId is nullable with ON DELETE SET NULL so a card survives
-- its chapter being deleted -- it just falls back to "Unassigned" rather
-- than disappearing.
--
-- Run this in Supabase's SQL Editor the same way earlier migrations were run.

create table "scene_cards" (
  "id" text primary key default gen_random_uuid()::text,
  "projectId" text not null references "projects"("id") on delete cascade,
  "chapterNodeId" text references "manuscript_nodes"("id") on delete set null,
  "title" text not null,
  "synopsis" text,
  "orderIndex" integer not null,
  "colorTag" text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);
create index "scene_cards_project_chapter_order_idx" on "scene_cards" ("projectId","chapterNodeId","orderIndex");
