# mdeditor

A standalone markdown editor widget for Go web applications. No npm, no bundler, no CDN — everything is embedded in the package binary.

**Features**

- Write / Preview tabs with live rendering
- Fullscreen writing mode (Esc to exit)
- Optional autosave drafts via a configurable REST endpoint
- Zero external dependencies at runtime

---

## Installation

```bash
go get github.com/platoorg/mdeditor
```

Requires Go 1.21 or later (uses `embed`).

---

## Quick start

### 1. Mount the asset handler

Register the handler once at startup. The prefix you choose determines the URLs used in your HTML.

```go
import "github.com/platoorg/mdeditor"

// Using the standard library mux:
http.Handle("/mdeditor/", http.StripPrefix("/mdeditor", mdeditor.Handler()))

// Using a third-party router (e.g. chi):
r.Handle("/mdeditor/*", http.StripPrefix("/mdeditor", mdeditor.Handler()))
```

### 2. Add the assets to your page `<head>`

```html
<link rel="stylesheet" href="/mdeditor/static/markdown-editor.css">
<script src="/mdeditor/static/marked.min.js"></script>
<script src="/mdeditor/static/markdown-editor.js"></script>
```

Adjust the `/mdeditor` prefix to match where you mounted the handler.

### 3. Render a widget

```go
import "github.com/platoorg/mdeditor"

html, err := mdeditor.Render("body", post.Body, mdeditor.Options{})
if err != nil {
    // handle error
}
// pass html to your template as template.HTML
```

The returned `template.HTML` is safe to inject directly into your template output — it contains the widget markup and a small inline `<script>` initialiser.

---

## API reference

### `Handler() http.Handler`

Returns an `http.Handler` that serves the three static assets embedded in the package:

| Path | Content |
|------|---------|
| `/static/markdown-editor.js` | Editor logic |
| `/static/marked.min.js` | Markdown parser (marked v15) |
| `/static/markdown-editor.css` | Editor styles |

Mount it with `http.StripPrefix` so requests arrive without the path prefix.

---

### `Render(name, value string, opts Options) (template.HTML, error)`

Renders the editor widget HTML for a single form field.

| Parameter | Description |
|-----------|-------------|
| `name` | The HTML `name` attribute of the textarea (used for form submission) |
| `value` | Initial markdown content |
| `opts` | See `Options` below |

Returns `template.HTML` (already escaped for safe injection) and an error.

---

### `type Options`

```go
type Options struct {
    // Required marks the textarea as required for HTML form validation.
    Required bool

    // DraftURL is the endpoint used for autosave.
    // Leave empty to disable autosave entirely.
    DraftURL string
}
```

---

## Autosave drafts

When `Options.DraftURL` is set, the editor will automatically save draft content to that endpoint. Your server must implement three operations on that URL:

| Method | Behaviour |
|--------|-----------|
| `GET` | Return `204 No Content` (no draft) or `200` with `{"value":"...","updated_at":"..."}` |
| `PUT` | Persist the draft — body is `{"value":"..."}` |
| `DELETE` | Discard the draft (called on form submit) |

Example with a unique URL per field:

```go
html, err := mdeditor.Render("body", post.Body, mdeditor.Options{
    DraftURL: fmt.Sprintf("/api/drafts/%s/%s/body", schemaID, itemID),
})
```

When a draft exists and differs from the saved value, a restore banner is shown with a discard link. The draft is deleted automatically on form submit.

---

## Using from `html/template`

Register a template function so you can call `Render` directly from your templates:

```go
tmpl := template.New("").Funcs(template.FuncMap{
    "mdeditor": func(name, value string) (template.HTML, error) {
        return mdeditor.Render(name, value, mdeditor.Options{})
    },
})
```

Then in your template:

```html
<div class="field">
    <label class="label">Body</label>
    {{mdeditor "body" .Post.Body}}
</div>
```

---

## Styling

The editor uses a set of scoped CSS classes (all prefixed `.markdown-wrapper`). The default styles are minimal and can be overridden:

```css
/* Increase minimum editor height */
.markdown-wrapper .md-textarea {
    min-height: 400px;
}

/* Style the preview pane */
.markdown-wrapper .md-preview-content {
    font-family: Georgia, serif;
}
```

The fullscreen overlay uses `z-index: 9999`. Adjust if needed for your layout.

---

## How it works

The package uses Go's `embed` directive to bundle `markdown-editor.js`, `marked.min.js`, and `markdown-editor.css` directly into your binary. `Handler()` serves them from memory via `http.FileServer`. `Render()` generates the widget HTML and a small inline script that calls `initMarkdownEditor(name, options)`.

The editor stores content in a plain `<textarea>` — standard form submission works without any extra JavaScript.

---

## License

MIT
