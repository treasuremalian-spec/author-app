"use client";

// The Story Bible's "Scene Cards" corkboard (author request, 2026-09-11):
// short synopsis/note index cards a writer can type on and drag around --
// between chapters (a sidebar list mirrors the real manuscript order via
// listChapters() in lib/actions/manuscript.ts) or leave in an
// "Unassigned" pool, and reorder within a chapter.
//
// Drag-and-drop here is a genuinely different shape from Binder.tsx's:
// that one only ever reorders siblings under the SAME parent. A scene
// card can move BETWEEN chapter sections, so this uses @dnd-kit's
// multiple-containers pattern -- every card and every section's empty
// dropzone carries a `containerId` in its drag data (the destination
// chapter's node id, or the sentinel "unassigned"), and onDragEnd reads
// that straight off `over.data.current` rather than trying to infer it
// from ids alone.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  createSceneCard,
  deleteSceneCard,
  reorderSceneCards,
  updateSceneCard,
} from "@/lib/actions/scene-cards";

export interface SceneCardRow {
  id: string;
  projectId: string;
  chapterNodeId: string | null;
  title: string;
  synopsis: string | null;
  orderIndex: number;
  colorTag: string | null;
}

export interface ChapterListItem {
  id: string;
  parentId: string | null;
  type: "PART" | "CHAPTER";
  title: string;
  orderIndex: number;
}

const UNASSIGNED = "unassigned";
const SAVE_DELAY_MS = 700;

const COLOR_TAGS = ["#fda4af", "#fcd34d", "#bef264", "#7dd3fc", "#c4b5fd", "#fdba74"];

function containerKey(chapterNodeId: string | null): string {
  return chapterNodeId ?? UNASSIGNED;
}

interface ChapterGroup {
  partTitle: string | null;
  chapters: ChapterListItem[];
}

// Groups the flat chapter list the same order the binder shows: top-level
// items (chapters and parts) in orderIndex order, a part's own chapters
// nested under it in their orderIndex order. Only two levels deep --
// parts don't nest -- so this doesn't need the general buildTree().
function groupChapters(nodes: ChapterListItem[]): ChapterGroup[] {
  const byParent = new Map<string | null, ChapterListItem[]>();
  for (const n of nodes) {
    const list = byParent.get(n.parentId) ?? [];
    list.push(n);
    byParent.set(n.parentId, list);
  }
  for (const list of byParent.values()) list.sort((a, b) => a.orderIndex - b.orderIndex);

  const roots = (byParent.get(null) ?? []).slice().sort((a, b) => a.orderIndex - b.orderIndex);
  const groups: ChapterGroup[] = [];
  for (const root of roots) {
    if (root.type === "CHAPTER") {
      groups.push({ partTitle: null, chapters: [root] });
    } else {
      const children = (byParent.get(root.id) ?? []).filter((c) => c.type === "CHAPTER");
      if (children.length > 0) groups.push({ partTitle: root.title || "Part", chapters: children });
    }
  }
  return groups;
}

export function SceneCardsPanel({
  projectId,
  initialChapters,
  initialSceneCards,
}: {
  projectId: string;
  initialChapters: ChapterListItem[];
  initialSceneCards: SceneCardRow[];
}) {
  const [cards, setCards] = useState<SceneCardRow[]>(initialSceneCards);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const sectionRefs = useRef(new Map<string, HTMLDivElement>());

  const chapterGroups = useMemo(() => groupChapters(initialChapters), [initialChapters]);
  const chapterTitleById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of initialChapters) if (c.type === "CHAPTER") m.set(c.id, c.title || "Untitled chapter");
    return m;
  }, [initialChapters]);

  function cardsFor(key: string): SceneCardRow[] {
    return cards
      .filter((c) => containerKey(c.chapterNodeId) === key)
      .sort((a, b) => a.orderIndex - b.orderIndex);
  }

  async function handleCreate(chapterNodeId: string | null) {
    const created = await createSceneCard({ projectId, chapterNodeId, title: "New card" });
    setCards((prev) => [...prev, created as SceneCardRow]);
  }

  function handleUpdate(id: string, patch: Partial<Pick<SceneCardRow, "title" | "synopsis" | "colorTag">>) {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  function handleDelete(id: string) {
    setCards((prev) => prev.filter((c) => c.id !== id));
    deleteSceneCard(id, projectId).catch(() => {});
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeData = active.data.current as { containerId: string } | undefined;
    const overData = over.data.current as { type: "card" | "container"; containerId: string } | undefined;
    if (!activeData || !overData) return;

    const destKey = overData.containerId;
    const destChapterNodeId = destKey === UNASSIGNED ? null : destKey;

    const destCards = cardsFor(destKey).filter((c) => c.id !== active.id);
    let destIndex = destCards.length;
    if (overData.type === "card") {
      const idx = destCards.findIndex((c) => c.id === over.id);
      if (idx !== -1) destIndex = idx;
    }

    const moving = cards.find((c) => c.id === active.id);
    if (!moving) return;
    destCards.splice(destIndex, 0, { ...moving, chapterNodeId: destChapterNodeId });

    const reindexed = destCards.map((c, i) => ({ ...c, orderIndex: i }));
    const reindexedById = new Map(reindexed.map((c) => [c.id, c]));

    setCards((prev) => prev.map((c) => reindexedById.get(c.id) ?? c));

    reorderSceneCards(
      projectId,
      reindexed.map((c) => ({ id: c.id, chapterNodeId: c.chapterNodeId, orderIndex: c.orderIndex }))
    ).catch(() => {});
  }

  function scrollToSection(key: string) {
    sectionRefs.current.get(key)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[220px_1fr]">
      <aside className="min-h-0 overflow-y-auto border-r border-border bg-secondary/25 p-3">
        <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
          Chapters
        </p>
        <ul className="space-y-0.5">
          {chapterGroups.map((group, gi) => (
            <li key={gi}>
              {group.partTitle && (
                <p className="mt-2 px-1 text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground/70">
                  {group.partTitle}
                </p>
              )}
              <ul>
                {group.chapters.map((ch) => (
                  <li key={ch.id}>
                    <button
                      type="button"
                      onClick={() => scrollToSection(ch.id)}
                      className="flex w-full items-center justify-between gap-2 truncate rounded px-2 py-1.5 text-left text-sm text-foreground/90 hover:bg-background/80"
                    >
                      <span className="truncate">{ch.title || "Untitled chapter"}</span>
                      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                        {cardsFor(ch.id).length || ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
          <li className="mt-2 border-t border-border/60 pt-2">
            <button
              type="button"
              onClick={() => scrollToSection(UNASSIGNED)}
              className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-background/80"
            >
              Unassigned
              <span className="shrink-0 font-mono text-[10px]">{cardsFor(UNASSIGNED).length || ""}</span>
            </button>
          </li>
        </ul>
      </aside>

      <div className="min-h-0 overflow-y-auto bg-muted/20 px-6 py-6">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <div className="mx-auto flex max-w-4xl flex-col gap-8">
            {chapterGroups.flatMap((group) => group.chapters).map((ch) => (
              <CorkboardSection
                key={ch.id}
                sectionRef={(el) => {
                  if (el) sectionRefs.current.set(ch.id, el);
                }}
                title={chapterTitleById.get(ch.id) ?? "Untitled chapter"}
                containerKey={ch.id}
                cards={cardsFor(ch.id)}
                onCreate={() => handleCreate(ch.id)}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
              />
            ))}

            <CorkboardSection
              sectionRef={(el) => {
                if (el) sectionRefs.current.set(UNASSIGNED, el);
              }}
              title="Unassigned"
              subtitle="Not yet placed in a chapter"
              containerKey={UNASSIGNED}
              cards={cardsFor(UNASSIGNED)}
              onCreate={() => handleCreate(null)}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
            />
          </div>
        </DndContext>
      </div>
    </div>
  );
}

function CorkboardSection({
  sectionRef,
  title,
  subtitle,
  containerKey: key,
  cards,
  onCreate,
  onUpdate,
  onDelete,
}: {
  sectionRef: (el: HTMLDivElement | null) => void;
  title: string;
  subtitle?: string;
  containerKey: string;
  cards: SceneCardRow[];
  onCreate: () => void;
  onUpdate: (id: string, patch: Partial<Pick<SceneCardRow, "title" | "synopsis" | "colorTag">>) => void;
  onDelete: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `dropzone:${key}`, data: { type: "container", containerId: key } });

  return (
    <section ref={sectionRef}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-display text-lg italic">{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <button
          type="button"
          onClick={onCreate}
          className="flex shrink-0 items-center gap-1 rounded-full border border-dashed border-primary/40 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/5"
        >
          <Plus className="size-3.5" /> New card
        </button>
      </div>

      <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={cn(
            "flex min-h-[64px] flex-wrap gap-3 rounded-lg border border-dashed p-2 transition-colors",
            isOver ? "border-primary/50 bg-primary/5" : "border-border/50"
          )}
        >
          {cards.length === 0 ? (
            <p className="flex flex-1 items-center justify-center px-3 py-4 text-center text-xs text-muted-foreground">
              No cards here yet -- drag one in, or add a new one.
            </p>
          ) : (
            cards.map((card) => (
              <SceneCardTile key={card.id} card={card} containerId={key} onUpdate={onUpdate} onDelete={onDelete} />
            ))
          )}
        </div>
      </SortableContext>
    </section>
  );
}

function SceneCardTile({
  card,
  containerId,
  onUpdate,
  onDelete,
}: {
  card: SceneCardRow;
  containerId: string;
  onUpdate: (id: string, patch: Partial<Pick<SceneCardRow, "title" | "synopsis" | "colorTag">>) => void;
  onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { type: "card", containerId },
  });
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef(card);
  useEffect(() => {
    latestRef.current = card;
  }, [card]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  function scheduleSave() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const c = latestRef.current;
      updateSceneCard(c.id, c.projectId, {
        title: c.title,
        synopsis: c.synopsis,
        colorTag: c.colorTag,
      }).catch(() => {});
    }, SAVE_DELAY_MS);
  }

  function set(patch: Partial<Pick<SceneCardRow, "title" | "synopsis" | "colorTag">>) {
    onUpdate(card.id, patch);
    scheduleSave();
  }

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, borderTopColor: card.colorTag ?? undefined }}
      className={cn(
        "group flex w-56 shrink-0 flex-col gap-1.5 rounded-lg border border-b border-l border-r border-border bg-card p-3 shadow-sm",
        "border-t-4"
      )}
    >
      <div className="flex items-start gap-1">
        <button
          type="button"
          className="mt-0.5 shrink-0 cursor-grab touch-none text-muted-foreground opacity-0 group-hover:opacity-100"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-3.5" />
        </button>
        <input
          value={card.title}
          onChange={(e) => set({ title: e.target.value })}
          placeholder="Card title"
          className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-muted-foreground"
        />
        <button
          type="button"
          onClick={() => onDelete(card.id)}
          className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
      <textarea
        value={card.synopsis ?? ""}
        onChange={(e) => set({ synopsis: e.target.value })}
        placeholder="What happens in this scene?"
        rows={4}
        className="min-h-[70px] flex-1 resize-none bg-transparent text-xs leading-relaxed text-foreground/90 outline-none placeholder:text-muted-foreground"
      />
      <div className="flex items-center gap-1 pt-1">
        {COLOR_TAGS.map((hex) => (
          <button
            key={hex}
            type="button"
            onClick={() => set({ colorTag: card.colorTag === hex ? null : hex })}
            className={cn(
              "size-3 shrink-0 rounded-full border",
              card.colorTag === hex ? "border-foreground" : "border-transparent"
            )}
            style={{ backgroundColor: hex }}
          />
        ))}
      </div>
    </div>
  );
}
