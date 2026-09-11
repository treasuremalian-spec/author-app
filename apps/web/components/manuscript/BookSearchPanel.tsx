"use client";

// "Search words or phrases in the book to jump to it" (author request,
// 2026-09-11), plus find & replace. Lives in the Binder's header -- the
// closest thing this app has to a book-wide toolbar -- since a search
// here has to reach every chapter, not just whichever one is currently
// open for writing.
//
// Finding matches and jumping to one is entirely client-side: `nodes`
// already carries every chapter's real content (ProjectWorkspace gets it
// from getProjectData()'s `include: { scene: true }`), and
// manuscript-search.ts's findMatches() builds a REAL, headless
// ProseMirror document from that same JSON to compute exact, jumpable
// positions -- no per-chapter fetch needed just to search. Only Replace
// All needs a server round-trip (lib/actions/manuscript-search.ts),
// since it may touch scenes that aren't the one currently mounted.
import { useMemo, useState } from "react";
import { Search, X, Replace as ReplaceIcon, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { ManuscriptNodeData } from "@/lib/manuscript-tree";
import { searchBook, replaceWithinTextNodes, findMatches, docFromContent, type SearchMatch } from "@/lib/manuscript-search";
import { replaceInBook, type ReplaceInBookResult } from "@/lib/actions/manuscript-search";

interface BookSearchPanelProps {
  projectId: string;
  nodes: ManuscriptNodeData[];
  onClose: () => void;
  onJumpToMatch: (nodeId: string, match: SearchMatch) => void;
  onReplaceOne: (nodeId: string, match: SearchMatch, replacement: string) => void;
}

function highlightSnippet(snippet: string, query: string) {
  if (!query) return snippet;
  const idx = snippet.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return snippet;
  return (
    <>
      {snippet.slice(0, idx)}
      <mark className="rounded-sm bg-accent/60 px-0.5 text-accent-foreground">
        {snippet.slice(idx, idx + query.length)}
      </mark>
      {snippet.slice(idx + query.length)}
    </>
  );
}

export function BookSearchPanel({ projectId, nodes, onClose, onJumpToMatch, onReplaceOne }: BookSearchPanelProps) {
  const [query, setQuery] = useState("");
  const [replaceMode, setReplaceMode] = useState(false);
  const [replacement, setReplacement] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [replacingAll, setReplacingAll] = useState(false);
  const [lastResult, setLastResult] = useState<ReplaceInBookResult | null>(null);

  const chapters = useMemo(
    () =>
      nodes
        .filter((n) => n.scene)
        .map((n) => ({ id: n.id, title: n.title || "Untitled", content: n.scene!.content })),
    [nodes]
  );

  const trimmedQuery = query.trim();
  const results = useMemo(
    () => (trimmedQuery ? searchBook(chapters, trimmedQuery, { caseSensitive }) : []),
    [chapters, trimmedQuery, caseSensitive]
  );
  const totalMatches = results.reduce((sum, r) => sum + r.matches.length, 0);

  // Same "crosses a formatting boundary" preview Replace All will actually
  // apply -- computed with the identical replaceWithinTextNodes() the
  // server action uses, so the number shown here never disagrees with
  // what really happens.
  const replacePreview = useMemo(() => {
    if (!replaceMode || !trimmedQuery) return null;
    let safeCount = 0;
    let chaptersAffected = 0;
    for (const chapter of chapters) {
      const doc = docFromContent(chapter.content);
      if (!doc) continue;
      const matches = findMatches(doc, trimmedQuery, { caseSensitive });
      if (matches.length === 0) continue;
      const { replacedCount } = replaceWithinTextNodes(chapter.content, trimmedQuery, replacement, caseSensitive);
      safeCount += replacedCount;
      if (replacedCount > 0) chaptersAffected += 1;
    }
    return { safeCount, chaptersAffected, skipped: totalMatches - safeCount };
  }, [replaceMode, trimmedQuery, replacement, caseSensitive, chapters, totalMatches]);

  function reset() {
    setQuery("");
    setReplacement("");
    setReplaceMode(false);
    setConfirming(false);
    setLastResult(null);
  }

  async function handleConfirmReplaceAll() {
    setReplacingAll(true);
    try {
      const result = await replaceInBook(projectId, trimmedQuery, replacement, { caseSensitive });
      setLastResult(result);
      setConfirming(false);
      // Every scene's content may have changed server-side -- the
      // simplest guaranteed-correct way to bring the in-memory tree (and
      // whichever scene is currently open in the editor) back in sync is
      // a full reload, rather than trying to hand-patch React state for
      // however many chapters this touched.
      if (result.chaptersChanged > 0) {
        window.location.reload();
      }
    } finally {
      setReplacingAll(false);
    }
  }

  return (
    <div className="border-b border-border bg-card px-3 py-2.5">
      <div className="flex items-center gap-1.5">
        <Search className="size-3.5 shrink-0 text-muted-foreground" />
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the book…"
          className="h-7 flex-1 text-xs"
        />
        <button
          type="button"
          title={replaceMode ? "Hide replace" : "Replace"}
          aria-label={replaceMode ? "Hide replace" : "Replace"}
          onClick={() => setReplaceMode((v) => !v)}
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            replaceMode && "bg-muted text-foreground"
          )}
        >
          <ReplaceIcon className="size-3.5" />
        </button>
        <button
          type="button"
          title="Case sensitive"
          aria-label="Case sensitive"
          onClick={() => setCaseSensitive((v) => !v)}
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[11px] font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            caseSensitive && "bg-muted text-foreground"
          )}
        >
          Aa
        </button>
        <button
          type="button"
          title="Close search"
          aria-label="Close search"
          onClick={() => {
            reset();
            onClose();
          }}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {replaceMode && (
        <div className="mt-1.5 flex items-center gap-1.5 pl-5">
          <ReplaceIcon className="size-3.5 shrink-0 text-transparent" />
          <Input
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            placeholder="Replace with…"
            className="h-7 flex-1 text-xs"
          />
        </div>
      )}

      {trimmedQuery && (
        <div className="mt-2">
          <p className="pl-5 text-[11px] text-muted-foreground">
            {totalMatches === 0
              ? "No matches"
              : `${totalMatches} match${totalMatches === 1 ? "" : "es"} in ${results.length} chapter${results.length === 1 ? "" : "s"}`}
          </p>

          {totalMatches > 0 && (
            <div className="mt-1 max-h-64 overflow-y-auto pl-1">
              {results.map((chapterResult) => (
                <div key={chapterResult.nodeId} className="mb-1.5">
                  <p className="px-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground/70">
                    {chapterResult.title}
                  </p>
                  {chapterResult.matches.map((match, i) => (
                    <div key={i} className="group flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onJumpToMatch(chapterResult.nodeId, match)}
                        className="flex-1 truncate rounded-md px-2 py-1 text-left text-[11px] text-foreground/80 hover:bg-muted"
                      >
                        {highlightSnippet(match.snippet, trimmedQuery)}
                      </button>
                      {replaceMode && (
                        <button
                          type="button"
                          title="Replace this one"
                          onClick={() => onReplaceOne(chapterResult.nodeId, match, replacement)}
                          className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
                        >
                          Replace
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {replaceMode && totalMatches > 0 && (
            <div className="mt-2 border-t border-border pt-2">
              {!confirming ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 w-full text-[11px]"
                  onClick={() => setConfirming(true)}
                >
                  Replace All ({replacePreview?.safeCount ?? 0})
                </Button>
              ) : (
                <div className="space-y-1.5 rounded-md bg-muted/60 p-2">
                  <p className="text-[11px] text-foreground">
                    Replace {replacePreview?.safeCount ?? 0} occurrence
                    {(replacePreview?.safeCount ?? 0) === 1 ? "" : "s"} across{" "}
                    {replacePreview?.chaptersAffected ?? 0} chapter
                    {(replacePreview?.chaptersAffected ?? 0) === 1 ? "" : "s"}?
                  </p>
                  {!!replacePreview?.skipped && (
                    <p className="text-[10px] text-muted-foreground">
                      {replacePreview.skipped} match{replacePreview.skipped === 1 ? "" : "es"} span bold/italic/
                      link formatting and will be skipped -- you&apos;ll need to fix those by hand.
                    </p>
                  )}
                  <div className="flex gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="default"
                      disabled={replacingAll}
                      className="h-7 flex-1 text-[11px]"
                      onClick={handleConfirmReplaceAll}
                    >
                      {replacingAll ? "Replacing…" : "Confirm"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={replacingAll}
                      className="h-7 flex-1 text-[11px]"
                      onClick={() => setConfirming(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {lastResult && (
            <p className="mt-1.5 flex items-center gap-1 pl-5 text-[10px] text-success">
              <ChevronRight className="size-3" />
              Replaced {lastResult.occurrencesReplaced} across {lastResult.chaptersChanged} chapter
              {lastResult.chaptersChanged === 1 ? "" : "s"}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
