"use client";

// Uploads (or removes) the book-wide background image used by the print
// PDF's "behind the text" background option (author request, 2026-09-07).
// Same direct-to-Storage upload pattern as CoverUploadButton.tsx, reusing
// the "covers" bucket (its RLS policy already allows any file under the
// uploader's own folder prefix, so no new bucket/migration is needed for
// this second per-project image) -- just a different filename so it never
// collides with the actual cover.

import { useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { updateProjectBackgroundImage } from "@/lib/actions/covers";
import { Button } from "@/components/ui/button";

const MAX_FILE_BYTES = 8 * 1024 * 1024;

export function BackgroundImageUploadButton({
  projectId,
  backgroundImageUrl,
  onChange,
}: {
  projectId: string;
  backgroundImageUrl: string | null;
  onChange: (url: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError("That image is a bit large -- try one under 8MB.");
      return;
    }

    setUploading(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError("You'll need to be logged in to upload an image.");
        return;
      }

      const extension = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${user.id}/${projectId}/background.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from("covers")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from("covers").getPublicUrl(path);
      const versionedUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`;

      await updateProjectBackgroundImage(projectId, versionedUrl);
      onChange(versionedUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't upload that image -- try again.");
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    setError(null);
    setUploading(true);
    try {
      await updateProjectBackgroundImage(projectId, null);
      onChange(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't remove that image -- try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        {backgroundImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- a Supabase Storage URL, not a local/optimizable asset
          <img
            src={backgroundImageUrl}
            alt=""
            className="h-12 w-12 shrink-0 rounded-md border border-border object-cover"
          />
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-dashed border-border bg-muted/40 text-muted-foreground">
            <ImagePlus className="size-4" />
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <ImagePlus className="size-3.5" />}
            {backgroundImageUrl ? "Change image" : "Upload image"}
          </Button>
          {backgroundImageUrl && (
            <Button type="button" size="sm" variant="ghost" disabled={uploading} onClick={handleRemove}>
              <X className="size-3.5" />
              Remove
            </Button>
          )}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = "";
        }}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
