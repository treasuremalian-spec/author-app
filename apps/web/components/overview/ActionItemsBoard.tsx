"use client";

import { useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Trash2 } from "lucide-react";

import {
  createActionItem,
  deleteActionItem,
  reorderActionItems,
  updateActionItem,
  type ActionItemRow,
  type ActionItemStatus,
} from "@/lib/actions/overview";
import { cn } from "@/lib/utils";

const COLUMNS: { id: ActionItemStatus; label: string; accent: string }[] = [
  { id: "NO_STATUS", label: "No status", accent: "bg-muted-foreground" },
  { id: "IN_PROGRESS", label: "In progress", accent: "bg-primary" },
  { id: "COMPLETED", label: "Completed", accent: "bg-success" },
  { id: "BACKBURNER", label: "On the backburner", accent: "bg-accent" },
  { id: "STUCK", label: "Stuck", accent: "bg-destructive" },
];

export function ActionItemsBoard({
  projectId,
  initialItems,
}: {
  projectId: string;
  initialItems: ActionItemRow[];
}) {
  const [items, setItems] = useState<ActionItemRow[]>(initialItems);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function columnItems(status: ActionItemStatus) {
    return items.filter((i) => i.status === status).sort((a, b) => a.orderIndex - b.orderIndex);
  }

  async function handleCreate(status: ActionItemStatus) {
    const created = await createActionItem(projectId, "New item");
    setItems((prev) => [...prev, { ...created, status }]);
    if (status !== "NO_STATUS") {
      const targetCount = items.filter((i) => i.status === status).length;
      reorderActionItems(projectId, [{ id: created.id, status, orderIndex: targetCount }]).catch(() => {});
    }
  }

  function handleTitleChange(id: string, title: string) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, title } : i)));
    updateActionItem(id, projectId, { title }).catch(() => {});
  }

  function handleDelete(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    deleteActionItem(id, projectId).catch(() => {});
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeItem = items.find((i) => i.id === active.id);
    if (!activeItem) return;

    let targetStatus: ActionItemStatus;
    let targetId: string | null = null;

    const overIdStr = String(over.id);
    if (overIdStr.startsWith("column-")) {
      targetStatus = overIdStr.replace("column-", "") as ActionItemStatus;
    } else {
      const overItem = items.find((i) => i.id === over.id);
      if (!overItem) return;
      targetStatus = overItem.status;
      targetId = overItem.id;
    }

    const sourceStatus = activeItem.status;
    const sourceList = columnItems(sourceStatus).filter((i) => i.id !== activeItem.id);
    const targetList =
      sourceStatus === targetStatus ? sourceList : columnItems(targetStatus);

    let insertAt = targetList.length;
    if (targetId) {
      const idx = targetList.findIndex((i) => i.id === targetId);
      if (idx !== -1) insertAt = idx;
    }
    targetList.splice(insertAt, 0, { ...activeItem, status: targetStatus });

    const updates: { id: string; status: ActionItemStatus; orderIndex: number }[] = targetList.map(
      (i, idx) => ({ id: i.id, status: targetStatus, orderIndex: idx })
    );
    if (sourceStatus !== targetStatus) {
      sourceList.forEach((i, idx) => updates.push({ id: i.id, status: sourceStatus, orderIndex: idx }));
    }

    setItems((prev) =>
      prev.map((i) => {
        const u = updates.find((x) => x.id === i.id);
        return u ? { ...i, status: u.status, orderIndex: u.orderIndex } : i;
      })
    );
    reorderActionItems(projectId, updates).catch(() => {});
  }

  return (
    <div>
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Action items
      </p>
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {COLUMNS.map((col) => (
            <Column
              key={col.id}
              status={col.id}
              label={col.label}
              accent={col.accent}
              items={columnItems(col.id)}
              onAdd={() => handleCreate(col.id)}
              onTitleChange={handleTitleChange}
              onDelete={handleDelete}
            />
          ))}
        </div>
      </DndContext>
    </div>
  );
}

function Column({
  status,
  label,
  accent,
  items,
  onAdd,
  onTitleChange,
  onDelete,
}: {
  status: ActionItemStatus;
  label: string;
  accent: string;
  items: ActionItemRow[];
  onAdd: () => void;
  onTitleChange: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `column-${status}` });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-[10rem] flex-col gap-2 rounded-xl border border-border bg-secondary/20 p-2.5 transition-colors",
        isOver && "bg-primary/10 ring-1 ring-primary/30"
      )}
    >
      <div className="flex items-center justify-between px-0.5">
        <div className="flex items-center gap-1.5">
          <span className={cn("size-1.5 rounded-full", accent)} />
          <p className="text-xs font-semibold text-muted-foreground">{label}</p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-primary"
        >
          <Plus className="size-3.5" />
        </button>
      </div>

      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-1.5">
          {items.map((item) => (
            <ActionCard key={item.id} item={item} onTitleChange={onTitleChange} onDelete={onDelete} />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

function ActionCard({
  item,
  onTitleChange,
  onDelete,
}: {
  item: ActionItemRow;
  onTitleChange: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.title);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  function commit() {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== item.title) onTitleChange(item.id, trimmed);
    else setDraft(item.title);
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group flex items-start gap-1 rounded-lg border border-border bg-card px-2 py-1.5 text-sm shadow-sm"
    >
      <button
        type="button"
        className="mt-0.5 shrink-0 cursor-grab touch-none text-muted-foreground opacity-0 group-hover:opacity-100"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-3.5" />
      </button>

      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setDraft(item.title);
              setEditing(false);
            }
          }}
          className="min-w-0 flex-1 rounded border border-input bg-background px-1 py-0.5 text-sm outline-none"
        />
      ) : (
        <button
          type="button"
          onDoubleClick={() => setEditing(true)}
          className="min-w-0 flex-1 break-words text-left"
        >
          {item.title}
        </button>
      )}

      <button
        type="button"
        onClick={() => onDelete(item.id)}
        className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}
