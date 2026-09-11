"use client";

// "Page Preview" -- author request, 2026-09-11: true, discrete pages (not
// FormatPreview.tsx's always-on continuous-scroll approximation) with
// backgrounds placed exactly like the real PDF. Deliberately a separate,
// on-demand mode rather than replacing the live preview: FormatWorkspace's
// checkbox/select changes need to restyle instantly as the author clicks
// through options (see FormatPreview.tsx's own file comment on why running
// a real pagination engine on every click would be too slow for that) --
// this modal instead renders the EXACT real export pipeline (see
// app/projects/[projectId]/format/page-preview/route.ts) once, when the
// author explicitly asks to see it, and is honest that that takes a
// moment rather than pretending to be instant.
//
// How the fidelity actually works: the route hands back buildPrintHtml()'s
// real output (same function the PDF export calls) with a real Paged.js
// polyfill already spliced in, ready to paginate itself. This component's
// only job is to run that HTML inside a sandboxed iframe and wait for
// pagination to actually finish -- no separate rendering logic of its own,
// so there is nothing here that can drift from what a real PDF looks like.
import { useEffect, useRef, useState } from "react";
import { Loader2, BookOpen } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";

interface PagePreviewDocument {
  html: string;
  pageWidthIn: number;
  pageHeightIn: number;
}

// How long to keep showing the ordinary "Rendering pages..." spinner
// before switching to a gentler "still working" note -- a genuinely long
// novel with a lot of inline images can take longer than a quick glance,
// per the same "a minute or two" expectation FormatWorkspace.tsx already
// sets for the real PDF download, which this route's pagination is no
// faster than (it runs the identical Paged.js engine, just in-browser).
const SLOW_RENDER_NOTICE_MS = 8000;
// Ceiling on how long we'll keep polling the iframe for its
// data-paged-ready marker before assuming something went wrong rather
// than just being slow -- generous, since a genuinely huge book is a real
// (if rare) case, not a bug.
const READY_POLL_TIMEOUT_MS = 120000;
const READY_POLL_INTERVAL_MS = 200;

export function PagePreviewModal({
  projectId,
  queryString,
  children,
}: {
  projectId: string;
  /** Same URLSearchParams-encoded print options FormatWorkspace.tsx's
   * "Download PDF" link already builds (trim size + every PrintOptions
   * field) -- see buildPrintOptionsQueryString() there. Page Preview
   * always shows exactly what the author currently has selected, the
   * same options a PDF download right now would produce. */
  queryString: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "paginating" | "ready" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [doc, setDoc] = useState<PagePreviewDocument | null>(null);
  const [slowNotice, setSlowNotice] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  // Guards against a stale fetch's .then()/.catch() landing after the
  // author has since closed and reopened the modal (a fresh open always
  // starts a new "generation") -- deliberately NOT a useEffect-driven
  // fetch (see below): opening/closing is a real user interaction, not
  // state this component needs to "synchronize with an external system"
  // on every render, so the fetch belongs directly in the onOpenChange
  // handler instead of behind an effect watching `open`.
  const requestIdRef = useRef(0);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      // Reset so re-opening always fetches fresh (the author may have
      // changed print options since the last time this was open) --
      // also invalidates any in-flight fetch/poll from this generation.
      requestIdRef.current += 1;
      setStatus("idle");
      setErrorMessage(null);
      setDoc(null);
      setSlowNotice(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    setStatus("loading");
    setErrorMessage(null);
    setDoc(null);
    setSlowNotice(false);

    const slowTimer = window.setTimeout(() => {
      if (requestIdRef.current === requestId) setSlowNotice(true);
    }, SLOW_RENDER_NOTICE_MS);

    fetch(`/projects/${projectId}/format/page-preview?${queryString}`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body?.message || body?.error || "Page Preview failed");
        return body as PagePreviewDocument;
      })
      .then((body) => {
        if (requestIdRef.current !== requestId) return;
        setDoc(body);
        setStatus("paginating");
      })
      .catch((error: unknown) => {
        if (requestIdRef.current !== requestId) return;
        setErrorMessage(error instanceof Error ? error.message : String(error));
        setStatus("error");
      })
      .finally(() => {
        window.clearTimeout(slowTimer);
      });
  }

  // Once the iframe has loaded the fetched document, poll its
  // contentDocument for the data-paged-ready marker the route's own
  // bootstrap script sets after PagedPolyfill.preview() resolves (see
  // that route's withPagedJs() comment for why polling beats
  // postMessage here -- a same-origin srcDoc iframe's contentDocument is
  // just directly readable from the parent).
  useEffect(() => {
    if (status !== "paginating") return;

    const requestId = requestIdRef.current;
    const startedAt = Date.now();

    const interval = window.setInterval(() => {
      if (requestIdRef.current !== requestId) return;
      const ready = iframeRef.current?.contentDocument?.body?.getAttribute("data-paged-ready");
      if (ready === "1") {
        window.clearInterval(interval);
        setStatus("ready");
        return;
      }
      if (Date.now() - startedAt > READY_POLL_TIMEOUT_MS) {
        window.clearInterval(interval);
        setErrorMessage("This is taking much longer than expected -- try again, or check your internet connection.");
        setStatus("error");
      }
    }, READY_POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, [status]);

  const showSpinner = status === "loading" || status === "paginating";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="flex h-[92vh] w-[95vw] max-w-5xl flex-col gap-3 p-4 sm:p-5">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="size-4" />
            Page Preview
          </DialogTitle>
          <DialogDescription>
            The real print layout -- true page breaks and backgrounds placed exactly like your PDF download.
          </DialogDescription>
        </DialogHeader>

        <div className="relative min-h-0 flex-1 overflow-hidden rounded-md border border-border bg-muted/30">
          {showSpinner && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-muted/30">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {status === "loading" ? "Loading your manuscript..." : "Laying out real pages..."}
              </p>
              {slowNotice && (
                <p className="max-w-sm text-center text-xs text-muted-foreground">
                  Longer books can take a minute or two -- this is the same real pagination your PDF download uses.
                </p>
              )}
            </div>
          )}
          {status === "error" && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 bg-muted/30 px-6 text-center">
              <p className="text-sm font-medium text-foreground">Couldn&apos;t load Page Preview</p>
              <p className="text-xs text-muted-foreground">{errorMessage}</p>
            </div>
          )}
          {doc && (
            <iframe
              ref={iframeRef}
              title="Page Preview"
              srcDoc={doc.html}
              sandbox="allow-scripts allow-same-origin"
              className="size-full border-0 bg-white"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
