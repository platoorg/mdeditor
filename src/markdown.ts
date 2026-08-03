export type Parse = (markdown: string) => string;
export type Sanitize = (html: string) => string;

/**
 * Escapes text for safe use as HTML content (not as an attribute value).
 * Mirrors what a browser does when you round-trip a string through
 * `element.textContent = s; s2 = element.innerHTML` — only `&`, `<`, `>`
 * need escaping in that position.
 */
export function escapeHtmlText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Parses markdown to HTML and sanitizes it. `parse` (e.g. marked.parse)
 * intentionally passes raw HTML through, so unsanitized output is a
 * stored-XSS sink — a saved `<img src=x onerror=...>` would execute in
 * any viewer's browser. `sanitize` (e.g. DOMPurify.sanitize) strips
 * scriptable content.
 *
 * Fails closed: if no sanitizer is available, the markdown is escaped and
 * shown as plain text instead of rendering unsanitized HTML.
 */
export function renderMarkdownSafe(
  markdown: string,
  parse: Parse,
  sanitize: Sanitize | null,
): string {
  const source = markdown || "";
  if (sanitize) {
    return sanitize(parse(source));
  }
  return escapeHtmlText(source);
}
