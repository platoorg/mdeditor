# mdeditor

A markdown editor in two layers:

- **Core** (`src/core`, TypeScript): a hand-rolled contenteditable editor
  with iA Writer-style hanging headings, list continuation, bracket
  wrapping, its own undo history, plain-text paste and IME support.
  No runtime dependencies. [exWriter](https://writer.exaptation.tech) uses it directly.
- **Widget** (Go package + `static/`): a form field built on the core,
  with Write/Preview tabs, fullscreen writing, draft autosave and image
  upload. Everything is embedded in the Go binary: no npm, bundler or CDN
  for consumers. Plato uses it.

**Editing features**

- Headings keep their text on the body edge; the `#` marks hang in the
  left gutter.
- Enter on a list item starts the next one (`-`, `*`, `+`, `1.`, `1)`,
  `- [ ]`), counting numbers up; Enter on an empty item ends the list.
  Shift+Enter is a plain line break.
- With text selected, typing `(` `[` `{` `"` `'` `` ` `` `*` `_` `~` wraps
  the selection and keeps it selected, so `*` twice gives `**bold**`.
  Works with Option-typed brackets on German and Nordic Mac layouts.
- Paste and drop are always plain text; pasted or dropped images go to a
  callback (the widget uploads them).

---

## Go widget

```bash
go get github.com/platoorg/mdeditor
```

### 1. Mount the asset handler

```go
http.Handle("/mdeditor/", http.StripPrefix("/mdeditor", mdeditor.Handler()))
```

### 2. Add the assets to your page `<head>`

```html
<link rel="stylesheet" href="/mdeditor/markdown-editor.css">
<script src="/mdeditor/marked.min.js"></script>
<script src="/mdeditor/purify.min.js"></script>
<script src="/mdeditor/markdown-editor.js"></script>
```

`purify.min.js` (DOMPurify) must load before `markdown-editor.js`: the
preview sanitizes marked's output, since marked passes raw HTML through.
Without it the preview fails closed and shows plain text.

All assets are same-origin and nothing uses `eval`, so a CSP of
`script-src 'self' 'unsafe-inline'` (the inline initialiser) is enough.

### 3. Render a widget

```go
html, err := mdeditor.Render("body", post.Body, mdeditor.Options{
    Required: true,
    DraftURL: fmt.Sprintf("/api/drafts/%s/body", post.ID),
    Upload: &mdeditor.UploadOptions{
        URL:         "/api/upload",
        Fields:      map[string]string{"namespace": "site"},
        MediaPrefix: "/media/",
        PublicBase:  "https://media.example.com",
    },
})
```

The server renders a plain `<textarea name="body">`, so the form works
without JavaScript. The script hides it, puts the editor in its place and
copies every edit back into it (firing `input` on the textarea, so dirty
checks keep working). A `<label for="md-textarea-body">` names the editor.
For a required field left empty, the submit is blocked and a message is
shown under the editor.

### `Options`

| Field | Meaning |
|---|---|
| `Required` | Marks the field required for form validation. |
| `DraftURL` | Autosave endpoint, see below. Empty disables autosave. |
| `Upload` | Enables the Image button, image paste and drop. Nil (or an empty `URL`) disables them. |

### Image upload

The widget POSTs `multipart/form-data` to `Upload.URL` with the image under
`file` plus every entry of `Fields`, and expects JSON `{"url": "..."}`.
Before upload, photos are scaled to at most 2400px and re-encoded, which
drops EXIF data (GIFs are left alone). The author must enter alt text, then
`![alt](url)` is inserted as its own paragraph. A returned URL starting
with `MediaPrefix` gets that prefix replaced by `PublicBase`; a URL that is
still relative is made absolute, because other sites read the markdown.

### Autosave drafts

| Method | Behaviour |
|---|---|
| `GET` | `204` (no draft) or `200` with `{"value":"...","updated_at":"..."}` |
| `PUT` | Persist the draft, body `{"value":"..."}` |
| `DELETE` | Discard the draft (sent on form submit) |

When a draft differs from the saved value it is restored, with a Discard link.

### Globals

`markdown-editor.js` also defines `renderMarkdownSafe(md)` (marked +
DOMPurify), `markdownImageSnippet(alt, url)` and
`markdownPublicImageURL(url, uploadConfig)` for host pages.

---

## TypeScript core

```bash
npm install https://github.com/platoorg/mdeditor/archive/refs/tags/v0.1.0.tar.gz
```

The package ships TypeScript source; bundle it with your app (Vite and
esbuild handle it as is).

```ts
import { create } from '@platoorg/mdeditor';
import '@platoorg/mdeditor/editor.css';

const ed = create(document.getElementById('doc')!, {
  onChange: (text) => save(text),
  onPasteFiles: (files) => storeImages(files),
  // wrapPairs: false, to turn bracket wrapping off
});
ed.setValue('# Hello', { resetHistory: true });
```

Give the element `contenteditable="true"`, the class `mde`, and at least
4ch of left padding for the heading gutter. Selections are plain-text
offsets: `getSelection()`, `getCaret()`, `setSelection(start, end)`,
`replaceRange(start, end, text)`, `offsetFromPoint(x, y)` (for drops).
`renderLines(text, ranges)` renders the same line layout with highlight
ranges, for a backdrop behind the editor.

---

## Development

```
src/core/     the editor (editor.ts), its CSS, the package entry
src/widget/   the form widget: tabs, preview, drafts, images, fullscreen
static/       built widget (committed: go-get consumers don't run Node)
test/         vitest (jsdom)
mdeditor.go   Render + Handler
```

```bash
npm ci
npm run check   # tsc, vitest, then build static/
go test ./...
```

CI fails when `static/` doesn't match a fresh build, so commit it after
`npm run build`.

## License

MIT, see [LICENSE](LICENSE). Bundled in `static/`: marked (MIT) and
DOMPurify (Apache-2.0 or MPL-2.0); their license headers are kept in the
files.
