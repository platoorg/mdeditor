// Not a pure-function test — this is a light smoke test that the compiled
// bundle actually wires up correctly in a real DOM, since src/index.ts
// itself is impure (DOM + fetch) and isn't unit tested directly.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const bundlePath = path.resolve(here, "../static/markdown-editor.js");

function widgetHtml(name: string): string {
  return `
    <div id="md-wrapper-${name}" class="markdown-wrapper">
      <div class="md-toolbar">
        <div class="md-tabs">
          <button type="button" class="md-tab is-active" data-target="md-write-${name}">Write</button>
          <button type="button" class="md-tab" data-target="md-preview-${name}">Preview</button>
        </div>
        <button type="button" class="md-fs-btn" title="Fullscreen writing mode"></button>
      </div>
      <div class="md-pane" id="md-write-${name}">
        <textarea name="${name}" class="md-textarea">hello **world**</textarea>
      </div>
      <div class="md-pane md-preview-pane" id="md-preview-${name}" style="display:none">
        <div class="md-preview-content"></div>
      </div>
    </div>`;
}

describe("compiled bundle", () => {
  let dom: JSDOM;

  beforeEach(() => {
    dom = new JSDOM(`<!doctype html><html><body>${widgetHtml("body")}</body></html>`, {
      runScripts: "outside-only",
    });
    const win = dom.window as unknown as typeof globalThis & { marked: unknown; DOMPurify: unknown };
    win.marked = { parse: (md: string) => `<p>${md}</p>` };
    win.DOMPurify = { sanitize: (html: string) => html };
    dom.window.eval(readFileSync(bundlePath, "utf8"));
  });

  afterEach(() => {
    dom.window.close();
  });

  it("exposes initMarkdownEditor and renderMarkdownSafe globally", () => {
    const win = dom.window as unknown as { initMarkdownEditor: unknown; renderMarkdownSafe: unknown };
    expect(typeof win.initMarkdownEditor).toBe("function");
    expect(typeof win.renderMarkdownSafe).toBe("function");
  });

  it("switches to the preview pane and renders sanitized markdown on tab click", () => {
    const win = dom.window as unknown as { initMarkdownEditor: (name: string) => void };
    win.initMarkdownEditor("body");

    const doc = dom.window.document;
    const previewTab = doc.querySelector('[data-target="md-preview-body"]') as HTMLElement;
    previewTab.dispatchEvent(new dom.window.Event("click", { bubbles: true }));

    const previewPane = doc.getElementById("md-preview-body") as HTMLElement;
    const writePane = doc.getElementById("md-write-body") as HTMLElement;
    expect(previewPane.style.display).toBe("");
    expect(writePane.style.display).toBe("none");
    expect(previewPane.querySelector(".md-preview-content")?.innerHTML).toBe(
      "<p>hello **world**</p>",
    );
  });

  it("toggles fullscreen state on the toolbar button", () => {
    const win = dom.window as unknown as { initMarkdownEditor: (name: string) => void };
    win.initMarkdownEditor("body");

    const doc = dom.window.document;
    const wrapper = doc.getElementById("md-wrapper-body") as HTMLElement;
    const fsBtn = wrapper.querySelector(".md-fs-btn") as HTMLElement;

    fsBtn.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
    expect(wrapper.classList.contains("is-fullscreen")).toBe(true);

    doc.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape" }));
    expect(wrapper.classList.contains("is-fullscreen")).toBe(false);
  });
});
