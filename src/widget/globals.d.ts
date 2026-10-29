// marked.min.js and purify.min.js are loaded as separate <script>s before
// markdown-editor.js (hosts pin their exact filenames), so they are globals
// here rather than bundled imports.
interface Window {
  marked?: { parse(md: string): string };
  DOMPurify?: { sanitize(html: string): string };
  renderMarkdownSafe(md: string): string;
  markdownImageSnippet(alt: string, url: string): string;
  markdownPublicImageURL(url: string, cfg: import('./images').UploadConfig): string;
  initMarkdownEditor(fieldName: string, options?: import('./index').WidgetOptions): void;
  _draftSaved?: boolean;
}
