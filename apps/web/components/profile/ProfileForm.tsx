"use client";

import { useState } from "react";

import { AvatarUploadButton } from "@/components/profile/AvatarUploadButton";
import { updateMyProfile } from "@/lib/actions/profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface ProfileFormProps {
  displayName: string;
  username: string;
  bio: string;
  genres: string[];
  avatarUrl: string | null;
  error?: string;
  saved?: boolean;
}

export function ProfileForm({
  displayName,
  username,
  bio,
  genres,
  avatarUrl: initialAvatarUrl,
  error,
  saved,
}: ProfileFormProps) {
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [currentDisplayName, setCurrentDisplayName] = useState(displayName);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <AvatarUploadButton
          avatarUrl={avatarUrl}
          displayName={currentDisplayName || username}
          onAvatarChange={setAvatarUrl}
        />
        <div>
          <p className="font-display text-lg font-semibold">{currentDisplayName || username}</p>
          <p className="text-sm text-muted-foreground">@{username}</p>
        </div>
      </div>

      <form action={updateMyProfile} className="space-y-4">
        {error && (
          <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
        )}
        {saved && (
          <p className="rounded-lg bg-primary/10 p-3 text-sm text-primary">Profile updated.</p>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="displayName">Display name</Label>
          <Input
            id="displayName"
            name="displayName"
            required
            defaultValue={displayName}
            onChange={(e) => setCurrentDisplayName(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Username</Label>
          <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            @{username}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="genres">Genres you write (comma-separated)</Label>
          <Input id="genres" name="genres" defaultValue={genres.join(", ")} placeholder="Urban fiction, Dark romance" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bio">Short bio</Label>
          <Textarea
            id="bio"
            name="bio"
            rows={4}
            defaultValue={bio}
            placeholder="Tell your writing circle a little about you and what you write."
          />
        </div>
        <Button type="submit">Save changes</Button>
      </form>
    </div>
  );
}
