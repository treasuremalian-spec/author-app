-- Adds the Vellum-style per-chapter "Convert To" page type plus three
-- related per-chapter formatting options (author request, 2026-09-11,
-- Phase 16): "Numbered" (an automatic "Chapter <n>" label that can show
-- alongside a custom title, instead of only ever replacing it), "Add
-- Chapter Author" (a per-chapter byline for multi-author anthologies),
-- and "Show Heading in Book" (a per-chapter override of the book-wide
-- "show chapter titles" print option, in either direction). All four are
-- meaningful only on CHAPTER-type nodes; PART/SCENE rows just carry the
-- defaults, unused.
--
-- Defaults are chosen so no existing manuscript's exported appearance
-- changes until the author explicitly opts a chapter in: pageType
-- 'CHAPTER' is "not converted," and numbered defaults to false so a
-- titled chapter's heading looks exactly as it did before this migration
-- (see chapterHeadingLabel() in packages/formatting-engine/page-types.ts
-- for the exact fallback rule every export renderer shares).
--
-- Run this in Supabase's SQL Editor the same way earlier migrations were run.

create type "ManuscriptPageType" as enum (
  'CHAPTER',
  'BLURBS',
  'COPYRIGHT',
  'DEDICATION',
  'EPIGRAPH',
  'FOREWORD',
  'INTRODUCTION',
  'PREFACE',
  'PROLOGUE',
  'EPILOGUE',
  'AFTERWORD',
  'BIBLIOGRAPHY',
  'ACKNOWLEDGMENTS',
  'ABOUT_THE_AUTHOR',
  'ALSO_BY',
  'UNCATEGORIZED'
);

alter table "manuscript_nodes"
  add column "pageType" "ManuscriptPageType" not null default 'CHAPTER',
  add column "numbered" boolean not null default false,
  add column "chapterAuthor" text,
  add column "showHeadingOverride" boolean;
