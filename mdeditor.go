// Package mdeditor provides a standalone markdown editor widget for Go web applications.
//
// It embeds its own JS (marked.js + editor logic) and CSS, so no external build
// tools or CDN dependencies are required.
//
// # Minimal setup
//
//  1. Mount the static asset handler:
//
//     mux.Handle("/mdeditor/", http.StripPrefix("/mdeditor", mdeditor.Handler()))
//
//  2. Add the assets to your page <head> (adjust the prefix to match your mount point):
//
//     <link  rel="stylesheet" href="/mdeditor/static/markdown-editor.css">
//     <script src="/mdeditor/static/marked.min.js"></script>
//     <script src="/mdeditor/static/markdown-editor.js"></script>
//
//  3. Render a field widget:
//
//     html, err := mdeditor.Render("body", item.Body, mdeditor.Options{
//         DraftURL: "/api/drafts/my-field",
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
	// Required marks the underlying textarea as required for form validation.
	Required bool

	// DraftURL is the base URL for autosave draft persistence.
	// The handler must support GET, PUT (body: {"value":"..."}), and DELETE.
	// Leave empty to disable autosave.
	DraftURL string
}

var widgetTmpl = template.Must(template.New("mdeditor-widget").Parse(`<div id="md-wrapper-{{.Name}}" class="markdown-wrapper">
	<div class="md-toolbar">
		<div class="md-tabs">
			<button type="button" class="md-tab is-active" data-target="md-write-{{.Name}}">Write</button>
			<button type="button" class="md-tab" data-target="md-preview-{{.Name}}">Preview</button>
		</div>
		<button type="button" class="md-fs-btn" title="Fullscreen writing mode"></button>
	</div>
	<div class="md-pane" id="md-write-{{.Name}}">
		<textarea name="{{.Name}}" class="md-textarea"{{if .Required}} required{{end}}>{{.Value}}</textarea>
	</div>
	<div class="md-pane" id="md-preview-{{.Name}}" style="display:none">
		<div class="md-preview-content"></div>
	</div>
</div>
<script>initMarkdownEditor({{.NameJS}}, {{.OptsJS}});</script>`))

// Render returns the HTML for a markdown editor widget.
// name is the HTML form field name; value is the initial textarea content.
func Render(name, value string, opts Options) (template.HTML, error) {
	optsJS := "{}"
	if opts.DraftURL != "" {
		optsJS = fmt.Sprintf(`{"draftURL":%q}`, opts.DraftURL)
	}

	var b strings.Builder
	err := widgetTmpl.Execute(&b, map[string]interface{}{
		"Name":     name,
		"Value":    value,
		"Required": opts.Required,
		"NameJS":   template.JS(fmt.Sprintf("%q", name)),
		"OptsJS":   template.JS(optsJS),
	})
	if err != nil {
		return "", fmt.Errorf("mdeditor: render %q: %w", name, err)
	}
	return template.HTML(b.String()), nil
}
