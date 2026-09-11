// Shared shape + helpers for turning the flat list of manuscript nodes (the
// database's self-referential table) into a nested tree the binder can
// render, plus the small bits of math (word counts, tree order) that both
// the binder and the editor need.

// Re-exported from the formatting-engine package (subpath import, same
// reasoning as trim-sizes.ts -- see that file's comment) so the Binder's
// "Convert To" menu and every export renderer share one vocabulary
// instead of two copies drifting apart.
export {
  type PageType,
  PAGE_TYPE_LABELS,
  CONVERT_TO_PAGE_TYPES,
} from "@author-app/formatting-engine/page-types";
import type { PageType } from "@author-app/formatting-engine/page-types";

export type NodeType = "PART" | "CHAPTER" | "SCENE";
export type SceneStatusValue = "PLANNED" | "DRAFTING" | "WRITTEN" | "REVISING" | "COMPLETE";

export interface SceneData {
  id: string;
  content: unknown;
  wordCount: number;
  povCharacterId: string | null;
  locationId: string | null;
  storyDate: string | null;
  status: SceneStatusValue;
  purpose: string | null;
  plotline: string | null;
  notes: string | null;
  targetWordCount: number | null;
  characterIds: string[];
}

export interface ManuscriptNodeData {
  id: string;
  projectId: string;
  parentId: string | null;
  type: NodeType;
  title: string;
  orderIndex: number;
  // "Convert To" page type + related per-chapter options (2026-09-11,
  // Phase 16) -- meaningful only when type === "CHAPTER"; PART/SCENE rows
  // just carry the defaults, unused. See page-types.ts's chapterHeadingLabel()
  // for exactly how these combine into what prints in an exported book.
  pageType: PageType;
  numbered: boolean;
  chapterAuthor: string | null;
  showHeadingOverride: boolean | null;
  scene: SceneData | null;
}

export interface TreeNode extends ManuscriptNodeData {
  children: TreeNode[];
}

export function buildTree(nodes: ManuscriptNodeData[]): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  nodes.forEach((n) => byId.set(n.id, { ...n, children: [] }));

  const roots: TreeNode[] = [];
  byId.forEach((n) => {
    if (n.parentId && byId.has(n.parentId)) {
      byId.get(n.parentId)!.children.push(n);
    } else {
      roots.push(n);
    }
  });

  const sortRec = (list: TreeNode[]) => {
    list.sort((a, b) => a.orderIndex - b.orderIndex);
    list.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);

  return roots;
}

export function totalWordCount(node: TreeNode): number {
  // A node with an attached scene IS the writing surface (true for every
  // SCENE node, and for CHAPTER nodes now that a chapter is the single
  // writing surface -- see childTypeAllowed() below) -- count its own
  // word count rather than recursing into children.
  if (node.scene) return node.scene.wordCount ?? 0;
  return node.children.reduce((sum, c) => sum + totalWordCount(c), 0);
}

export function bookWordCount(roots: TreeNode[]): number {
  return roots.reduce((sum, n) => sum + totalWordCount(n), 0);
}

export function siblingsOf(nodes: ManuscriptNodeData[], parentId: string | null) {
  return nodes
    .filter((n) => n.parentId === parentId)
    .sort((a, b) => a.orderIndex - b.orderIndex);
}

export function childTypeAllowed(parentType: NodeType | null): NodeType[] {
  if (parentType === null) return ["PART", "CHAPTER"];
  if (parentType === "PART") return ["CHAPTER"];
  // A CHAPTER is the writing surface itself now (it carries its own
  // Scene directly, see manuscript.ts's createNode()) -- no more adding
  // a separate SCENE underneath it.
  return [];
}

export const NODE_LABEL: Record<NodeType, string> = {
  PART: "Part",
  CHAPTER: "Chapter",
  SCENE: "Scene",
};

export const STATUS_LABEL: Record<SceneStatusValue, string> = {
  PLANNED: "Planned",
  DRAFTING: "Drafting",
  WRITTEN: "Written",
  REVISING: "Revising",
  COMPLETE: "Complete",
};

export const STATUS_BADGE_VARIANT: Record<
  SceneStatusValue,
  "secondary" | "accent" | "default" | "success"
> = {
  PLANNED: "secondary",
  DRAFTING: "accent",
  WRITTEN: "default",
  REVISING: "accent",
  COMPLETE: "success",
};
