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
  Search,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  buildTree,
  childTypeAllowed,
  totalWordCount,
  CONVERT_TO_PAGE_TYPES,
  PAGE_TYPE_LABELS,
  type ManuscriptNodeData,
  type NodeType,
  type PageType,
  type TreeNode,
} from "@/lib/manuscript-tree";
import type { SearchMatch } from "@/lib/manuscript-search";
import { BookSearchPanel } from "./BookSearchPanel";

export interface BinderHandlers {
  onSelect: (id: string) => void;
  onAddNode: (parentId: string | null, type: NodeType) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onReorder: (updates: { id: string; parentId: string | null; orderIndex: number }[]) => void;
  onIndent: (id: string) => void;
  onOutdent: (id: string) => void;
  onMove: (id: string, direction: "up" | "down") => void;
  // Per-chapter "Convert To" page type + related formatting options
  // (2026-09-11, Phase 16) -- all four only meaningful on CHAPTER nodes.
  onConvertPageType: (id: string, pageType: PageType) => void;
  onSetNumbered: (id: string, numbered: boolean) => void;
  onSetChapterAuthor: (id: string, chapterAuthor: string | null) => void;
  onSetShowHeadingOverride: (id: string, showHeadingOverride: boolean | null) => void;
  onClearTitle: (id: string) => void;
  // Book-wide search (2026-09-11) -- see BookSearchPanel.tsx. Jumping to a
  // match may select a DIFFERENT chapter than whatever's open right now;
  // a single "Replace" click acts on whichever chapter that match is in,
  // same reasoning.
  onJumpToMatch: (nodeId: string, match: SearchMatch) => void;
  onReplaceOne: (nodeId: string, match: SearchMatch, replacement: string) => void;
}

interface BinderProps extends BinderHandlers {
  projectId: string;
  nodes: ManuscriptNodeData[];
  selectedNodeId: string | null;
  totalWords: number;
}

const ICONS: Record<NodeType, React.ElementType> = {
  PART: Folder,
  CHAPTER: BookOpen,
  SCENE: FileText,
};

const ICON_COLOR: Record<NodeType, string> = {
  PART: "text-accent-foreground",
  CHAPTER: "text-primary",
  SCENE: "text-muted-foreground",
};

export function Binder({ projectId, nodes, selectedNodeId, totalWords, ...handlers }: BinderProps) {
  const [searchOpen, setSearchOpen] = useState(false);
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
      <div className="flex items-center justify-between px-3 py-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
            Manuscript
          </p>
          <p className="text-[11px] text-muted-foreground/80">
            {totalWords.toLocaleString()} words total
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            title="Search the book"
            aria-label="Search the book"
            onClick={() => setSearchOpen((v) => !v)}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-background hover:text-foreground",
              searchOpen && "bg-background text-foreground"
            )}
          >
            <Search className="size-3.5" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-transform hover:scale-105"
              >
                <Plus className="size-4" />
              </button>
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
      </div>

      {searchOpen && (
        <BookSearchPanel
          projectId={projectId}
          nodes={nodes}
          onClose={() => setSearchOpen(false)}
          onJumpToMatch={handlers.onJumpToMatch}
          onReplaceOne={handlers.onReplaceOne}
        />
      )}

      <div className="flex-1 overflow-y-auto px-2 py-2 border-t border-border/60">
        {tree.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-3 py-10 text-center">
            <div className="flex size-9 items-center justify-center border border-border text-foreground">
              <BookOpen className="size-4" />
            </div>
            <p className="text-sm text-muted-foreground">
              Nothing here yet -- use the + above to add your first part or chapter.
            </p>
          </div>
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
  const [editingAuthor, setEditingAuthor] = useState(false);
  const [draftAuthor, setDraftAuthor] = useState(node.chapterAuthor ?? "");

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

  function commitAuthor() {
    const trimmed = draftAuthor.trim();
    setEditingAuthor(false);
    if (trimmed !== (node.chapterAuthor ?? "")) {
      handlers.onSetChapterAuthor(node.id, trimmed || null);
    }
  }

  return (
    <li ref={setNodeRef} style={style}>
      <div
        className={cn(
          "group flex items-center gap-1 rounded-lg border-l-2 px-1 py-1.5 text-sm transition-colors",
          isSelected
            ? "border-primary bg-primary/15 font-medium text-primary"
            : "border-transparent hover:bg-background/80"
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

        <Icon className={cn("size-3.5 shrink-0", isSelected ? "text-primary" : ICON_COLOR[node.type])} />

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
            onClick={() => (node.scene ? handlers.onSelect(node.id) : setExpanded((e) => !e))}
            onDoubleClick={() => setEditing(true)}
            className="min-w-0 flex-1 truncate text-left"
            title={node.title}
          >
            {node.title}
          </button>
        )}

        {node.type === "CHAPTER" && node.pageType !== "CHAPTER" && (
          <span className="shrink-0 truncate rounded-full bg-accent/40 px-1.5 py-0.5 text-[10px] font-medium text-accent-foreground">
            {PAGE_TYPE_LABELS[node.pageType]}
          </span>
        )}

        {node.scene && (
          <span className="shrink-0 rounded-full bg-background px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
            {words}
          </span>
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

            {node.type === "CHAPTER" && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Convert to</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {CONVERT_TO_PAGE_TYPES.map((pt) => (
                      <DropdownMenuCheckboxItem
                        key={pt}
                        checked={node.pageType === pt}
                        onCheckedChange={() => handlers.onConvertPageType(node.id, pt)}
                      >
                        {PAGE_TYPE_LABELS[pt]}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                {node.pageType === "CHAPTER" && (
                  <DropdownMenuCheckboxItem
                    checked={node.numbered}
                    onCheckedChange={(value) => handlers.onSetNumbered(node.id, value === true)}
                  >
                    Numbered
                  </DropdownMenuCheckboxItem>
                )}
                <DropdownMenuItem
                  onSelect={() => {
                    setDraftAuthor(node.chapterAuthor ?? "");
                    setEditingAuthor(true);
                  }}
                >
                  {node.chapterAuthor ? "Edit Chapter Author" : "Add Chapter Author"}
                </DropdownMenuItem>
                {node.chapterAuthor && (
                  <DropdownMenuItem onSelect={() => handlers.onSetChapterAuthor(node.id, null)}>
                    Remove Chapter Author
                  </DropdownMenuItem>
                )}
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Show heading in book</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuCheckboxItem
                      checked={node.showHeadingOverride == null}
                      onCheckedChange={() => handlers.onSetShowHeadingOverride(node.id, null)}
                    >
                      Follow book setting
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem
                      checked={node.showHeadingOverride === true}
                      onCheckedChange={() => handlers.onSetShowHeadingOverride(node.id, true)}
                    >
                      Always show
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem
                      checked={node.showHeadingOverride === false}
                      onCheckedChange={() => handlers.onSetShowHeadingOverride(node.id, false)}
                    >
                      Always hide
                    </DropdownMenuCheckboxItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                {node.title.trim() !== "" && (
                  <DropdownMenuItem onSelect={() => handlers.onClearTitle(node.id)}>
                    Clear Title
                  </DropdownMenuItem>
                )}
              </>
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

      {editingAuthor && (
        <div className="flex items-center gap-1 pb-1" style={{ paddingLeft: depth * 16 + 26 }}>
          <span className="shrink-0 text-[11px] text-muted-foreground">by</span>
          <input
            autoFocus
            value={draftAuthor}
            onChange={(e) => setDraftAuthor(e.target.value)}
            onBlur={commitAuthor}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitAuthor();
              if (e.key === "Escape") {
                setDraftAuthor(node.chapterAuthor ?? "");
                setEditingAuthor(false);
              }
            }}
            placeholder="Chapter author name"
            className="min-w-0 flex-1 rounded border border-input bg-background px-1 py-0.5 text-xs outline-none"
          />
        </div>
      )}

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
