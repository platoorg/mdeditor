// renderMarkdownSafe parses markdown to HTML and sanitizes it. marked
// intentionally passes raw HTML through, so unsanitized output is a
// stored-XSS sink: a content author could save `<img src=x onerror=...>`
// and it would run in any admin's browser on preview. DOMPurify strips
// scriptable content. Exposed globally so every marked call site on a host
// page funnels through one sanitized path.
export function renderMarkdownSafe(md: string): string {
  const src = md || '';
  if (window.DOMPurify && window.marked) {
    return window.DOMPurify.sanitize(window.marked.parse(src));
  }
  // Fail closed: without DOMPurify (or marked), show the text, never raw HTML.
  const d = document.createElement('div');
  d.textContent = src;
  return d.innerHTML;
}
