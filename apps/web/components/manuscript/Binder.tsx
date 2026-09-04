"use client";

import { useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  GripVertical,
  MoreHorizontal,
  Plus,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  buildTree,
  childTypeAllowed,
  totalWordCount,
  type ManuscriptNodeData,
  type NodeType,
  type TreeNode,
} from "@/lib/manuscript-tree";

export interface BinderHandlers {
  onSelect: (id: string) => void;
  onAddNode: (parentId: string | null, type: NodeType) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onReorder: (updates: { id: string; parentId: string | null; orderIndex: number }[]) => void;
  onIndent: (id: string) => void;
  onOutdent: (id: string) => void;
  onMove: (id: string, direction: "up" | "down") => void;
}

interface BinderProps extends BinderHandlers {
  nodes: ManuscriptNodeData[];
  selectedNodeId: string | null;
}

const ICONS: Record<NodeType, React.ElementType> = {
  PART: Folder,
  CHAPTER: BookOpen,
  SCENE: FileText,
};

export function Binder({ nodes, selectedNodeId, ...handlers }: BinderProps) {
  const tree = buildTree(nodes);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeNode = nodes.find((n) => n.id === active.id);
    const overNode = nodes.find((n) => n.id === over.id);
    if (!activeNode || !overNode) return;
    if (activeNode.parentId !== overNode.parentId) return; // reparenting via drag not supported yet

    const siblings = nodes
      .filter((n) => n.parentId === activeNode.parentId)
      .sort((a, b) => a.orderIndex - b.orderIndex);

    const oldIndex = siblings.findIndex((n) => n.id === active.id);
    const newIndex = siblings.findIndex((n) => n.id === over.id);
    const reordered = arrayMove(siblings, oldIndex, newIndex);

    handlers.onReorder(
      reordered.map((n, i) => ({ id: n.id, parentId: n.parentId, orderIndex: i }))
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Manuscript
        </p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <Plus className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => handlers.onAddNode(null, "PART")}>
              Add Part
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => handlers.onAddNode(null, "CHAPTER")}>
              Add Chapter
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {tree.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            Nothing here yet -- use the + above to add your first part or chapter.
          </p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <NodeList nodes={tree} depth={0} selectedNodeId={selectedNodeId} handlers={handlers} />
          </DndContext>
        )}
      </div>
    </div>
  );
}

function NodeList({
  nodes,
  depth,
  selectedNodeId,
  handlers,
}: {
  nodes: TreeNode[];
  depth: number;
  selectedNodeId: string | null;
  handlers: BinderHandlers;
}) {
  return (
    <SortableContext items={nodes.map((n) => n.id)} strategy={verticalListSortingStrategy}>
      <ul className="space-y-0.5">
        {nodes.map((node) => (
          <BinderNode
            key={node.id}
            node={node}
            depth={depth}
            selectedNodeId={selectedNodeId}
            handlers={handlers}
          />
        ))}
      </ul>
    </SortableContext>
  );
}

function BinderNode({
  node,
  depth,
  selectedNodeId,
  handlers,
}: {
  node: TreeNode;
  depth: number;
  selectedNodeId: string | null;
  handlers: BinderHandlers;
}) {
  const [expanded, setExpanded] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(node.title);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: node.id,
    data: { parentId: node.parentId },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const Icon = ICONS[node.type];
  const hasChildren = node.children.length > 0;
  const isSelected = node.id === selectedNodeId;
  const words = totalWordCount(node);
  const addableChildren = childTypeAllowed(node.type);

  function commitRename() {
    const trimmed = draftTitle.trim();
    setEditing(false);
    if (trimmed && trimmed !== node.title) {
      handlers.onRename(node.id, trimmed);
    } else {
      setDraftTitle(node.title);
    }
  }

  return (
    <li ref={setNodeRef} style={style}>
      <div
        className={cn(
          "group flex items-center gap-1 rounded-md px-1 py-1 text-sm",
          isSelected ? "bg-primary/10 text-primary" : "hover:bg-muted"
        )}
        style={{ paddingLeft: depth * 16 + 4 }}
      >
        <button
          type="button"
          className="shrink-0 cursor-grab touch-none text-muted-foreground opacity-0 group-hover:opacity-100"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-3.5" />
        </button>

        {hasChildren ? (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="shrink-0 text-muted-foreground"
          >
            {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          </button>
        ) : (
          <span className="w-3.5 shrink-0" />
        )}

        <Icon className="size-3.5 shrink-0 text-muted-foreground" />

        {editing ? (
          <input
            autoFocus
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") {
                setDraftTitle(node.title);
                setEditing(false);
              }
            }}
            className="min-w-0 flex-1 rounded border border-input bg-background px-1 py-0.5 text-sm outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => (node.type === "SCENE" ? handlers.onSelect(node.id) : setExpanded((e) => !e))}
            onDoubleClick={() => setEditing(true)}
            className="min-w-0 flex-1 truncate text-left"
            title={node.title}
          >
            {node.title}
          </button>
        )}

        {node.type === "SCENE" && (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{words}</span>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 hover:bg-muted group-hover:opacity-100"
            >
              <MoreHorizontal className="size-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {addableChildren.map((type) => (
              <DropdownMenuItem key={type} onSelect={() => handlers.onAddNode(node.id, type)}>
                Add {type === "SCENE" ? "Scene" : type === "CHAPTER" ? "Chapter" : "Part"}
              </DropdownMenuItem>
            ))}
            {addableChildren.length > 0 && <DropdownMenuSeparator />}
            <DropdownMenuItem onSelect={() => setEditing(true)}>Rename</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => handlers.onMove(node.id, "up")}>Move up</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => handlers.onMove(node.id, "down")}>Move down</DropdownMenuItem>
            {node.parentId !== null && node.type !== "PART" && (
              <DropdownMenuItem onSelect={() => handlers.onOutdent(node.id)}>Outdent</DropdownMenuItem>
            )}
            {node.type !== "PART" && (
              <DropdownMenuItem onSelect={() => handlers.onIndent(node.id)}>Indent</DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => handlers.onDelete(node.id)}
              className="text-destructive focus:bg-destructive/10"
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {hasChildren && expanded && (
        <NodeList
          nodes={node.children}
          depth={depth + 1}
          selectedNodeId={selectedNodeId}
          handlers={handlers}
        />
      )}
    </li>
  );
}
