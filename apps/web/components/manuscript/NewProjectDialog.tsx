"use client";

import { useState } from "react";
import { Plus, Loader2 } from "lucide-react";

import { createProject } from "@/lib/actions/manuscript";
import { importDocxAsProject } from "@/lib/actions/docx-import";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
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

type StartMode = "blank" | "docx";

// Two ways to start a book: the original blank form, or (added 2026-09-07,
// per author request) uploading an existing Word manuscript -- headings
// become chapters, each chapter's paragraphs become that chapter's scene
// (see importDocxAsProject in lib/actions/docx-import.ts for the actual
// parsing). Kept as one dialog with a small mode toggle rather than a
// second entry point, since "start a book" is one decision either way.
export function NewProjectDialog() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<StartMode>("blank");
  const [pending, setPending] = useState(false);

  const [docxTitle, setDocxTitle] = useState("");
  const [docxFile, setDocxFile] = useState<File | null>(null);
  const [docxError, setDocxError] = useState<string | null>(null);

  async function handleDocxSubmit() {
    const title = docxTitle.trim();
    if (!title || !docxFile) return;
    setDocxError(null);
    setPending(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setDocxError("You'll need to be logged in to do this.");
        return;
      }

      const path = `${user.id}/${crypto.randomUUID()}.docx`;
      const { error: uploadError } = await supabase.storage.from("manuscript-imports").upload(path, docxFile, {
        contentType: docxFile.type || "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      if (uploadError) throw uploadError;

      await importDocxAsProject(path, title);
      // importDocxAsProject redirects into the new project on success.
    } catch (err) {
      setDocxError(err instanceof Error ? err.message : "Couldn't import that file -- try again.");
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setMode("blank");
          setDocxTitle("");
          setDocxFile(null);
          setDocxError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="lg">
          <Plus /> New book
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start a new book</DialogTitle>
          <DialogDescription>
            You can change any of this later -- this just gets your shelf started.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 rounded-lg bg-muted p-1 text-sm">
          <button
            type="button"
            onClick={() => setMode("blank")}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 font-medium transition-colors",
              mode === "blank" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            Start blank
          </button>
          <button
            type="button"
            onClick={() => setMode("docx")}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 font-medium transition-colors",
              mode === "docx" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            Start from a Word file
          </button>
        </div>

        {mode === "blank" ? (
          <form action={createProject} onSubmit={() => setPending(true)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="title">Title</Label>
              <Input id="title" name="title" required autoFocus placeholder="Working title" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="genres">Genres (comma-separated)</Label>
              <Input id="genres" name="genres" placeholder="Dark romance, Urban fiction" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="targetWordCount">Target word count</Label>
              <Input id="targetWordCount" name="targetWordCount" type="number" min={0} placeholder="80000" />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={pending} className="w-full sm:w-auto">
                {pending ? "Creating..." : "Create book"}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Already started writing in Word? We&apos;ll turn your headings into chapters and bring your prose in
              as-is -- bold and italic come with it; images, tables, and footnotes don&apos;t.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="docx-title">Title</Label>
              <Input
                id="docx-title"
                value={docxTitle}
                onChange={(e) => setDocxTitle(e.target.value)}
                required
                autoFocus
                placeholder="Working title"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="docx-file">Manuscript file (.docx)</Label>
              <input
                id="docx-file"
                type="file"
                accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(e) => setDocxFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium"
              />
            </div>
            {docxError && <p className="text-sm text-destructive">{docxError}</p>}
            <DialogFooter>
              <Button
                type="button"
                disabled={pending || !docxTitle.trim() || !docxFile}
                onClick={() => void handleDocxSubmit()}
                className="w-full sm:w-auto"
              >
                {pending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Importing...
                  </>
                ) : (
                  "Import & create book"
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
