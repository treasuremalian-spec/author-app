"use client";

// "Re-import edited manuscript" -- the second half of the Word round-trip
// (see build-docx.ts for the export side): upload an edited .docx and
// REPLACE this project's entire chapter/scene tree with its content (see
// replaceProjectFromDocx in lib/actions/docx-import.ts for exactly what
// that does and why it's a wholesale replace rather than a merge).
// Genuinely destructive to the existing manuscript text, so this asks the
// author to type the project's own title to confirm before anything
// uploads -- the same "type to confirm" pattern used for other
// hard-to-undo actions, just implemented locally here since this is this
// project's first one.
//
// Upload goes straight from the browser to the private "manuscript-
// imports" Storage bucket (see supabase/migrations/
// 0008_manuscript_imports_storage.sql), the same direct-upload shape
// Toolbar.tsx already uses for inline images -- the server action then
// reads it back with ITS OWN authenticated session, so Storage's RLS (an
// uploader can only ever read their own uploads) is real enforcement, not
// just client-side plumbing.

import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import { replaceProjectFromDocx } from "@/lib/actions/docx-import";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const MAX_DOCX_BYTES = 25 * 1024 * 1024; // 25MB -- a full novel manuscript is typically well under 1MB of actual text, this just guards against an accidental wrong-file upload.

export function ReimportManuscriptDialog({
  projectId,
  projectTitle,
  children,
}: {
  projectId: string;
  projectTitle: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const confirmed = confirmText.trim().toLowerCase() === projectTitle.trim().toLowerCase();

  async function handleSubmit() {
    if (!file || !confirmed) return;
    setError(null);
    setPending(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError("You'll need to be logged in to do this.");
        return;
      }

      const path = `${user.id}/${crypto.randomUUID()}.docx`;
      const { error: uploadError } = await supabase.storage.from("manuscript-imports").upload(path, file, {
        contentType: file.type || "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      if (uploadError) throw uploadError;

      await replaceProjectFromDocx(projectId, path);
      // replaceProjectFromDocx redirects on success -- if we're still here,
      // something unexpected happened server-side.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't import that file -- try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setConfirmText("");
          setFile(null);
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Re-import edited manuscript</DialogTitle>
          <DialogDescription>
            This REPLACES every chapter and scene in this book with the content of the file you upload. Your story
            bible, cover, and settings are untouched -- but the current manuscript text will be gone. This
            can&apos;t be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="reimport-file">Edited Word file (.docx)</Label>
            <input
              ref={inputRef}
              id="reimport-file"
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium"
            />
            {file && file.size > MAX_DOCX_BYTES && (
              <p className="text-xs text-destructive">That file looks unusually large for a manuscript -- double-check it&apos;s the right file.</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reimport-confirm">
              Type <span className="font-semibold">{projectTitle}</span> to confirm
            </Label>
            <Input
              id="reimport-confirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={projectTitle}
              autoComplete="off"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            variant="destructive"
            disabled={!file || !confirmed || pending}
            onClick={() => void handleSubmit()}
          >
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Replacing manuscript...
              </>
            ) : (
              "Replace manuscript"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
