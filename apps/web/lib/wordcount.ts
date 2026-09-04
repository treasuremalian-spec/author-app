// Shared word-counting logic. Scenes store their text as Tiptap/ProseMirror
// JSON (a nested document, not plain text), so counting words means walking
// the tree and pulling out every text node.

type DocNode = {
  type?: string;
  text?: string;
  content?: DocNode[];
};

function extractText(node: DocNode | null | undefined): string {
  if (!node) return "";
  let text = node.text ?? "";
  if (node.content) {
    for (const child of node.content) {
      text += " " + extractText(child);
    }
  }
  return text;
}

export function countWords(doc: unknown): number {
  const text = extractText(doc as DocNode).trim();
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

// A brand-new, empty Tiptap document -- what a freshly created scene starts with.
export const EMPTY_DOC = { type: "doc", content: [{ type: "paragraph" }] };
