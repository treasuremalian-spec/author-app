"use client";

// Lets an author add/change their profile picture -- same upload pattern
// as CoverUploadButton.tsx (browser straight to Supabase Storage, no
// server round-trip for the file bytes), just against the "avatars"
// bucket (see supabase/migrations/0005_avatars_storage.sql) and a fixed
// "<user id>/avatar.<ext>" path, since a profile has exactly one picture
// rather than one per book.

import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { updateAvatarUrl } from "@/lib/actions/profile";
import { cn } from "@/lib/utils";

const MAX_FILE_BYTES = 8 * 1024 * 1024;

interface AvatarUploadButtonProps {
  avatarUrl: string | null;
  displayName: string;
  onAvatarChange: (url: string) => void;
  className?: string;
  size?: "sm" | "lg";
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function AvatarUploadButton({
  avatarUrl,
  displayName,
  onAvatarChange,
  className,
  size = "lg",
}: AvatarUploadButtonProps) {
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
        setError("You'll need to be logged in to upload a photo.");
        return;
      }

      const extension = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${user.id}/avatar.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from("avatars").getPublicUrl(path);
      const versionedUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`;

      await updateAvatarUrl(versionedUrl);
      onAvatarChange(versionedUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't upload that photo -- try again.");
    } finally {
      setUploading(false);
    }
  }

  const dimension = size === "lg" ? "size-24" : "size-9";

  return (
    <div className={cn("group relative inline-block", className)}>
      <div className={cn(dimension, "overflow-hidden rounded-full bg-secondary")}>
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- a Supabase Storage URL, not a local/optimizable asset
          <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center font-display font-semibold text-muted-foreground">
            {initials(displayName)}
          </div>
        )}
      </div>

      <button
        type="button"
        disabled={uploading}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          inputRef.current?.click();
        }}
        title={avatarUrl ? "Change photo" : "Add photo"}
        aria-label={avatarUrl ? "Change photo" : "Add photo"}
        className={cn(
          "absolute inset-0 flex items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100",
          uploading && "opacity-100"
        )}
      >
        {uploading ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
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
        <p className="absolute left-1/2 top-full z-10 mt-1 w-max max-w-[12rem] -translate-x-1/2 text-center text-[11px] text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
