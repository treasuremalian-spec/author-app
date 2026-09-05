// Converts a Tiptap/ProseMirror document (the JSON every Scene stores) into
// XHTML for an EPUB chapter. Hand-written against the exact node/mark
// vocabulary the editor actually exposes (StarterKit + Underline +
// TextAlign -- see apps/web/components/manuscript/Toolbar.tsx) rather than
// pulling in a DOM-dependent renderer, matching the project's existing
// pattern of walking the JSON directly (see apps/web/lib/wordcount.ts).

export interface DocNode {
  type?: string;
  attrs?: Record<string, unknown>;
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  content?: DocNode[];
}

export function escapeXml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function textAlignStyle(attrs: Record<string, unknown> | undefined): string {
  const align = attrs?.textAlign;
  if (align === "center" || align === "right" || align === "justify") {
    return ` style="text-align: ${align};"`;
  }
  return "";
}

const MARK_TAGS: Record<string, string> = {
  bold: "strong",
  italic: "em",
  underline: "u",
  strike: "s",
  code: "code",
};

function renderMarks(text: string, marks: DocNode["marks"]): string {
  if (!marks || marks.length === 0) return text;
  // Apply innermost-first so nesting order is stable regardless of the
  // order Tiptap recorded the marks in.
  return marks.reduce((inner, mark) => {
    const tag = MARK_TAGS[mark.type];
    if (!tag) return inner;
    return `<${tag}>${inner}</${tag}>`;
  }, text);
}

function renderInline(nodes: DocNode[] | undefined): string {
  if (!nodes) return "";
  return nodes
    .map((node) => {
      if (node.type === "text") {
        return renderMarks(escapeXml(node.text ?? ""), node.marks);
      }
      if (node.type === "hardBreak") return "<br/>";
      // Unknown inline node -- fall back to its text content, if any.
      return renderInline(node.content);
    })
    .join("");
}

function renderBlock(node: DocNode): string {
  switch (node.type) {
    case "paragraph": {
      const inner = renderInline(node.content);
      // An empty paragraph (just a blank line the writer left) still needs
      // to take up space in the flow -- render a non-breaking space.
      return `<p${textAlignStyle(node.attrs)}>${inner || "&#160;"}</p>`;
    }
    case "heading": {
      // Shift every in-scene heading down one level -- the chapter's own
      // title is the only true <h1> on the page, so a writer's "Heading 1"
      // inside a scene becomes an <h2>, "Heading 2" becomes an <h3>, etc.
      const level = Math.min(6, Math.max(1, Number(node.attrs?.level) || 2) + 1);
      const inner = renderInline(node.content);
      return `<h${level}${textAlignStyle(node.attrs)}>${inner}</h${level}>`;
    }
    case "bulletList":
      return `<ul>${(node.content ?? []).map(renderBlock).join("")}</ul>`;
    case "orderedList":
      return `<ol>${(node.content ?? []).map(renderBlock).join("")}</ol>`;
    case "listItem":
      return `<li>${(node.content ?? []).map(renderBlock).join("")}</li>`;
    case "blockquote":
      return `<blockquote>${(node.content ?? []).map(renderBlock).join("")}</blockquote>`;
    case "codeBlock": {
      const text = (node.content ?? []).map((c) => c.text ?? "").join("");
      return `<pre><code>${escapeXml(text)}</code></pre>`;
    }
    case "horizontalRule":
      return `<hr/>`;
    default:
      // Unknown block type -- render its children as paragraphs rather
      // than silently dropping content.
      return (node.content ?? []).map(renderBlock).join("");
  }
}

/** Render a Scene's Tiptap document to a string of XHTML block elements. */
export function sceneContentToXhtml(doc: unknown): string {
  const root = doc as DocNode | null | undefined;
  if (!root || !Array.isArray(root.content)) return "";
  return root.content.map(renderBlock).join("\n");
}

/** True if a scene's document has no real text in it (a blank/new scene). */
export function isSceneContentEmpty(doc: unknown): boolean {
  const root = doc as DocNode | null | undefined;
  if (!root || !Array.isArray(root.content)) return true;
  const hasText = (node: DocNode): boolean => {
    if (node.type === "text" && (node.text ?? "").trim()) return true;
    return (node.content ?? []).some(hasText);
  };
  return !root.content.some(hasText);
}
