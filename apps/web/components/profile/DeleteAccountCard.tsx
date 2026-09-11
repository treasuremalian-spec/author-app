"use client";

// Self-serve account deletion (author request, 2026-09-11). Sits below
// ProfileForm on /profile -- the "Account" page -- as its own destructive
// section, mirroring the confirm-preview-then-confirm pattern already used
// for Replace All in BookSearchPanel.tsx: a plain "Delete my account"
// button expands into an explanation + a typed "DELETE" confirmation
// before anything irreversible happens.
import { useState } from "react";
import { AlertTriangle } from "lucide-react";

import { deleteMyAccount } from "@/lib/actions/account";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export function DeleteAccountCard() {
  const [confirming, setConfirming] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      const result = await deleteMyAccount(confirmText);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      // The account (and its session cookie) is already gone server-side --
      // a full navigation is the simplest correct way to land somewhere
      // that doesn't assume a signed-in user still exists.
      window.location.href = "/login?deleted=1";
    } catch {
      setError("Something went wrong deleting your account. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Card className="mt-6 border-destructive/30 shadow-none">
      <CardHeader>
        <span className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-destructive">
          <AlertTriangle className="size-3" />
          Danger zone
        </span>
        <CardTitle className="text-lg font-normal">Delete your account</CardTitle>
        <CardDescription>
          Permanently deletes every book, chapter, character, and file in your account. This
          can&apos;t be undone.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!confirming ? (
          <Button type="button" variant="destructive" onClick={() => setConfirming(true)}>
            Delete my account
          </Button>
        ) : (
          <div className="space-y-3 rounded-md border border-destructive/30 bg-destructive/5 p-4">
            <p className="text-sm text-foreground">
              This deletes all of your projects, manuscripts, story bible entries, uploaded
              images, and your login itself -- for good. Type <strong>DELETE</strong> below to
              confirm.
            </p>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Type DELETE"
              className="max-w-xs"
              autoFocus
            />
            <div className="flex gap-2">
              <Button
                type="button"
                variant="destructive"
                disabled={deleting || confirmText.trim().toUpperCase() !== "DELETE"}
                onClick={handleDelete}
              >
                {deleting ? "Deleting…" : "Permanently delete my account"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={deleting}
                onClick={() => {
                  setConfirming(false);
                  setConfirmText("");
                  setError(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
