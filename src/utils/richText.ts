/**
 * Bridge between the long description's storage format (sanitized HTML, rendered by the
 * dashboard and the consumer app) and this app's plain multiline editor.
 *
 * The backend converts plain text to HTML on write (backend shared/sanitize/rich-text.ts
 * `plainTextToHtml`: paragraphs → <p>, single newlines → <br>, "• " lines → <ul><li>).
 * `htmlToEditableText` is its inverse for exactly that subset, so a description written
 * here round-trips unchanged. Anything richer (bold, headings, links, tables, images,
 * styled spans — typically authored in the web portal's editor) can't be edited as plain
 * text without losing formatting, so it comes back `editable: false` with a readable preview.
 */

const EDITABLE_TAGS = new Set(['p', 'br', 'ul', 'li']);

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&'); // last, so "&amp;lt;" stays "&lt;"
}

/** True when the value is only the plain subset (or has no tags at all). */
function isEditableSubset(html: string): boolean {
  for (const m of html.matchAll(/<\/?([a-z][a-z0-9]*)\b([^>]*)>/gi)) {
    const tag = m[1]!.toLowerCase();
    const attrs = (m[2] ?? '').replace(/\/\s*$/, '').trim();
    if (!EDITABLE_TAGS.has(tag) || attrs) return false;
  }
  return true;
}

export function htmlToEditableText(html: string | null | undefined): {
  text: string;
  editable: boolean;
} {
  if (!html) return { text: '', editable: true };
  // No tags: a legacy plain-text value (saved before the backend normalized writes).
  if (!/<\/?[a-z][a-z0-9]*\b[^>]*>/i.test(html)) return { text: html, editable: true };

  const text = decodeEntities(
    html
      // HTML whitespace is insignificant; structure comes from the tags below.
      .replace(/\s+/g, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<li\b[^>]*>/gi, '• ')
      .replace(/<\/li>/gi, '\n')
      .replace(/<\/(p|ul|ol|h[1-6]|blockquote|table|tr)>/gi, '\n\n')
      .replace(/<\/(td|th)>/gi, ' ')
      .replace(/<[^>]+>/g, ''),
  )
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { text, editable: isEditableSubset(html) };
}
