// mdeditor form widget: the markup mdeditor.Render (Go) emits, brought to
// life by initMarkdownEditor(fieldName, options). Built into
// static/markdown-editor.js; needs marked.min.js and purify.min.js loaded
// before it.
//
// The server renders a plain <textarea name="{fieldName}">, so the form
// works without JavaScript. This script hides it and puts the core editor
// (src/core) in its place; every edit is copied back into the textarea,
// which is what the form posts.
//
// DOM contract (all scoped to #md-wrapper-{fieldName}):
//   .md-textarea             — <textarea name="{fieldName}">
//   .md-tab[data-target]     — Write / Preview tab buttons
//   .md-fs-btn               — fullscreen toggle button
//   .md-preview-content      — rendered HTML target inside the preview pane
//   .md-img-btn / .md-img-file / .md-img-status — image insertion (only when
//                              options.upload is set; see mdeditor.UploadOptions)

import { create, type Editor } from '../core/editor';
import { renderMarkdownSafe } from './markdown';
import { imageMarkdown, initImageInsert, publicImageURL, type UploadConfig } from './images';
import { collapseIcon, expandIcon } from './icons';

export interface WidgetOptions {
  /** REST endpoint for autosave (GET/PUT/DELETE). Omit to disable. */
  draftURL?: string;
  /** Enables the Image button, paste and drop. Omit to disable. */
  upload?: UploadConfig;
}

window.renderMarkdownSafe = renderMarkdownSafe;
window.markdownImageSnippet = imageMarkdown;
window.markdownPublicImageURL = (url, cfg) => publicImageURL(url, cfg);

window.initMarkdownEditor = function (fieldName: string, options?: WidgetOptions): void {
  const opts = options || {};
  const wrapper = document.getElementById('md-wrapper-' + fieldName);
  if (!wrapper) return;
  const textarea = wrapper.querySelector<HTMLTextAreaElement>('.md-textarea');
  if (!textarea) return;
  const serverValue = textarea.value;

  // --- The editor replaces the textarea ---
  const input = document.createElement('div');
  input.className = 'md-input mde';
  input.setAttribute('contenteditable', 'true');
  input.setAttribute('role', 'textbox');
  input.setAttribute('aria-multiline', 'true');
  input.spellcheck = true;
  textarea.insertAdjacentElement('beforebegin', input);
  textarea.hidden = true;
  textarea.tabIndex = -1;

  // The host's <label for="{textarea id}"> now names the editor, and
  // clicking it focuses the editor instead of the hidden textarea.
  const label = textarea.labels && textarea.labels[0];
  if (label) {
    if (!label.id) label.id = (textarea.id || 'md-textarea-' + fieldName) + '-label';
    input.setAttribute('aria-labelledby', label.id);
    label.addEventListener('click', (e) => { e.preventDefault(); ed.focus(); });
  }
  if (textarea.required) input.setAttribute('aria-required', 'true');

  let pasteFiles: ((files: File[]) => void) | null = null;
  const ed: Editor = create(input, {
    onChange: (text) => {
      textarea.value = text;
      input.removeAttribute('aria-invalid');
      // Hosts (dirty checks, the draft autosave below) listen on the textarea.
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    },
    onPasteFiles: (files) => { if (pasteFiles) pasteFiles(files); },
  });
  ed.setValue(serverValue, { resetHistory: true, notify: false });

  // A required, empty field blocks the submit like before; the hidden
  // textarea cannot show the browser's bubble, so say it here.
  const invalidNote = document.createElement('p');
  invalidNote.className = 'md-invalid-note';
  invalidNote.setAttribute('role', 'alert');
  input.insertAdjacentElement('afterend', invalidNote);
  textarea.addEventListener('invalid', () => {
    invalidNote.textContent = textarea.validationMessage || 'Please fill in this field.';
    input.setAttribute('aria-invalid', 'true');
    ed.focus();
  });
  textarea.addEventListener('input', () => { invalidNote.textContent = ''; });

  // Where an image goes: the live selection while the editor has focus
  // (paste), else the last one it had, since the Image button takes focus
  // away first. selectionchange is async, hence both.
  let range = { start: serverValue.length, end: serverValue.length };
  function liveRange(): { start: number; end: number } | null {
    const s = ed.getSelection();
    if (s) return { start: s.start, end: s.end };
    const c = ed.getCaret();
    return c == null ? null : { start: c, end: c };
  }
  document.addEventListener('selectionchange', () => { range = liveRange() || range; });

  // --- Tabs + live preview ---
  const tabs = Array.from(wrapper.querySelectorAll<HTMLButtonElement>('.md-tab'));
  const previewPaneId = 'md-preview-' + fieldName;
  function selectTab(tab: HTMLButtonElement): void {
    for (const t of tabs) {
      const on = t === tab;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
    }
    const targetId = tab.dataset.target;
    wrapper!.querySelectorAll<HTMLElement>('.md-pane').forEach((pane) => {
      pane.style.display = pane.id === targetId ? '' : 'none';
    });
    if (targetId === previewPaneId) {
      const out = document.getElementById(previewPaneId)?.querySelector('.md-preview-content');
      if (out) out.innerHTML = renderMarkdownSafe(ed.getValue());
    }
  }
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => selectTab(tab));
    // Tablist keyboard pattern: arrows move between tabs.
    tab.addEventListener('keydown', (e) => {
      const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      const next = tabs[(i + step + tabs.length) % tabs.length];
      selectTab(next);
      next.focus();
    });
  });

  // --- Draft autosave ---
  if (opts.draftURL) initDraft(fieldName, wrapper, textarea, ed, opts.draftURL, serverValue);

  // --- Image insertion (button, paste, drop) ---
  if (opts.upload && opts.upload.url) {
    pasteFiles = initImageInsert(wrapper, ed, opts.upload, () => liveRange() || range);
  } else {
    // Without an upload target a dropped file would make the browser
    // navigate away from the form.
    input.addEventListener('drop', (e) => {
      if (e.dataTransfer && Array.from(e.dataTransfer.types).indexOf('Files') !== -1) e.preventDefault();
    });
  }

  initFullscreen(wrapper, ed);
};

function initDraft(fieldName: string, wrapper: HTMLElement, textarea: HTMLTextAreaElement, ed: Editor, draftURL: string, serverValue: string): void {
  const note = document.createElement('p');
  note.className = 'md-draft-note';
  wrapper.insertAdjacentElement('afterend', note);

  fetch(draftURL).then((res) => (res.status === 204 ? null : res.json())).then((draft: { value?: string; updated_at?: string } | null) => {
    if (!draft || typeof draft.value !== 'string' || draft.value === serverValue) return;
    ed.setValue(draft.value);
    window._draftSaved = true;
    const when = draft.updated_at ? ' from ' + new Date(draft.updated_at).toLocaleString() : '';
    note.innerHTML = '';
    const msg = document.createElement('span');
    msg.className = 'md-draft-restored';
    msg.textContent = 'Draft restored' + when + '. ';
    const discard = document.createElement('a');
    discard.href = '#';
    discard.id = 'md-discard-' + fieldName;
    discard.className = 'md-draft-discard';
    discard.textContent = 'Discard';
    discard.addEventListener('click', (e) => {
      e.preventDefault();
      void fetch(draftURL, { method: 'DELETE' });
      ed.setValue(serverValue);
      note.textContent = '';
    });
    note.append(msg, discard);
  }).catch(() => { /* no draft */ });

  let timer: ReturnType<typeof setTimeout> | undefined;
  textarea.addEventListener('input', () => {
    window._draftSaved = false;
    clearTimeout(timer);
    timer = setTimeout(() => {
      void fetch(draftURL, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: textarea.value }),
      }).then(() => { window._draftSaved = true; });
      note.innerHTML = '<span class="md-draft-saved">Draft saved</span>';
    }, 1000);
  });

  const form = textarea.form || document.getElementById('contentForm');
  if (form) {
    form.addEventListener('submit', () => { void fetch(draftURL, { method: 'DELETE' }); }, { once: true });
  }
}

// Real fullscreen via the Fullscreen API: hides the browser UI and puts the
// editor in the top layer, so no surrounding page CSS can constrain its
// size. The in-page overlay (.is-fullscreen, position: fixed) is applied as
// well and is all that remains where the API is unavailable or refused
// (e.g. an iframe without allowfullscreen).
function initFullscreen(wrapper: HTMLElement, ed: Editor): void {
  const btn = wrapper.querySelector<HTMLButtonElement>('.md-fs-btn');
  if (!btn) return;
  btn.innerHTML = expandIcon;
  function setUI(on: boolean): void {
    wrapper.classList.toggle('is-fullscreen', on);
    document.body.style.overflow = on ? 'hidden' : '';
    btn!.title = on ? 'Exit fullscreen (Esc)' : 'Fullscreen writing mode';
    btn!.setAttribute('aria-label', btn!.title);
    btn!.setAttribute('aria-pressed', String(on));
    btn!.innerHTML = on ? collapseIcon : expandIcon;
  }
  function enter(): void {
    setUI(true);
    if (wrapper.requestFullscreen) wrapper.requestFullscreen().catch(() => { /* overlay stays */ });
    ed.focus();
  }
  function exit(): void {
    setUI(false);
    if (document.fullscreenElement === wrapper && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    ed.focus();
  }
  btn.addEventListener('click', () => {
    if (wrapper.classList.contains('is-fullscreen')) exit(); else enter();
  });
  // Leaving native fullscreen through the browser (Esc, F11, its own exit
  // control) must drop the overlay too.
  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement !== wrapper && wrapper.classList.contains('is-fullscreen')) setUI(false);
  });
  // Overlay-only mode: Esc exits. (In native fullscreen the browser
  // consumes Esc and fullscreenchange handles it.) Ignore Esc while the
  // image dialog is open: it closes the dialog instead.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && wrapper.classList.contains('is-fullscreen')
        && document.fullscreenElement !== wrapper && !document.querySelector('dialog[open]')) {
      exit();
    }
  });
}
