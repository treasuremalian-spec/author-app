import { PRESENCE_DOT_CLASS, PRESENCE_LABEL, type EffectivePresence } from "@/lib/presence";
import { cn } from "@/lib/utils";

export function PresenceDot({ presence, showLabel = false }: { presence: EffectivePresence; showLabel?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5" title={PRESENCE_LABEL[presence]}>
      <span className={cn("size-2 shrink-0 rounded-full", PRESENCE_DOT_CLASS[presence])} />
      {showLabel && <span className="text-xs text-muted-foreground">{PRESENCE_LABEL[presence]}</span>}
    </span>
  );
}
