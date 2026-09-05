"use client";

// Lets a book get a cover image right from the library shelf -- Vellum-
// style, where the cover lives with the book everywhere it shows up
// (here, and baked into the EPUB/PDF exports). Uploads straight from the
// browser to Supabase Storage (no server round-trip for the file bytes
// themselves), then saves the resulting public URL onto the project.

import { useRef, useState } from "react";
import { ImagePlus, Loader2 } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { updateProjectCover } from "@/lib/actions/covers";
import { cn } from "@/lib/utils";

const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8MB -- plenty for a cover, small enough to embed in exports comfortably

interface CoverUploadButtonProps {
  projectId: string;
  coverImageUrl: string | null;
  onCoverChange: (url: string) => void;
  className?: string;
}

export function CoverUploadButton({ projectId, coverImageUrl, onCoverChange, className }: CoverUploadButtonProps) {
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
        setError("You'll need to be logged in to upload a cover.");
        return;
      }

      const extension = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${user.id}/${projectId}/cover.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from("covers")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from("covers").getPublicUrl(path);
      // Cache-bust: the path (and so the public URL) stays the same when a
      // cover is replaced, so without this, browsers/CDNs would keep
      // showing the old image after a "change cover".
      const versionedUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`;

      await updateProjectCover(projectId, versionedUrl);
      onCoverChange(versionedUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't upload that cover -- try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className={cn("group relative", className)}>
      {coverImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- a Supabase Storage URL, not a local/optimizable asset
        <img src={coverImageUrl} alt="" className="h-full w-full rounded-lg object-cover" />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-muted/40 text-muted-foreground">
          <ImagePlus className="size-5" />
        </div>
      )}

      <button
        type="button"
        disabled={uploading}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          inputRef.current?.click();
        }}
        className={cn(
          "absolute inset-0 flex items-center justify-center rounded-lg bg-black/60 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100",
          uploading && "opacity-100"
        )}
      >
        {uploading ? <Loader2 className="size-4 animate-spin" /> : coverImageUrl ? "Change cover" : "Add cover"}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = "";
        }}
      />

      {error && (
        <p className="absolute -bottom-5 left-0 w-full text-center text-[11px] text-destructive">{error}</p>
      )}
    </div>
  );
}
