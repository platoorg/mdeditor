// Package mdeditor provides a standalone markdown editor widget for Go web applications.
//
// It embeds its own JS (the editor, marked and DOMPurify) and CSS, so no
// external build tools or CDN dependencies are required. The editor is the
// same contenteditable core exWriter uses (src/core): iA-style hanging
// headings, list continuation, bracket wrapping and its own undo history.
// The form still posts a plain <textarea>, which the script keeps in sync.
//
// # Minimal setup
//
//  1. Mount the static asset handler:
//
//     mux.Handle("/mdeditor/", http.StripPrefix("/mdeditor", mdeditor.Handler()))
//
//  2. Add the assets to your page <head> (adjust the prefix to match your mount point):
//
//     <link  rel="stylesheet" href="/mdeditor/markdown-editor.css">
//     <script src="/mdeditor/marked.min.js"></script>
//     <script src="/mdeditor/purify.min.js"></script>
//     <script src="/mdeditor/markdown-editor.js"></script>
//
//  3. Render a field widget:
//
//     html, err := mdeditor.Render("body", item.Body, mdeditor.Options{
//     DraftURL: "/api/drafts/my-field",
//     })
package mdeditor

import (
	"embed"
	"fmt"
	"html/template"
	"io/fs"
	"net/http"
	"strings"
)

//go:embed static
var staticFS embed.FS

// Handler returns an http.Handler that serves the editor's static assets.
// Strip the mount prefix before passing requests to it:
//
//	mux.Handle("/mdeditor/", http.StripPrefix("/mdeditor", mdeditor.Handler()))
func Handler() http.Handler {
	sub, err := fs.Sub(staticFS, "static")
	if err != nil {
		panic(fmt.Sprintf("mdeditor: failed to sub static FS: %v", err))
	}
	return http.FileServer(http.FS(sub))
}

// Options configures a single editor widget instance.
type Options struct {
	// Upload enables inserting images into the markdown: an "Image" toolbar
	// button, pasting an image from the clipboard and dropping image files
	// onto the textarea. Nil disables all three.
	Upload *UploadOptions

	// DraftURL is the base URL for autosave draft persistence.
	// The handler must support GET, PUT (body: {"value":"..."}), and DELETE.
	// Leave empty to disable autosave.
	DraftURL string
	// Required marks the underlying textarea as required for form validation.
	Required bool
}

// UploadOptions configures where inserted images are uploaded to.
//
// The widget POSTs multipart/form-data to URL with the image under "file"
// plus every entry of Fields, and expects a JSON answer carrying the stored
// image's address in "url". It then inserts ![alt](url) at the cursor, after
// asking the author for alt text.
type UploadOptions struct {
	// Fields are extra multipart fields sent with every upload.
	Fields map[string]string
	// URL is the upload endpoint (same-origin; the session cookie authenticates).
	URL string
	// MediaPrefix and PublicBase turn the stored address into the one the
	// markdown should reference: a returned URL starting with MediaPrefix
	// has that prefix replaced by PublicBase. A URL that is still relative
	// afterwards is made absolute against the admin's own origin, because
	// the markdown is read by other sites.
	MediaPrefix string
	PublicBase  string
}

var widgetTmpl = template.Must(template.New("mdeditor-widget").Parse(`<div id="md-wrapper-{{.Name}}" class="markdown-wrapper">
	<div class="md-toolbar">
		<div class="md-tabs" role="tablist">
			<button type="button" class="md-tab is-active" role="tab" aria-selected="true" aria-controls="md-write-{{.Name}}" data-target="md-write-{{.Name}}">Write</button>
			<button type="button" class="md-tab" role="tab" aria-selected="false" aria-controls="md-preview-{{.Name}}" tabindex="-1" data-target="md-preview-{{.Name}}">Preview</button>
		</div>
		<div class="md-actions">
			{{- if .Upload}}
			<button type="button" class="md-img-btn" title="Insert image (or paste / drop one into the text)"><span>Image</span></button>
			<input type="file" class="md-img-file" accept="image/png,image/jpeg,image/gif,image/webp" multiple hidden tabindex="-1" aria-hidden="true">
			{{- end}}
			<button type="button" class="md-fs-btn" title="Fullscreen writing mode" aria-label="Fullscreen writing mode"></button>
		</div>
	</div>
	<div class="md-pane" id="md-write-{{.Name}}" role="tabpanel">
		<textarea id="md-textarea-{{.Name}}" name="{{.Name}}" class="md-textarea"{{if .Required}} required{{end}}>{{.Value}}</textarea>
		{{- if .Upload}}
		<p class="md-img-status" role="status" aria-live="polite"></p>
		{{- end}}
	</div>
	<div class="md-pane md-preview-pane" id="md-preview-{{.Name}}" role="tabpanel" style="display:none">
		<div class="md-preview-content"></div>
	</div>
</div>
<script>initMarkdownEditor({{.Name}}, {{.Opts}});</script>`))

// widgetOpts is the JS-side options object. Passing a struct and letting
// html/template's jsValEscaper marshal it is what makes the script tag safe;
// see Render.
type widgetOpts struct {
	Upload   *widgetUpload `json:"upload,omitempty"`
	DraftURL string        `json:"draftURL,omitempty"`
}

type widgetUpload struct {
	Fields      map[string]string `json:"fields,omitempty"`
	URL         string            `json:"url"`
	MediaPrefix string            `json:"mediaPrefix,omitempty"`
	PublicBase  string            `json:"publicBase,omitempty"`
}

// Render returns the HTML for a markdown editor widget.
// name is the HTML form field name; value is the initial textarea content.
//
// The two values interpolated into the <script> are passed as ordinary Go
// values, NOT as template.JS.
//
// template.JS is emitted verbatim — jsValEscaper has `case JS: return
// string(t)` — so the previous template.JS(fmt.Sprintf("%q", name)) put
// unescaped attacker-controlled data inside a script element. %q escapes
// quotes, backslashes and control characters but NOT "<", ">" or "/", so a
// field named `a</script><script>...` closed the element early and everything
// after it was parsed as fresh markup. Any admin who opened that schema's
// content form executed it, same-origin and fully authenticated —
// namespace-editor to instance-admin escalation.
//
// Handing jsValEscaper the raw values instead makes it JSON-encode them and
// escape "<", ">", "&" and U+2028/9. pkg/schema now also rejects field names
// outside an identifier charset, so this is defence in depth rather than the
// only guard.
func Render(name, value string, opts Options) (template.HTML, error) {
	wo := widgetOpts{DraftURL: opts.DraftURL}
	if u := opts.Upload; u != nil && u.URL != "" {
		wo.Upload = &widgetUpload{
			URL:         u.URL,
			Fields:      u.Fields,
			MediaPrefix: u.MediaPrefix,
			PublicBase:  u.PublicBase,
		}
	}
	var b strings.Builder
	err := widgetTmpl.Execute(&b, map[string]interface{}{
		"Name":     name,
		"Value":    value,
		"Required": opts.Required,
		"Upload":   wo.Upload != nil,
		"Opts":     wo,
	})
	if err != nil {
		return "", fmt.Errorf("mdeditor: render %q: %w", name, err)
	}
	return template.HTML(b.String()), nil
}
