"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { createProject } from "@/lib/actions/manuscript";
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

export function NewProjectDialog() {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
        <form
          action={createProject}
          onSubmit={() => setPending(true)}
          className="space-y-4"
        >
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
            <Input
              id="targetWordCount"
              name="targetWordCount"
              type="number"
              min={0}
              placeholder="80000"
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending} className="w-full sm:w-auto">
              {pending ? "Creating..." : "Create book"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
