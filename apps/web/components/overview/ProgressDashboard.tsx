"use client";

import { Calendar, Target, TrendingUp } from "lucide-react";

import { Card } from "@/components/ui/card";
import type { ProjectDetails } from "@/lib/actions/overview";

function daysBetween(from: Date, to: Date) {
  const ms = to.setHours(0, 0, 0, 0) - from.setHours(0, 0, 0, 0);
  return Math.round(ms / 86400000);
}

function StatTile({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="flex-1 rounded-xl border border-border bg-card p-4">
      <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </div>
      <p className="font-display text-2xl font-semibold">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function ProgressDashboard({ details }: { details: ProjectDetails }) {
  const { currentWordCount, targetWordCount, deadline } = details;

  const progress =
    targetWordCount && targetWordCount > 0
      ? Math.min(100, Math.round((currentWordCount / targetWordCount) * 100))
      : null;

  const daysRemaining = deadline ? daysBetween(new Date(), new Date(deadline)) : null;

  const wordsPerDayNeeded =
    targetWordCount && daysRemaining !== null && daysRemaining > 0
      ? Math.max(0, Math.ceil((targetWordCount - currentWordCount) / daysRemaining))
      : null;

  return (
    <Card className="space-y-4 p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Progress
      </p>

      <div>
        <div className="mb-1.5 flex items-baseline justify-between text-sm">
          <span className="font-medium">{currentWordCount.toLocaleString()} words</span>
          {targetWordCount ? (
            <span className="text-muted-foreground">of {targetWordCount.toLocaleString()}</span>
          ) : (
            <span className="text-muted-foreground">no goal set yet</span>
          )}
        </div>
        {progress !== null && (
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <StatTile
          icon={Target}
          label="Progress"
          value={progress !== null ? `${progress}%` : "--"}
        />
        <StatTile
          icon={Calendar}
          label="Days to deadline"
          value={daysRemaining !== null ? `${daysRemaining}` : "--"}
          sub={!deadline ? "no deadline set" : daysRemaining !== null && daysRemaining < 0 ? "past deadline" : undefined}
        />
        <StatTile
          icon={TrendingUp}
          label="Words/day needed"
          value={wordsPerDayNeeded !== null ? wordsPerDayNeeded.toLocaleString() : "--"}
        />
      </div>
    </Card>
  );
}
