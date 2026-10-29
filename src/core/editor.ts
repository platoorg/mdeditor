// mdeditor core — hand-rolled contenteditable markdown editor, shared by
// exWriter and Plato.
//
// Why not a textarea: iA-style hanging headline hashes need per-line
// layout (heading text aligned with the body edge, `#` in the left
// gutter), which a textarea cannot do. Why not a library: product
// decision — no framework, no runtime dependencies.
//
// Model: the document is plain text; the DOM is kept in a canonical
// shape of one <div class="ln [ln--hN]"> per line, each containing a
// single text node (or <br> for an empty line). Line classes carry
// the markdown styling, so restyling never touches text nodes and the
// caret survives. Selections are exposed as plain-text offsets — the
// currency the rest of the app (highlights, apply-fix, AI calls)
// already speaks.
//
// The hard parts a textarea gave us for free, handled here:
//  - undo/redo: own snapshot stack (DOM normalization would poison
//    the native history), with typing coalesced into ~600ms runs
//  - paste/drop: forced to plain text
//  - IME: normalization is deferred until compositionend
//  - list continuation: Enter after a list item starts the next one
//    (see listContinuation)
//  - wrap pairs: typing ( [ { " ' ` * _ ~ with text selected wraps the
//    selection instead of replacing it (see wrapSelection)
//  - caret mapping across messy DOM (browser Enter/delete artifacts):
//    sentinel characters are inserted at the selection boundaries,
//    the text is extracted, and the canonical DOM is rebuilt with the
//    selection restored from the sentinel positions

const HEADING_RE = /^(#{1,6})[ \t]/;
const SENTINEL = ''; // private-use char, stripped from output

/** A highlight span for renderLines — global text offsets, sorted,
 * non-overlapping. `kind` just becomes a CSS class suffix here; the
 * app layer (types.ts's HighlightKind) owns the actual vocabulary. */
export interface LineRange {
  key: string;
  kind: string;
  start: number;
  end: number;
}

export interface CreateOptions {
  onChange?: (text: string) => void;
  /** Image files pasted into the editor; the app stores and inserts them. */
  onPasteFiles?: (files: File[]) => void;
  /** Wrap the selection when an opening pair character is typed
   * (default true). */
  wrapPairs?: boolean;
}

export interface SetValueOptions {
  resetHistory?: boolean;
  select?: { start: number; end: number } | null;
  notify?: boolean;
}

/** The selection this module hands back — plain-text offsets plus the
 * selected text itself. Named distinctly from the DOM's own
 * `Selection` (window.getSelection()), which this file also uses. */
export interface EditorSelection {
  start: number;
  end: number;
  text: string;
}

export interface Editor {
  el: HTMLElement;
  getValue(): string;
  setValue(t: string, o?: SetValueOptions): void;
  replaceRange(start: number, end: number, insert: string): void;
  getSelection(): EditorSelection | null;
  /** Caret offset (selection start) while focused, else null. */
  getCaret(): number | null;
  /** Text offset under a viewport point (for drops), else null. */
  offsetFromPoint(x: number, y: number): number | null;
  setSelection(start: number, end?: number): void;
  focus(): void;
  blur(): void;
  undo(): void;
  redo(): void;
}

interface Snapshot {
  text: string;
  start: number;
  end: number;
}

export function headingLevel(line: string): number {
  const m = HEADING_RE.exec(line);
  return m ? m[1].length : 0;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// renderLines builds the canonical line DOM as HTML, optionally
// weaving in highlight ranges (sorted, non-overlapping, global text
// offsets). Shared by the editor surface and the highlight backdrop
// so both layers always have identical layout.
export function renderLines(text: string, rangesIn?: LineRange[] | null): string {
  const lines = text.split('\n');
  const ranges = rangesIn ?? [];
  let html = '';
  let offset = 0;
  let ri = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineEnd = offset + line.length;
    const lvl = headingLevel(line);
    const cls = 'ln' + (lvl ? ' ln--h' + lvl : '');
    let inner = '';
    let pos = offset;
    while (ri < ranges.length && ranges[ri].start < lineEnd) {
      const r = ranges[ri];
      const s = Math.max(r.start, pos);
      const e = Math.min(r.end, lineEnd);
      if (e <= s) { // consumed or newline-only on this line
        if (r.end <= lineEnd) { ri++; continue; }
        break;
      }
      inner += esc(text.slice(pos, s));
      inner += '<mark class="hl hl--' + r.kind + '" data-key="' + r.key + '">'
        + esc(text.slice(s, e)) + '</mark>';
      pos = e;
      if (r.end <= lineEnd) ri++;
      else break; // range continues on the next line
    }
    inner += esc(text.slice(pos, lineEnd));
    html += '<div class="' + cls + '">' + (inner || '<br>') + '</div>';
    offset = lineEnd + 1;
  }
  return html;
}

// "- ", "* ", "+ ", "1. ", "1) ", each optionally with a "[ ]" task box.
const LIST_RE = /^([ \t]*)([-*+]|(\d{1,9})([.)]))([ \t]+)(\[[ xX]\][ \t]+)?/;

/** What Enter should do on a markdown list line, given the line's text
 * before and after the caret. `insert` continues the list with the same
 * indent and marker (numbers count up, task boxes start unchecked);
 * `end` means the item is empty, so Enter clears its marker and leaves
 * the list. null: not a list line, or the caret sits inside the marker,
 * so Enter behaves normally. */
export function listContinuation(before: string, after: string):
  { kind: 'insert'; text: string } | { kind: 'end'; markerLength: number } | null {
  const m = LIST_RE.exec(before);
  if (!m || before.length < m[0].length) return null;
  if (before.length === m[0].length && after.trim() === '') {
    return { kind: 'end', markerLength: m[0].length };
  }
  const [, indent, bullet, num, delim, gap, task] = m;
  const marker = num !== undefined ? String(Number(num) + 1) + delim : bullet;
  return { kind: 'insert', text: '\n' + indent + marker + gap + (task ? '[ ] ' : '') };
}

/** Opening characters that wrap a selection, and their closers. */
export const WRAP_PAIRS: Readonly<Record<string, string>> = {
  '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`', '*': '*', '_': '_', '~': '~',
};

/** Wraps text[start, end) in the pair opened by `open`. The result keeps
 * the original text selected, so the mark can be repeated (`*` twice
 * gives **bold**). null: not a pair character, or nothing selected. */
export function wrapSelection(text: string, start: number, end: number, open: string):
  { text: string; start: number; end: number } | null {
  const close = WRAP_PAIRS[open];
  if (!close || start === end) return null;
  return {
    text: text.slice(0, start) + open + text.slice(start, end) + close + text.slice(end),
    start: start + 1,
    end: end + 1,
  };
}

export function create(root: HTMLElement, opts: CreateOptions = {}): Editor {
  const onChange = opts.onChange || (() => {});

  let text = '';
  let composing = false;

  const undoStack: Snapshot[] = [];
  const redoStack: Snapshot[] = [];
  let lastSnap: Snapshot = { text: '', start: 0, end: 0 };
  let lastEditAt = 0;
  let lastEditKind: string | null = null;
  const HISTORY_MAX = 200;

  /* ── rendering ─────────────────────────────────────────────── */

  function render(sel?: { start: number; end: number } | null): void {
    root.innerHTML = renderLines(text, null);
    root.classList.toggle('is-empty', text === '');
    if (sel) setSelection(sel.start, sel.end);
  }

  /* ── DOM → text ────────────────────────────────────────────── */

  // lineText flattens one line container; embedded <br> become
  // newlines, and one trailing newline is stripped (the filler <br>
  // browsers keep in empty/trailing positions).
  function lineText(el: Node): string {
    let s = '';
    (function rec(n: Node) {
      const cs = n.childNodes;
      for (let i = 0; i < cs.length; i++) {
        const c = cs[i];
        if (c.nodeType === 3) s += (c as Text).data;
        else if (c.nodeName === 'BR') s += '\n';
        else if (c.nodeType === 1) rec(c);
      }
    })(el);
    if (s.charAt(s.length - 1) === '\n') s = s.slice(0, -1);
    return s;
  }

  function domToText(): string {
    const kids = root.childNodes;
    const parts: string[] = [];
    let inline: string | null = null; // run of stray top-level text
    for (let i = 0; i < kids.length; i++) {
      const k = kids[i];
      if (k.nodeType === 3) { inline = (inline || '') + (k as Text).data; continue; }
      if (k.nodeName === 'BR') { parts.push(inline || ''); inline = ''; continue; }
      if (k.nodeType !== 1) continue;
      if (inline !== null) { parts.push(inline); inline = null; }
      parts.push(lineText(k));
    }
    if (inline !== null) parts.push(inline);
    return parts.join('\n');
  }

  // isCanonical: every child is a DIV holding exactly one text node
  // (without newlines) or one <br>.
  function isCanonical(): boolean {
    const kids = root.childNodes;
    if (!kids.length) return text === '';
    for (let i = 0; i < kids.length; i++) {
      const k = kids[i];
      if (k.nodeType !== 1 || k.nodeName !== 'DIV') return false;
      const c = k.childNodes;
      if (c.length !== 1) return false;
      if (c[0].nodeType === 3) {
        if ((c[0] as Text).data.indexOf('\n') !== -1) return false;
      } else if (c[0].nodeName !== 'BR') {
        return false;
      }
    }
    return true;
  }

  // captureDirty reads text + selection out of an arbitrary DOM
  // shape by planting sentinel characters at the selection
  // boundaries before extraction.
  function captureDirty(): { text: string; start: number | null; end: number | null } {
    let start: number | null = null;
    let end: number | null = null;
    const sel = window.getSelection();
    const had = !!sel && sel.rangeCount > 0 && root.contains(sel.getRangeAt(0).startContainer);
    if (had && sel) {
      const r = sel.getRangeAt(0);
      const rs = r.cloneRange();
      const re = r.cloneRange();
      rs.collapse(true);
      re.collapse(false);
      re.insertNode(document.createTextNode(SENTINEL));
      rs.insertNode(document.createTextNode(SENTINEL));
    }
    let t = domToText();
    if (had) {
      start = t.indexOf(SENTINEL);
      if (start !== -1) {
        t = t.slice(0, start) + t.slice(start + 1);
        end = t.indexOf(SENTINEL);
        if (end !== -1) t = t.slice(0, end) + t.slice(end + 1);
        else end = start;
      } else {
        start = end = null;
      }
    }
    // Belt and suspenders: never let a sentinel survive.
    t = t.split(SENTINEL).join('');
    return { text: t, start: start, end: end };
  }

  // syncFromDOM ingests whatever the browser did on input. Fast
  // path: canonical DOM → read lines, fix classes in place (caret
  // untouched). Slow path: capture + full rebuild.
  function syncFromDOM(): void {
    if (isCanonical()) {
      const kids = root.children;
      const lines: string[] = [];
      for (let i = 0; i < kids.length; i++) {
        const c = kids[i].firstChild;
        lines.push(c && c.nodeType === 3 ? (c as Text).data : '');
      }
      text = lines.join('\n');
      for (let j = 0; j < kids.length; j++) {
        const lvl = headingLevel(lines[j]);
        const cls = 'ln' + (lvl ? ' ln--h' + lvl : '');
        if (kids[j].className !== cls) kids[j].className = cls;
      }
      root.classList.toggle('is-empty', text === '');
    } else {
      const cap = captureDirty();
      text = cap.text;
      render(cap.start != null && cap.end != null ? { start: cap.start, end: cap.end } : null);
    }
  }

  /* ── selection ↔ text offsets (canonical DOM only) ─────────── */

  function lineBase(div: Element): number {
    let base = 0;
    const kids = root.children;
    for (let i = 0; i < kids.length; i++) {
      if (kids[i] === div) return base;
      base += (kids[i].textContent || '').length + 1;
    }
    return -1;
  }

  function pointOffset(node: Node, off: number): number {
    if (node === root) {
      let total = 0;
      const kids = root.children;
      const idx = Math.min(off, kids.length);
      for (let i = 0; i < idx; i++) total += (kids[i].textContent || '').length + 1;
      return Math.min(total, text.length);
    }
    let div: Node | null = node.nodeType === 3 ? node.parentNode : node;
    while (div && div.parentNode !== root) div = div.parentNode;
    if (!div) return 0;
    const base = lineBase(div as Element);
    if (base < 0) return 0;
    if (node.nodeType === 3) return Math.min(base + off, text.length);
    return Math.min(base + (off > 0 ? ((div as Element).textContent || '').length : 0), text.length);
  }

  function selectionOffsets(): { start: number; end: number } | null {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    const r = sel.getRangeAt(0);
    if (!root.contains(r.startContainer) || !root.contains(r.endContainer)) return null;
    const a = pointOffset(r.startContainer, r.startOffset);
    const b = pointOffset(r.endContainer, r.endOffset);
    return a <= b ? { start: a, end: b } : { start: b, end: a };
  }

  function locatePoint(offset: number): { node: Node; off: number } {
    offset = Math.max(0, Math.min(offset, text.length));
    const kids = root.children;
    let base = 0;
    for (let i = 0; i < kids.length; i++) {
      const len = (kids[i].textContent || '').length;
      if (offset <= base + len) {
        const child = kids[i].firstChild;
        if (child && child.nodeType === 3) return { node: child, off: offset - base };
        return { node: kids[i], off: 0 };
      }
      base += len + 1;
    }
    const last = kids[kids.length - 1];
    if (!last) return { node: root, off: 0 };
    const lc = last.firstChild;
    if (lc && lc.nodeType === 3) return { node: lc, off: (lc as Text).data.length };
    return { node: last, off: 0 };
  }

  function setSelection(start: number, end?: number): void {
    if (end == null) end = start;
    root.focus();
    const sel = window.getSelection();
    if (!sel) return;
    const a = locatePoint(start);
    const b = locatePoint(end);
    const range = document.createRange();
    range.setStart(a.node, a.off);
    range.setEnd(b.node, b.off);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  /* ── history ───────────────────────────────────────────────── */

  function noteChange(kind: string | null): void {
    const now = Date.now();
    const coalesce = !!kind && kind === lastEditKind && now - lastEditAt < 600;
    if (!coalesce) {
      undoStack.push({ text: lastSnap.text, start: lastSnap.start, end: lastSnap.end });
      if (undoStack.length > HISTORY_MAX) undoStack.shift();
    }
    lastEditKind = kind;
    lastEditAt = now;
    redoStack.length = 0;
  }

  function afterChange(notify?: boolean): void {
    const s = selectionOffsets() || { start: text.length, end: text.length };
    lastSnap = { text: text, start: s.start, end: s.end };
    if (notify !== false) onChange(text);
  }

  function undo(): void {
    if (!undoStack.length) return;
    const cur = selectionOffsets() || { start: text.length, end: text.length };
    redoStack.push({ text: text, start: cur.start, end: cur.end });
    const prev = undoStack.pop() as Snapshot;
    text = prev.text;
    render({ start: prev.start, end: prev.end });
    lastEditKind = null;
    afterChange();
  }

  function redo(): void {
    if (!redoStack.length) return;
    const cur = selectionOffsets() || { start: text.length, end: text.length };
    undoStack.push({ text: text, start: cur.start, end: cur.end });
    const next = redoStack.pop() as Snapshot;
    text = next.text;
    render({ start: next.start, end: next.end });
    lastEditKind = null;
    afterChange();
  }

  /* ── edits ─────────────────────────────────────────────────── */

  function insertAtSelection(t: string): void {
    const s = selectionOffsets() || { start: text.length, end: text.length };
    noteChange(null);
    text = text.slice(0, s.start) + t + text.slice(s.end);
    render({ start: s.start + t.length, end: s.start + t.length });
    afterChange();
  }

  function handleInput(): void {
    if (composing) return;
    noteChange('type');
    syncFromDOM();
    afterChange();
  }

  /* ── events ────────────────────────────────────────────────── */

  root.addEventListener('input', handleInput);

  root.addEventListener('beforeinput', (e: InputEvent) => {
    if (e.inputType === 'historyUndo') { e.preventDefault(); undo(); }
    else if (e.inputType === 'historyRedo') { e.preventDefault(); redo(); }
  });

  // Enter on a list item continues the list; Shift+Enter is a plain
  // newline. Handled on keydown so the browser never builds its own
  // paragraph DOM for it.
  function continueList(): boolean {
    const s = selectionOffsets();
    if (!s || s.start !== s.end) return false;
    const lineStart = text.lastIndexOf('\n', s.start - 1) + 1;
    const nl = text.indexOf('\n', s.start);
    const lineEnd = nl === -1 ? text.length : nl;
    const c = listContinuation(text.slice(lineStart, s.start), text.slice(s.start, lineEnd));
    if (!c) return false;
    noteChange(null);
    if (c.kind === 'end') {
      text = text.slice(0, lineStart) + text.slice(lineStart + c.markerLength);
      render({ start: lineStart, end: lineStart });
    } else {
      text = text.slice(0, s.start) + c.text + text.slice(s.start);
      const caret = s.start + c.text.length;
      render({ start: caret, end: caret });
    }
    afterChange();
    return true;
  }

  // Alt/Option alone is allowed: on macOS German/Nordic layouts [ and {
  // are typed with Option. AltGr arrives as Ctrl+Alt.
  function wrapPair(e: KeyboardEvent): boolean {
    if (opts.wrapPairs === false || e.isComposing || composing || e.metaKey || (e.ctrlKey && !e.altKey)) return false;
    const s = selectionOffsets();
    if (!s) return false;
    const w = wrapSelection(text, s.start, s.end, e.key);
    if (!w) return false;
    noteChange(null);
    text = w.text;
    render({ start: w.start, end: w.end });
    afterChange();
    return true;
  }

  root.addEventListener('keydown', (e: KeyboardEvent) => {
    if (wrapPair(e)) { e.preventDefault(); return; }
    if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey
        && !e.isComposing && !composing) {
      if (continueList()) e.preventDefault();
      return;
    }
    if (!(e.metaKey || e.ctrlKey)) return;
    const k = e.key.toLowerCase();
    if (k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
    else if (k === 'y') { e.preventDefault(); redo(); }
  });

  root.addEventListener('paste', (e: ClipboardEvent) => {
    const files = e.clipboardData ? [...e.clipboardData.files].filter((f) => f.type.startsWith('image/')) : [];
    if (files.length && opts.onPasteFiles) {
      e.preventDefault();
      opts.onPasteFiles(files);
      return;
    }
    e.preventDefault();
    const t = e.clipboardData ? e.clipboardData.getData('text/plain') : '';
    if (t) insertAtSelection(t.replace(/\r\n?/g, '\n'));
  });

  // Drops arrive as arbitrary HTML — route through plain text too.
  // Dropped files are left to the app shell, which opens them.
  root.addEventListener('drop', (e: DragEvent) => {
    if (e.dataTransfer && e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    const t = e.dataTransfer ? e.dataTransfer.getData('text/plain') : '';
    if (t) insertAtSelection(t.replace(/\r\n?/g, '\n'));
  });

  root.addEventListener('compositionstart', () => { composing = true; });
  root.addEventListener('compositionend', () => {
    composing = false;
    handleInput();
  });

  render();

  /* ── public API ────────────────────────────────────────────── */

  return {
    el: root,
    getValue(): string { return text; },
    setValue(t: string, o: SetValueOptions = {}): void {
      const normalized = String(t == null ? '' : t).replace(/\r\n?/g, '\n');
      if (o.resetHistory) {
        undoStack.length = 0;
        redoStack.length = 0;
        lastEditKind = null;
      } else if (normalized !== text) {
        noteChange(null);
      }
      text = normalized;
      render(o.select || null);
      afterChange(o.notify);
    },
    replaceRange(start: number, end: number, insert: string): void {
      start = Math.max(0, Math.min(start, text.length));
      end = Math.max(start, Math.min(end, text.length));
      noteChange(null);
      text = text.slice(0, start) + insert + text.slice(end);
      const caret = start + insert.length;
      render({ start: caret, end: caret });
      afterChange();
    },
    getSelection(): EditorSelection | null {
      if (document.activeElement !== root) return null;
      const s = selectionOffsets();
      if (!s || s.start === s.end) return null;
      return { start: s.start, end: s.end, text: text.slice(s.start, s.end) };
    },
    getCaret(): number | null {
      if (document.activeElement !== root) return null;
      const s = selectionOffsets();
      return s ? s.start : null;
    },
    offsetFromPoint(x: number, y: number): number | null {
      const doc = document as Document & {
        caretPositionFromPoint?(x: number, y: number): { offsetNode: Node; offset: number } | null;
      };
      if (doc.caretPositionFromPoint) {
        const p = doc.caretPositionFromPoint(x, y);
        if (p && root.contains(p.offsetNode)) return pointOffset(p.offsetNode, p.offset);
      } else if (document.caretRangeFromPoint) {
        const r = document.caretRangeFromPoint(x, y);
        if (r && root.contains(r.startContainer)) return pointOffset(r.startContainer, r.startOffset);
      }
      return null;
    },
    setSelection: setSelection,
    focus(): void { root.focus(); },
    blur(): void { root.blur(); },
    undo: undo,
    redo: redo,
  };
}
