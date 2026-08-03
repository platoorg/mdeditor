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
//     <link  rel="stylesheet" href="/mdeditor/markdown-editor.css">
//     <script src="/mdeditor/marked.min.js"></script>
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

	// DraftURL is the base URL for autosave draft persistence.
	// The handler must support GET, PUT (body: {"value":"..."}), and DELETE.
	// Leave empty to disable autosave.
	DraftURL string
	// Required marks the underlying textarea as required for form validation.
	Required bool
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
	<div class="md-pane md-preview-pane" id="md-preview-{{.Name}}" style="display:none">
		<div class="md-preview-content"></div>
	</div>
</div>
<script>initMarkdownEditor({{.Name}}, {{.Opts}});</script>`))

// widgetOpts is the JS-side options object. Passing a struct and letting
// html/template's jsValEscaper marshal it is what makes the script tag safe;
// see Render.
type widgetOpts struct {
	DraftURL string `json:"draftURL,omitempty"`
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
// after it was parsed as fresh markup, executing same-origin in whoever's
// browser rendered the widget.
//
// Handing jsValEscaper the raw values instead makes it JSON-encode them and
// escape "<", ">", "&" and U+2028/9. Callers should still avoid deriving
// field names from untrusted input.
func Render(name, value string, opts Options) (template.HTML, error) {
	var b strings.Builder
	err := widgetTmpl.Execute(&b, map[string]interface{}{
		"Name":     name,
		"Value":    value,
		"Required": opts.Required,
		"Opts":     widgetOpts{DraftURL: opts.DraftURL},
	})
	if err != nil {
		return "", fmt.Errorf("mdeditor: render %q: %w", name, err)
	}
	return template.HTML(b.String()), nil
}
