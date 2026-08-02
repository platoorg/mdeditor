// GENERATED — do not edit by hand. Source: src/*.ts. Run `npm run build` to regenerate.
"use strict";
(() => {
  // src/panes.ts
  function computePaneVisibility(paneIds, targetId) {
    return new Map(paneIds.map((id) => [id, id === targetId ? "" : "none"]));
  }
  function isActiveTab(tabTarget, clickedTarget) {
    return tabTarget === clickedTarget;
  }

  // src/icons.ts
  var EXPAND_ICON = '<svg viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg"><path d="M1 1h5v2H3v3H1zm11 0h5v5h-2V3h-3zM1 12h2v3h3v2H1zm14 3h-3v2h5v-5h-2z"/></svg>';
  var COLLAPSE_ICON = '<svg viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg"><path d="M6 1H4v3H1v2h5zm6 0h2v3h3v2h-5zM6 17H4v-3H1v-2h5zm6 0h2v-3h3v-2h-5z"/></svg>';
  function iconForFullscreen(isFullscreen) {
    return isFullscreen ? COLLAPSE_ICON : EXPAND_ICON;
  }

  // src/fullscreen.ts
  var EXIT_TITLE = "Exit fullscreen (Esc)";
  var ENTER_TITLE = "Fullscreen writing mode";
  function stateFor(fullscreen) {
    return {
      fullscreen,
      bodyOverflow: fullscreen ? "hidden" : "",
      title: fullscreen ? EXIT_TITLE : ENTER_TITLE,
      icon: iconForFullscreen(fullscreen)
    };
  }
  function toggleFullscreen(currentlyFullscreen) {
    return stateFor(!currentlyFullscreen);
  }
  function exitFullscreen() {
    return stateFor(false);
  }
  function shouldExitOnKeydown(key, currentlyFullscreen) {
    return key === "Escape" && currentlyFullscreen;
  }

  // src/draft.ts
  function shouldRestoreDraft(draft, serverValue) {
    return draft !== null && draft.value !== serverValue;
  }
  function draftDiscardId(fieldName) {
    return "md-discard-" + fieldName;
  }
  function restoredMessage(updatedAt, formatTimestamp) {
    const suffix = updatedAt ? " from " + formatTimestamp(updatedAt) : "";
    return `Draft restored${suffix}.`;
  }
  function restoredNoteView(fieldName, updatedAt, formatTimestamp) {
    return {
      kind: "restored",
      message: restoredMessage(updatedAt, formatTimestamp),
      discardId: draftDiscardId(fieldName)
    };
  }
  function savedNoteView() {
    return { kind: "saved" };
  }
  function emptyNoteView() {
    return { kind: "empty" };
  }
  function draftPutPayload(value) {
    return JSON.stringify({ value });
  }
  function defaultFormatTimestamp(iso) {
    return new Date(iso).toLocaleString();
  }

  // src/markdown.ts
  function escapeHtmlText(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function renderMarkdownSafe(markdown, parse, sanitize) {
    const source = markdown || "";
    if (sanitize) {
      return sanitize(parse(source));
    }
    return escapeHtmlText(source);
  }

  // src/index.ts
  window.renderMarkdownSafe = function renderMarkdownSafe2(markdown) {
    return renderMarkdownSafe(
      markdown,
      (md) => window.marked.parse(md),
      window.DOMPurify ? (html) => window.DOMPurify.sanitize(html) : null
    );
  };
  function renderDraftNote(container, view, onDiscard) {
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
  function setupTabs(wrapper, previewPaneId, textarea) {
    const tabs = Array.from(wrapper.querySelectorAll(".md-tab"));
    const panes = Array.from(wrapper.querySelectorAll(".md-pane"));
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
  function setupDraftAutosave(wrapper, fieldName, draftURL, textarea, serverValue) {
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
    fetch(draftURL).then((res) => res.status === 204 ? null : res.json()).then((draft) => {
      if (!shouldRestoreDraft(draft, serverValue)) return;
      const restored = draft;
      textarea.value = restored.value;
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      window._draftSaved = true;
      renderDraftNote(
        draftNote,
        restoredNoteView(fieldName, restored.updated_at, defaultFormatTimestamp),
        discard
      );
    }).catch(() => {
    });
    let draftTimer;
    textarea.addEventListener("input", () => {
      window._draftSaved = false;
      clearTimeout(draftTimer);
      draftTimer = setTimeout(() => {
        fetch(draftURL, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: draftPutPayload(textarea.value)
        }).then(() => {
          window._draftSaved = true;
        });
        renderDraftNote(draftNote, savedNoteView(), discard);
      }, 1e3);
    });
    const form = document.getElementById("contentForm");
    if (form) {
      form.addEventListener("submit", () => void fetch(draftURL, { method: "DELETE" }), { once: true });
    }
  }
  function setupFullscreen(wrapper, textarea) {
    const fsBtn = wrapper.querySelector(".md-fs-btn");
    if (!fsBtn) return;
    const applyState = (state) => {
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
  window.initMarkdownEditor = function initMarkdownEditor(fieldName, options) {
    const draftURL = options?.draftURL ?? null;
    const wrapper = document.getElementById("md-wrapper-" + fieldName);
    if (!wrapper) return;
    const previewPaneId = "md-preview-" + fieldName;
    const textarea = wrapper.querySelector(".md-textarea");
    if (!textarea) return;
    const serverValue = textarea.value;
    setupTabs(wrapper, previewPaneId, textarea);
    if (draftURL) setupDraftAutosave(wrapper, fieldName, draftURL, textarea, serverValue);
    setupFullscreen(wrapper, textarea);
  };
})();
