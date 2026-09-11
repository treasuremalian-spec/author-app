// The shared "page type" vocabulary for a chapter-level manuscript node --
// backs the Vellum-style "Convert To" menu on the Binder sidebar (a plain
// numbered Chapter, or one of the standard front-/back-matter kinds:
// Dedication, Copyright, Acknowledgments, and so on).
//
// Import-free (like trim-sizes.ts right next to it), so both a CLIENT
// component (the Binder's "Convert To" menu, via a subpath import) and
// every export renderer (print-html.ts, build-epub.ts, build-docx.ts) can
// share the exact same vocabulary and heading logic without pulling in
// this package's server-only barrel (puppeteer-core etc.) into a browser
// bundle -- see trim-sizes.ts's file comment for the real local `next
// build` failure that established this split.
//
// Added 2026-09-11, Phase 16 (author request): a per-chapter "Convert To"
// page type, plus three related per-node options -- "Numbered" (an
// automatic "Chapter <n>" label, independent of a custom title -- can
// show alongside one, e.g. "Chapter Three: The Storm"), "Add Chapter
// Author" (a per-chapter byline, for multi-author anthologies), and "Show
// Heading in Book" (a per-chapter override of the book-wide
// PrintOptions.showChapterTitles setting, in either direction). "Clear
// Title" (the fourth option from the same backlog note) needed no new
// field -- it's just the existing rename action with an empty string,
// which already falls back to this file's chapterHeadingLabel() the same
// way a never-titled chapter does.

export type PageType =
  | "CHAPTER"
  | "BLURBS"
  | "COPYRIGHT"
  | "DEDICATION"
  | "EPIGRAPH"
  | "FOREWORD"
  | "INTRODUCTION"
  | "PREFACE"
  | "PROLOGUE"
  | "EPILOGUE"
  | "AFTERWORD"
  | "BIBLIOGRAPHY"
  | "ACKNOWLEDGMENTS"
  | "ABOUT_THE_AUTHOR"
  | "ALSO_BY"
  | "UNCATEGORIZED";

export const PAGE_TYPE_LABELS: Record<PageType, string> = {
  CHAPTER: "Chapter",
  BLURBS: "Blurbs",
  COPYRIGHT: "Copyright",
  DEDICATION: "Dedication",
  EPIGRAPH: "Epigraph",
  FOREWORD: "Foreword",
  INTRODUCTION: "Introduction",
  PREFACE: "Preface",
  PROLOGUE: "Prologue",
  EPILOGUE: "Epilogue",
  AFTERWORD: "Afterword",
  BIBLIOGRAPHY: "Bibliography",
  ACKNOWLEDGMENTS: "Acknowledgments",
  ABOUT_THE_AUTHOR: "About the Author",
  ALSO_BY: "Also By",
  UNCATEGORIZED: "Uncategorized",
};

/** Order the "Convert To" menu lists these in -- matches the author's own list. */
export const CONVERT_TO_PAGE_TYPES: PageType[] = [
  "CHAPTER",
  "BLURBS",
  "COPYRIGHT",
  "DEDICATION",
  "EPIGRAPH",
  "FOREWORD",
  "INTRODUCTION",
  "PREFACE",
  "PROLOGUE",
  "EPILOGUE",
  "AFTERWORD",
  "BIBLIOGRAPHY",
  "ACKNOWLEDGMENTS",
  "ABOUT_THE_AUTHOR",
  "ALSO_BY",
  "UNCATEGORIZED",
];

/**
 * What heading prints for a page type when its node has no title typed in.
 * UNCATEGORIZED deliberately maps to "" (no heading at all, not the
 * literal word "Uncategorized") -- it's an organizational bucket ("styled
 * like a chapter but isn't one"), not reader-facing back matter, so an
 * untitled Uncategorized node should print silently rather than leaking
 * an internal label into the exported book.
 */
export const PAGE_TYPE_DEFAULT_HEADING: Record<PageType, string> = {
  ...PAGE_TYPE_LABELS,
  UNCATEGORIZED: "",
};

/**
 * Which page types show up in a real, in-book Table of Contents -- the
 * EPUB's own "Contents" page and the print PDF's optional TOC page (both
 * added 2026-09-11, author request). Confirmed with the author before
 * building: the "real" reading content only -- Chapters, Prologue, and
 * Epilogue -- matching how most published fiction's own TOC looks, and
 * deliberately skipping front-/back-matter like Copyright, Dedication,
 * Epigraph, Foreword, Introduction, Preface, Afterword, Bibliography,
 * Acknowledgments, About the Author, Also By, and Uncategorized. This is
 * SEPARATE from EPUB_TYPE_BY_PAGE_TYPE (build-epub.ts) -- that's about
 * giving every page type real EPUB3 semantics; this is specifically about
 * what's worth a reader jumping to from a Contents page. Note this only
 * governs the new in-book Contents page -- the e-reader's own built-in
 * TOC menu (nav.xhtml) is unrelated and unchanged, and still lists every
 * page type as it always has.
 */
export const PAGE_TYPE_IN_TOC: Record<PageType, boolean> = {
  CHAPTER: true,
  PROLOGUE: true,
  EPILOGUE: true,
  BLURBS: false,
  COPYRIGHT: false,
  DEDICATION: false,
  EPIGRAPH: false,
  FOREWORD: false,
  INTRODUCTION: false,
  PREFACE: false,
  AFTERWORD: false,
  BIBLIOGRAPHY: false,
  ACKNOWLEDGMENTS: false,
  ABOUT_THE_AUTHOR: false,
  ALSO_BY: false,
  UNCATEGORIZED: false,
};

/**
 * The single place that decides what heading text prints above a
 * chapter-level node's content -- shared by print-html.ts, build-epub.ts
 * and build-docx.ts so the three renderers can never drift on this.
 *
 * Preserves the app's original either/or fallback for plain chapters (a
 * real title always wins over the generic default) and layers two
 * independent, opt-in behaviors on top of it:
 *  - "Numbered" (CHAPTER page type only) prints "Chapter <n>" ahead of --
 *    not instead of -- a real title, e.g. "Chapter Three: The Storm".
 *    Defaults to off (see the ManuscriptNode.numbered doc comment in
 *    schema.prisma for why), so an existing titled chapter's heading is
 *    unchanged unless the author explicitly turns it on for that chapter.
 *  - every other page type never gets an automatic number; a blank title
 *    falls back to that type's own name (e.g. "Dedication"), except
 *    UNCATEGORIZED (see PAGE_TYPE_DEFAULT_HEADING above).
 */
export function chapterHeadingLabel(input: {
  pageType: PageType;
  title: string | null | undefined;
  numbered: boolean;
  chapterNumber: number;
}): string {
  const trimmedTitle = input.title?.trim() || "";
  if (input.pageType === "CHAPTER") {
    const numberLabel = `Chapter ${input.chapterNumber}`;
    if (!trimmedTitle) return numberLabel;
    return input.numbered ? `${numberLabel}: ${trimmedTitle}` : trimmedTitle;
  }
  return trimmedTitle || PAGE_TYPE_DEFAULT_HEADING[input.pageType];
}
