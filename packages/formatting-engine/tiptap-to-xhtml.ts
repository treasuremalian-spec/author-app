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

/** Passed down through rendering when a block type needs something an export
 * pipeline can only provide, not this renderer-agnostic file -- currently
 * just image resolution (see the "manuscriptImage" case below). print-html.ts
 * and build-epub.ts each build their own resolveImage: print embeds a data:
 * URI (a single in-memory HTML string has nowhere else to point), EPUB
 * returns a relative path to a file it has zipped into the book, assigning
 * one the first time a given URL is seen and deduping repeats. Returning
 * null/undefined means "couldn't resolve this image" (a fetch failed during
 * export, or the caller didn't supply resolveImage at all) -- callers should
 * fail soft, same as the existing cover-image loading in export-data.ts. */
export interface RenderContext {
  resolveImage?: (src: string) => string | null | undefined;
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

function renderBlock(node: DocNode, ctx?: RenderContext): string {
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
      return `<ul>${(node.content ?? []).map((c) => renderBlock(c, ctx)).join("")}</ul>`;
    case "orderedList":
      return `<ol>${(node.content ?? []).map((c) => renderBlock(c, ctx)).join("")}</ol>`;
    case "listItem":
      return `<li>${(node.content ?? []).map((c) => renderBlock(c, ctx)).join("")}</li>`;
    case "blockquote":
      return `<blockquote>${(node.content ?? []).map((c) => renderBlock(c, ctx)).join("")}</blockquote>`;
    case "codeBlock": {
      const text = (node.content ?? []).map((c) => c.text ?? "").join("");
      return `<pre><code>${escapeXml(text)}</code></pre>`;
    }
    case "horizontalRule":
      return `<hr/>`;
    case "pageBreak":
      // A writer-inserted manual page break (see
      // apps/web/components/manuscript/extensions/page-break.ts). Renders
      // as an empty marker div -- print-html.ts and build-epub.ts each
      // turn it into a real forced break via CSS on ".manual-page-break"
      // in their own stylesheets, so this file only has to emit the
      // marker, not know how either export pipeline paginates.
      return `<div class="manual-page-break"></div>`;
    case "sceneBreak": {
      // A writer-inserted, ornament-choosable scene break (see
      // apps/web/components/manuscript/extensions/scene-break.ts).
      // Deliberately rendered with the SAME ".scene-break" class the
      // export pipeline's own automatic between-scenes divider already
      // uses (see sceneHtml() in print-html.ts and chapterPageHtml() in
      // build-epub.ts) -- a manual break should look like the same kind
      // of thing as an automatic one, just with the writer's chosen
      // glyph instead of the hardcoded default.
      const ornament = typeof node.attrs?.ornament === "string" ? node.attrs.ornament : "\u2042";
      return `<p class="scene-break">${escapeXml(ornament)}</p>`;
    }
    case "textMessage": {
      // A "text conversation" bubble (see
      // apps/web/components/manuscript/extensions/text-message.ts) --
      // written and edited like a normal paragraph, positioned
      // left/center/right via the SAME textAlign attribute a normal
      // paragraph uses. Rendered with an explicit "text-message--<side>"
      // class (not textAlignStyle()'s inline style="text-align:...") --
      // print-html.ts and build-epub.ts each position it with a
      // `display: table` + margin rule keyed off that class, since a
      // content-width "bubble" needs its own BOX moved left/right/center,
      // which margin can do and text-align (an inline-content property,
      // not a box-position one) cannot.
      const inner = renderInline(node.content);
      const align = node.attrs?.textAlign === "center" || node.attrs?.textAlign === "right" ? node.attrs.textAlign : "left";
      return `<p class="text-message text-message--${align}">${inner || "&#160;"}</p>`;
    }
    case "manuscriptImage": {
      // A writer-inserted inline image (see
      // apps/web/components/manuscript/extensions/manuscript-image.ts),
      // one of three display modes the writer picks per image: "header"
      // (a modest centered image, styled to sit under a chapter title),
      // "spread" (a full dedicated page, print-html.ts forces a break
      // before/after it), or "caption" (an inline photo with an optional
      // caption line -- the default). ctx.resolveImage turns the node's
      // stored Supabase Storage URL into whatever each export pipeline
      // actually needs to embed (see RenderContext above); a miss (no ctx,
      // or that URL's bytes couldn't be fetched at export time) fails soft
      // by dropping the ENTIRE figure -- image and caption both -- rather
      // than shipping a broken image reference or (worse) a caption
      // floating with no photo above it, which would look like a bug to
      // a reader rather than a missing-image edge case.
      const src = typeof node.attrs?.src === "string" ? node.attrs.src : "";
      const mode = node.attrs?.displayMode === "header" || node.attrs?.displayMode === "spread" ? node.attrs.displayMode : "caption";
      const alt = typeof node.attrs?.alt === "string" ? node.attrs.alt : "";
      const captionText = typeof node.attrs?.caption === "string" ? node.attrs.caption.trim() : "";
      const resolvedSrc = src && ctx?.resolveImage ? ctx.resolveImage(src) : null;
      if (!resolvedSrc) return "";
      const imgHtml = `<img class="manuscript-image" src="${escapeXml(resolvedSrc)}" alt="${escapeXml(alt)}"/>`;
      const captionHtml = mode === "caption" && captionText ? `<figcaption>${escapeXml(captionText)}</figcaption>` : "";
      return `<figure class="manuscript-image-figure manuscript-image-figure--${mode}">${imgHtml}${captionHtml}</figure>`;
    }
    default:
      // Unknown block type -- render its children as paragraphs rather
      // than silently dropping content.
      return (node.content ?? []).map((c) => renderBlock(c, ctx)).join("");
  }
}

/** Render a Scene's Tiptap document to a string of XHTML block elements. */
export function sceneContentToXhtml(doc: unknown, ctx?: RenderContext): string {
  const root = doc as DocNode | null | undefined;
  if (!root || !Array.isArray(root.content)) return "";
  return root.content.map((node) => renderBlock(node, ctx)).join("\n");
}

/** Every image URL a Scene's Tiptap document references (via a
 * "manuscriptImage" node's "src" attribute), in document order, duplicates
 * included -- callers dedupe as needed. Used by export-data.ts to know
 * which images to fetch bytes for before building either export format;
 * kept here rather than in export-data.ts since it's the same document-tree
 * walk sceneContentToXhtml already does, just collecting instead of
 * rendering. */
export function collectImageUrls(doc: unknown): string[] {
  const root = doc as DocNode | null | undefined;
  if (!root || !Array.isArray(root.content)) return [];
  const urls: string[] = [];
  const walk = (node: DocNode) => {
    if (node.type === "manuscriptImage" && typeof node.attrs?.src === "string" && node.attrs.src) {
      urls.push(node.attrs.src);
    }
    (node.content ?? []).forEach(walk);
  };
  root.content.forEach(walk);
  return urls;
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
