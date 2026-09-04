"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Binder } from "./Binder";
import { SceneEditor } from "./SceneEditor";
import { SceneInspector } from "./SceneInspector";
import {
  buildTree,
  bookWordCount,
  childTypeAllowed,
  type ManuscriptNodeData,
  type NodeType,
  type SceneData,
} from "@/lib/manuscript-tree";
import {
  createNode,
  deleteNode,
  renameNode,
  reorderNodes,
} from "@/lib/actions/manuscript";

interface ProjectWorkspaceProps {
  projectId: string;
  projectTitle: string;
  initialNodes: ManuscriptNodeData[];
  characters: { id: string; name: string }[];
}

export function ProjectWorkspace({
  projectId,
  projectTitle,
  initialNodes,
  characters,
}: ProjectWorkspaceProps) {
  const [nodes, setNodes] = useState<ManuscriptNodeData[]>(initialNodes);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    initialNodes.find((n) => n.type === "SCENE")?.id ?? null
  );
  const [refreshToken, setRefreshToken] = useState(0);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;
  const totalWords = bookWordCount(buildTree(nodes));

  function siblingsOf(parentId: string | null) {
    return nodes.filter((n) => n.parentId === parentId).sort((a, b) => a.orderIndex - b.orderIndex);
  }

  async function handleAddNode(parentId: string | null, type: NodeType) {
    const created = await createNode({ projectId, parentId, type });
    setNodes((prev) => [
      ...prev,
      {
        id: created.id,
        projectId,
        parentId: created.parentId,
        type: created.type as NodeType,
        title: created.title,
        orderIndex: created.orderIndex,
        scene: created.scene
          ? {
              id: created.scene.id,
              content: created.scene.content,
              wordCount: created.scene.wordCount,
              povCharacterId: created.scene.povCharacterId,
              locationId: created.scene.locationId,
              storyDate: created.scene.storyDate,
              status: created.scene.status as SceneData["status"],
              purpose: created.scene.purpose,
              plotline: created.scene.plotline,
              notes: created.scene.notes,
              targetWordCount: created.scene.targetWordCount,
              characterIds: created.scene.characterIds,
            }
          : null,
      },
    ]);
    if (type === "SCENE") setSelectedNodeId(created.id);
  }

  function handleRename(id: string, title: string) {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, title } : n)));
    renameNode(id, projectId, title).catch(() => {});
  }

  function collectDescendantIds(id: string, all: ManuscriptNodeData[]): string[] {
    const children = all.filter((n) => n.parentId === id);
    return children.flatMap((c) => [c.id, ...collectDescendantIds(c.id, all)]);
  }

  function handleDelete(id: string) {
    const toRemove = new Set([id, ...collectDescendantIds(id, nodes)]);
    setNodes((prev) => prev.filter((n) => !toRemove.has(n.id)));
    if (selectedNodeId && toRemove.has(selectedNodeId)) setSelectedNodeId(null);
    deleteNode(id, projectId).catch(() => {});
  }

  function handleReorder(updates: { id: string; parentId: string | null; orderIndex: number }[]) {
    setNodes((prev) =>
      prev.map((n) => {
        const u = updates.find((x) => x.id === n.id);
        return u ? { ...n, parentId: u.parentId, orderIndex: u.orderIndex } : n;
      })
    );
    reorderNodes(projectId, updates).catch(() => {});
  }

  function handleMove(id: string, direction: "up" | "down") {
    const node = nodes.find((n) => n.id === id);
    if (!node) return;
    const siblings = siblingsOf(node.parentId);
    const idx = siblings.findIndex((n) => n.id === id);
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= siblings.length) return;

    const reordered = [...siblings];
    [reordered[idx], reordered[targetIdx]] = [reordered[targetIdx], reordered[idx]];
    handleReorder(reordered.map((n, i) => ({ id: n.id, parentId: n.parentId, orderIndex: i })));
  }

  function handleIndent(id: string) {
    const node = nodes.find((n) => n.id === id);
    if (!node) return;
    const siblings = siblingsOf(node.parentId);
    const idx = siblings.findIndex((n) => n.id === id);
    if (idx <= 0) return;
    const newParent = siblings[idx - 1];
    if (!childTypeAllowed(newParent.type).includes(node.type)) return;

    const newParentChildren = nodes.filter((n) => n.parentId === newParent.id);
    const remaining = siblings.filter((n) => n.id !== id).map((n, i) => ({ id: n.id, parentId: n.parentId, orderIndex: i }));

    handleReorder([
      { id: node.id, parentId: newParent.id, orderIndex: newParentChildren.length },
      ...remaining,
    ]);
  }

  function handleOutdent(id: string) {
    const node = nodes.find((n) => n.id === id);
    if (!node || node.parentId === null) return;
    const parent = nodes.find((n) => n.id === node.parentId);
    if (!parent) return;
    const grandparentId = parent.parentId;

    if (!childTypeAllowed(grandparentId ? nodes.find((n) => n.id === grandparentId)?.type ?? null : null).includes(node.type)) {
      return;
    }

    const targetSiblings = siblingsOf(grandparentId);
    const parentIdx = targetSiblings.findIndex((n) => n.id === parent.id);

    const before = targetSiblings.slice(0, parentIdx + 1);
    const after = targetSiblings.slice(parentIdx + 1);

    const updates = [
      ...before.map((n, i) => ({ id: n.id, parentId: n.parentId, orderIndex: i })),
      { id: node.id, parentId: grandparentId, orderIndex: before.length },
      ...after.map((n, i) => ({ id: n.id, parentId: n.parentId, orderIndex: before.length + 1 + i })),
    ];

    const oldSiblings = siblingsOf(node.parentId)
      .filter((n) => n.id !== id)
      .map((n, i) => ({ id: n.id, parentId: n.parentId, orderIndex: i }));

    handleReorder([...updates, ...oldSiblings]);
  }

  function handleWordCountChange(sceneId: string, wordCount: number) {
    setNodes((prev) =>
      prev.map((n) => (n.scene?.id === sceneId ? { ...n, scene: { ...n.scene!, wordCount } } : n))
    );
  }

  function handleMetaChange(sceneId: string, patch: Partial<SceneData>) {
    setNodes((prev) =>
      prev.map((n) => (n.scene?.id === sceneId ? { ...n, scene: { ...n.scene!, ...patch } } : n))
    );
  }

  function handleRestored(sceneId: string, content: unknown, wordCount: number) {
    setNodes((prev) =>
      prev.map((n) => (n.scene?.id === sceneId ? { ...n, scene: { ...n.scene!, content, wordCount } } : n))
    );
    setRefreshToken((t) => t + 1);
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-3 border-b border-border px-4 py-2.5">
        <Link href="/library" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
        </Link>
        <p className="truncate font-display text-sm font-semibold">{projectTitle}</p>
        <span className="ml-auto text-xs text-muted-foreground">
          {totalWords.toLocaleString()} words total
        </span>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[240px_1fr] lg:grid-cols-[260px_1fr_280px]">
        <aside className="min-h-0 border-r border-border">
          <Binder
            nodes={nodes}
            selectedNodeId={selectedNodeId}
            onSelect={setSelectedNodeId}
            onAddNode={handleAddNode}
            onRename={handleRename}
            onDelete={handleDelete}
            onReorder={handleReorder}
            onIndent={handleIndent}
            onOutdent={handleOutdent}
            onMove={handleMove}
          />
        </aside>

        <main className="min-h-0 min-w-0">
          {selectedNode?.scene ? (
            <SceneEditor
              key={`${selectedNode.id}-${refreshToken}`}
              sceneId={selectedNode.scene.id}
              projectId={projectId}
              title={selectedNode.title}
              initialContent={selectedNode.scene.content}
              onWordCountChange={handleWordCountChange}
            />
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
              Select a scene from the left, or add a new one, to start writing.
            </div>
          )}
        </main>

        <aside className="hidden min-h-0 border-l border-border lg:block">
          {selectedNode?.scene && (
            <SceneInspector
              key={selectedNode.scene.id}
              sceneId={selectedNode.scene.id}
              projectId={projectId}
              scene={selectedNode.scene}
              characters={characters}
              onMetaChange={handleMetaChange}
              onRestored={handleRestored}
            />
          )}
        </aside>
      </div>
    </div>
  );
}
