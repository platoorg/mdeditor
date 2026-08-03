// Plato markdown editor — standalone, no framework dependencies.
// Depends on: marked.min.js AND purify.min.js (both loaded before this file)
//
// Usage:
//   initMarkdownEditor(fieldName, options)
//
// Options:
//   draftURL  string  — REST endpoint for autosave (GET/PUT/DELETE). Omit to disable.
//
// DOM contract (all scoped to #md-wrapper-{fieldName}):
//   .md-textarea             — <textarea name="{fieldName}">
//   .md-tab[data-target]     — Write / Preview tab buttons
//   .md-fs-btn               — fullscreen toggle button
//   .md-preview-content      — rendered HTML target inside the preview pane
//
// This file is the impure shell: it owns every DOM read/write, fetch call,
// and timer. All decision logic (what to render, what state to move to) is
// delegated to the pure functions in ./icons, ./panes, ./fullscreen,
// ./draft, and ./markdown so that logic can be unit tested without a DOM.

import { isActiveTab, computePaneVisibility } from "./panes";
import { toggleFullscreen, exitFullscreen, shouldExitOnKeydown } from "./fullscreen";
import {
  Draft,
  DraftNoteView,
  shouldRestoreDraft,
  restoredNoteView,
  savedNoteView,
  emptyNoteView,
  draftPutPayload,
  defaultFormatTimestamp,
} from "./draft";
import { renderMarkdownSafe as renderMarkdownSafePure } from "./markdown";

export interface EditorOptions {
  draftURL?: string;
}

declare global {
  interface Window {
    marked: { parse(markdown: string): string };
    DOMPurify?: { sanitize(html: string): string };
    renderMarkdownSafe: (markdown: string) => string;
    initMarkdownEditor: (fieldName: string, options?: EditorOptions) => void;
    _draftSaved?: boolean;
  }
}

window.renderMarkdownSafe = function renderMarkdownSafe(markdown: string): string {
  return renderMarkdownSafePure(
    markdown,
    (md) => window.marked.parse(md),
    window.DOMPurify ? (html) => window.DOMPurify!.sanitize(html) : null,
  );
};

function renderDraftNote(container: HTMLElement, view: DraftNoteView, onDiscard: () => void): void {
  container.replaceChildren();
  if (view.kind === "empty") return;

  if (view.kind === "saved") {
    const span = document.createElement("span");
    span.style.color = "#b5b5b5";
    span.textContent = "Draft saved";
    container.append(span);
    return;
  }

  const message = document.createElement("span");
  message.style.color = "#3273dc";
  message.textContent = view.message;

  const discardLink = document.createElement("a");
  discardLink.href = "#";
  discardLink.style.color = "#f14668";
  discardLink.id = view.discardId;
  discardLink.textContent = "Discard";
  discardLink.addEventListener("click", (e) => {
    e.preventDefault();
    onDiscard();
  });

  container.append(message, document.createTextNode(" "), discardLink);
}

function setupTabs(wrapper: HTMLElement, previewPaneId: string, textarea: HTMLTextAreaElement): void {
  const tabs = Array.from(wrapper.querySelectorAll<HTMLElement>(".md-tab"));
  const panes = Array.from(wrapper.querySelectorAll<HTMLElement>(".md-pane"));
  const paneIds = panes.map((pane) => pane.id);

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const targetId = tab.dataset["target"] ?? "";

      tabs.forEach((t) => t.classList.toggle("is-active", isActiveTab(t.dataset["target"] ?? "", targetId)));

      const visibility = computePaneVisibility(paneIds, targetId);
      panes.forEach((pane) => {
        pane.style.display = visibility.get(pane.id) ?? "none";
      });

      if (targetId === previewPaneId) {
        const content = document.getElementById(previewPaneId)?.querySelector(".md-preview-content");
        if (content) content.innerHTML = window.renderMarkdownSafe(textarea.value || "");
      }
    });
  });
}

function setupDraftAutosave(
  wrapper: HTMLElement,
  fieldName: string,
  draftURL: string,
  textarea: HTMLTextAreaElement,
  serverValue: string,
): void {
  const draftNote = document.createElement("p");
  draftNote.className = "md-draft-note";
  draftNote.style.cssText = "margin-top:0.25rem;min-height:1.2em;font-size:0.85em;color:#888";
  wrapper.parentNode?.insertBefore(draftNote, wrapper.nextSibling);

  const discard = () => {
    void fetch(draftURL, { method: "DELETE" });
    textarea.value = serverValue;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    renderDraftNote(draftNote, emptyNoteView(), discard);
  };

  fetch(draftURL)
    .then((res) => (res.status === 204 ? null : (res.json() as Promise<Draft>)))
    .then((draft) => {
      if (!shouldRestoreDraft(draft, serverValue)) return;
      const restored = draft as Draft;
      textarea.value = restored.value;
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      window._draftSaved = true;
      renderDraftNote(
        draftNote,
        restoredNoteView(fieldName, restored.updated_at, defaultFormatTimestamp),
        discard,
      );
    })
    .catch(() => {
      // Autosave is a convenience feature; a failed fetch just means no draft banner.
    });

  let draftTimer: ReturnType<typeof setTimeout> | undefined;
  textarea.addEventListener("input", () => {
    window._draftSaved = false;
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
      fetch(draftURL, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: draftPutPayload(textarea.value),
      }).then(() => {
        window._draftSaved = true;
      });
      renderDraftNote(draftNote, savedNoteView(), discard);
    }, 1000);
  });

  const form = document.getElementById("contentForm");
  if (form) {
    form.addEventListener("submit", () => void fetch(draftURL, { method: "DELETE" }), { once: true });
  }
}

function setupFullscreen(wrapper: HTMLElement, textarea: HTMLTextAreaElement): void {
  const fsBtn = wrapper.querySelector<HTMLButtonElement>(".md-fs-btn");
  if (!fsBtn) return;

  const applyState = (state: ReturnType<typeof toggleFullscreen>) => {
    wrapper.classList.toggle("is-fullscreen", state.fullscreen);
    document.body.style.overflow = state.bodyOverflow;
    fsBtn.title = state.title;
    fsBtn.innerHTML = state.icon;
  };

  applyState(exitFullscreen());

  fsBtn.addEventListener("click", () => {
    const state = toggleFullscreen(wrapper.classList.contains("is-fullscreen"));
    applyState(state);
    textarea.focus();
  });

  document.addEventListener("keydown", (e) => {
    if (shouldExitOnKeydown(e.key, wrapper.classList.contains("is-fullscreen"))) {
      applyState(exitFullscreen());
    }
  });
}

window.initMarkdownEditor = function initMarkdownEditor(fieldName: string, options?: EditorOptions): void {
  const draftURL = options?.draftURL ?? null;

  const wrapper = document.getElementById("md-wrapper-" + fieldName);
  if (!wrapper) return;

  const previewPaneId = "md-preview-" + fieldName;
  const textarea = wrapper.querySelector<HTMLTextAreaElement>(".md-textarea");
  if (!textarea) return;
  const serverValue = textarea.value;

  setupTabs(wrapper, previewPaneId, textarea);
  if (draftURL) setupDraftAutosave(wrapper, fieldName, draftURL, textarea, serverValue);
  setupFullscreen(wrapper, textarea);
};
