-- Adds a book-wide background image URL to projects, for the print PDF's
-- new background-image print option (author request, 2026-09-07: full-page
-- images behind the text, either on every page or just each chapter's
-- opening page). Print-only -- the EPUB export never reads this column.
-- Run this in Supabase's SQL Editor the same way earlier migrations were run.

alter table "projects"
  add column "backgroundImageUrl" text;
