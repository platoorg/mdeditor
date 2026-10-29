/* GENERATED - do not edit by hand. Source: src/. Run `npm run build` to regenerate. */
"use strict";
(() => {
  // src/core/editor.ts
  var HEADING_RE = /^(#{1,6})[ \t]/;
  var SENTINEL = "\uE000";
  function headingLevel(line) {
    const m = HEADING_RE.exec(line);
    return m ? m[1].length : 0;
  }
  function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function renderLines(text, rangesIn) {
    const lines = text.split("\n");
    const ranges = rangesIn ?? [];
    let html = "";
    let offset = 0;
    let ri = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineEnd = offset + line.length;
      const lvl = headingLevel(line);
      const cls = "ln" + (lvl ? " ln--h" + lvl : "");
      let inner = "";
      let pos = offset;
      while (ri < ranges.length && ranges[ri].start < lineEnd) {
        const r = ranges[ri];
        const s = Math.max(r.start, pos);
        const e = Math.min(r.end, lineEnd);
        if (e <= s) {
          if (r.end <= lineEnd) {
            ri++;
            continue;
          }
          break;
        }
        inner += esc(text.slice(pos, s));
        inner += '<mark class="hl hl--' + r.kind + '" data-key="' + r.key + '">' + esc(text.slice(s, e)) + "</mark>";
        pos = e;
        if (r.end <= lineEnd) ri++;
        else break;
      }
      inner += esc(text.slice(pos, lineEnd));
      html += '<div class="' + cls + '">' + (inner || "<br>") + "</div>";
      offset = lineEnd + 1;
    }
    return html;
  }
  var LIST_RE = /^([ \t]*)([-*+]|(\d{1,9})([.)]))([ \t]+)(\[[ xX]\][ \t]+)?/;
  function listContinuation(before, after) {
    const m = LIST_RE.exec(before);
    if (!m || before.length < m[0].length) return null;
    if (before.length === m[0].length && after.trim() === "") {
      return { kind: "end", markerLength: m[0].length };
    }
    const [, indent, bullet, num, delim, gap, task] = m;
    const marker = num !== void 0 ? String(Number(num) + 1) + delim : bullet;
    return { kind: "insert", text: "\n" + indent + marker + gap + (task ? "[ ] " : "") };
  }
  var WRAP_PAIRS = {
    "(": ")",
    "[": "]",
    "{": "}",
    '"': '"',
    "'": "'",
    "`": "`",
    "*": "*",
    "_": "_",
    "~": "~"
  };
  function wrapSelection(text, start, end, open) {
    const close = WRAP_PAIRS[open];
    if (!close || start === end) return null;
    return {
      text: text.slice(0, start) + open + text.slice(start, end) + close + text.slice(end),
      start: start + 1,
      end: end + 1
    };
  }
  function create(root, opts = {}) {
    const onChange = opts.onChange || (() => {
    });
    let text = "";
    let composing = false;
    const undoStack = [];
    const redoStack = [];
    let lastSnap = { text: "", start: 0, end: 0 };
    let lastEditAt = 0;
    let lastEditKind = null;
    const HISTORY_MAX = 200;
    function render(sel) {
      root.innerHTML = renderLines(text, null);
      root.classList.toggle("is-empty", text === "");
      if (sel) setSelection(sel.start, sel.end);
    }
    function lineText(el) {
      let s = "";
      (function rec(n) {
        const cs = n.childNodes;
        for (let i = 0; i < cs.length; i++) {
          const c = cs[i];
          if (c.nodeType === 3) s += c.data;
          else if (c.nodeName === "BR") s += "\n";
          else if (c.nodeType === 1) rec(c);
        }
      })(el);
      if (s.charAt(s.length - 1) === "\n") s = s.slice(0, -1);
      return s;
    }
    function domToText() {
      const kids = root.childNodes;
      const parts = [];
      let inline = null;
      for (let i = 0; i < kids.length; i++) {
        const k = kids[i];
        if (k.nodeType === 3) {
          inline = (inline || "") + k.data;
          continue;
        }
        if (k.nodeName === "BR") {
          parts.push(inline || "");
          inline = "";
          continue;
        }
        if (k.nodeType !== 1) continue;
        if (inline !== null) {
          parts.push(inline);
          inline = null;
        }
        parts.push(lineText(k));
      }
      if (inline !== null) parts.push(inline);
      return parts.join("\n");
    }
    function isCanonical() {
      const kids = root.childNodes;
      if (!kids.length) return text === "";
      for (let i = 0; i < kids.length; i++) {
        const k = kids[i];
        if (k.nodeType !== 1 || k.nodeName !== "DIV") return false;
        const c = k.childNodes;
        if (c.length !== 1) return false;
        if (c[0].nodeType === 3) {
          if (c[0].data.indexOf("\n") !== -1) return false;
        } else if (c[0].nodeName !== "BR") {
          return false;
        }
      }
      return true;
    }
    function captureDirty() {
      let start = null;
      let end = null;
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
      t = t.split(SENTINEL).join("");
      return { text: t, start, end };
    }
    function syncFromDOM() {
      if (isCanonical()) {
        const kids = root.children;
        const lines = [];
        for (let i = 0; i < kids.length; i++) {
          const c = kids[i].firstChild;
          lines.push(c && c.nodeType === 3 ? c.data : "");
        }
        text = lines.join("\n");
        for (let j = 0; j < kids.length; j++) {
          const lvl = headingLevel(lines[j]);
          const cls = "ln" + (lvl ? " ln--h" + lvl : "");
          if (kids[j].className !== cls) kids[j].className = cls;
        }
        root.classList.toggle("is-empty", text === "");
      } else {
        const cap = captureDirty();
        text = cap.text;
        render(cap.start != null && cap.end != null ? { start: cap.start, end: cap.end } : null);
      }
    }
    function lineBase(div) {
      let base = 0;
      const kids = root.children;
      for (let i = 0; i < kids.length; i++) {
        if (kids[i] === div) return base;
        base += (kids[i].textContent || "").length + 1;
      }
      return -1;
    }
    function pointOffset(node, off) {
      if (node === root) {
        let total = 0;
        const kids = root.children;
        const idx = Math.min(off, kids.length);
        for (let i = 0; i < idx; i++) total += (kids[i].textContent || "").length + 1;
        return Math.min(total, text.length);
      }
      let div = node.nodeType === 3 ? node.parentNode : node;
      while (div && div.parentNode !== root) div = div.parentNode;
      if (!div) return 0;
      const base = lineBase(div);
      if (base < 0) return 0;
      if (node.nodeType === 3) return Math.min(base + off, text.length);
      return Math.min(base + (off > 0 ? (div.textContent || "").length : 0), text.length);
    }
    function selectionOffsets() {
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return null;
      const r = sel.getRangeAt(0);
      if (!root.contains(r.startContainer) || !root.contains(r.endContainer)) return null;
      const a = pointOffset(r.startContainer, r.startOffset);
      const b = pointOffset(r.endContainer, r.endOffset);
      return a <= b ? { start: a, end: b } : { start: b, end: a };
    }
    function locatePoint(offset) {
      offset = Math.max(0, Math.min(offset, text.length));
      const kids = root.children;
      let base = 0;
      for (let i = 0; i < kids.length; i++) {
        const len = (kids[i].textContent || "").length;
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
      if (lc && lc.nodeType === 3) return { node: lc, off: lc.data.length };
      return { node: last, off: 0 };
    }
    function setSelection(start, end) {
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
    function noteChange(kind) {
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
    function afterChange(notify) {
      const s = selectionOffsets() || { start: text.length, end: text.length };
      lastSnap = { text, start: s.start, end: s.end };
      if (notify !== false) onChange(text);
    }
    function undo() {
      if (!undoStack.length) return;
      const cur = selectionOffsets() || { start: text.length, end: text.length };
      redoStack.push({ text, start: cur.start, end: cur.end });
      const prev = undoStack.pop();
      text = prev.text;
      render({ start: prev.start, end: prev.end });
      lastEditKind = null;
      afterChange();
    }
    function redo() {
      if (!redoStack.length) return;
      const cur = selectionOffsets() || { start: text.length, end: text.length };
      undoStack.push({ text, start: cur.start, end: cur.end });
      const next = redoStack.pop();
      text = next.text;
      render({ start: next.start, end: next.end });
      lastEditKind = null;
      afterChange();
    }
    function insertAtSelection(t) {
      const s = selectionOffsets() || { start: text.length, end: text.length };
      noteChange(null);
      text = text.slice(0, s.start) + t + text.slice(s.end);
      render({ start: s.start + t.length, end: s.start + t.length });
      afterChange();
    }
    function handleInput() {
      if (composing) return;
      noteChange("type");
      syncFromDOM();
      afterChange();
    }
    root.addEventListener("input", handleInput);
    root.addEventListener("beforeinput", (e) => {
      if (e.inputType === "historyUndo") {
        e.preventDefault();
        undo();
      } else if (e.inputType === "historyRedo") {
        e.preventDefault();
        redo();
      }
    });
    function continueList() {
      const s = selectionOffsets();
      if (!s || s.start !== s.end) return false;
      const lineStart = text.lastIndexOf("\n", s.start - 1) + 1;
      const nl = text.indexOf("\n", s.start);
      const lineEnd = nl === -1 ? text.length : nl;
      const c = listContinuation(text.slice(lineStart, s.start), text.slice(s.start, lineEnd));
      if (!c) return false;
      noteChange(null);
      if (c.kind === "end") {
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
    function wrapPair(e) {
      if (opts.wrapPairs === false || e.isComposing || composing || e.metaKey || e.ctrlKey && !e.altKey) return false;
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
    root.addEventListener("keydown", (e) => {
      if (wrapPair(e)) {
        e.preventDefault();
        return;
      }
      if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey && !e.isComposing && !composing) {
        if (continueList()) e.preventDefault();
        return;
      }
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      if (k === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (k === "y") {
        e.preventDefault();
        redo();
      }
    });
    root.addEventListener("paste", (e) => {
      const files = e.clipboardData ? [...e.clipboardData.files].filter((f) => f.type.startsWith("image/")) : [];
      if (files.length && opts.onPasteFiles) {
        e.preventDefault();
        opts.onPasteFiles(files);
        return;
      }
      e.preventDefault();
      const t = e.clipboardData ? e.clipboardData.getData("text/plain") : "";
      if (t) insertAtSelection(t.replace(/\r\n?/g, "\n"));
    });
    root.addEventListener("drop", (e) => {
      if (e.dataTransfer && e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      const t = e.dataTransfer ? e.dataTransfer.getData("text/plain") : "";
      if (t) insertAtSelection(t.replace(/\r\n?/g, "\n"));
    });
    root.addEventListener("compositionstart", () => {
      composing = true;
    });
    root.addEventListener("compositionend", () => {
      composing = false;
      handleInput();
    });
    render();
    return {
      el: root,
      getValue() {
        return text;
      },
      setValue(t, o = {}) {
        const normalized = String(t == null ? "" : t).replace(/\r\n?/g, "\n");
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
      replaceRange(start, end, insert) {
        start = Math.max(0, Math.min(start, text.length));
        end = Math.max(start, Math.min(end, text.length));
        noteChange(null);
        text = text.slice(0, start) + insert + text.slice(end);
        const caret = start + insert.length;
        render({ start: caret, end: caret });
        afterChange();
      },
      getSelection() {
        if (document.activeElement !== root) return null;
        const s = selectionOffsets();
        if (!s || s.start === s.end) return null;
        return { start: s.start, end: s.end, text: text.slice(s.start, s.end) };
      },
      getCaret() {
        if (document.activeElement !== root) return null;
        const s = selectionOffsets();
        return s ? s.start : null;
      },
      offsetFromPoint(x, y) {
        const doc = document;
        if (doc.caretPositionFromPoint) {
          const p = doc.caretPositionFromPoint(x, y);
          if (p && root.contains(p.offsetNode)) return pointOffset(p.offsetNode, p.offset);
        } else if (document.caretRangeFromPoint) {
          const r = document.caretRangeFromPoint(x, y);
          if (r && root.contains(r.startContainer)) return pointOffset(r.startContainer, r.startOffset);
        }
        return null;
      },
      setSelection,
      focus() {
        root.focus();
      },
      blur() {
        root.blur();
      },
      undo,
      redo
    };
  }

  // src/widget/markdown.ts
  function renderMarkdownSafe(md) {
    const src = md || "";
    if (window.DOMPurify && window.marked) {
      return window.DOMPurify.sanitize(window.marked.parse(src));
    }
    const d = document.createElement("div");
    d.textContent = src;
    return d.innerHTML;
  }

  // src/widget/icons.ts
  var expandIcon = '<svg viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M1 1h5v2H3v3H1zm11 0h5v5h-2V3h-3zM1 12h2v3h3v2H1zm14 3h-3v2h5v-5h-2z"/></svg>';
  var collapseIcon = '<svg viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M6 1H4v3H1v2h5zm6 0h2v3h3v2h-5zM6 17H4v-3H1v-2h5zm6 0h2v-3h3v-2h-5z"/></svg>';
  var imageIcon = '<svg viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M2 2h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zm1 2v8.6l3.3-3.3a1 1 0 0 1 1.4 0L10 11.6l1.3-1.3a1 1 0 0 1 1.4 0L15 12.6V4zm9 1.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z"/></svg>';

  // src/widget/images.ts
  var IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
  var MAX_IMAGE_SIDE = 2400;
  function escapeAlt(s) {
    return s.replace(/[\\[\]]/g, "\\$&").replace(/\s*\n\s*/g, " ");
  }
  function imageMarkdown(alt, url) {
    const dest = /[\s()<>]/.test(url) ? "<" + url.replace(/[<>]/g, encodeURIComponent) + ">" : url;
    return "![" + escapeAlt(alt.trim()) + "](" + dest + ")";
  }
  function publicImageURL(url, cfg, base = window.location.href) {
    if (cfg.publicBase && cfg.mediaPrefix && url.indexOf(cfg.mediaPrefix) === 0) {
      url = cfg.publicBase.replace(/\/+$/, "") + url.slice(cfg.mediaPrefix.replace(/\/+$/, "").length);
    }
    return new URL(url, base).href;
  }
  function asParagraph(text, start, end, snippet) {
    const before = text.slice(0, start);
    const after = text.slice(end);
    const lead = before === "" || /\n\n$/.test(before) ? "" : /\n$/.test(before) ? "\n" : "\n\n";
    const trail = after === "" ? "\n" : /^\n\n/.test(after) ? "" : /^\n/.test(after) ? "\n" : "\n\n";
    return lead + snippet + trail;
  }
  async function prepareImage(file) {
    const photo = file.type === "image/jpeg" || file.type === "image/webp";
    if (file.type === "image/gif" || typeof createImageBitmap !== "function") return file;
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bmp.width, bmp.height));
      if (scale === 1 && !photo) {
        bmp.close();
        return file;
      }
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bmp.width * scale);
      canvas.height = Math.round(bmp.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        bmp.close();
        return file;
      }
      ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      bmp.close();
      return await new Promise((resolve) => {
        canvas.toBlob((blob) => {
          if (!blob || blob.type !== file.type) {
            resolve(file);
            return;
          }
          resolve(new File([blob], file.name, { type: file.type }));
        }, file.type, 0.86);
      });
    } catch {
      return file;
    }
  }
  function uploadImage(cfg, file) {
    const xhr = new XMLHttpRequest();
    const up = { done: Promise.resolve(""), abort: () => xhr.abort(), onProgress: null };
    up.done = new Promise((resolve, reject) => {
      const fd = new FormData();
      fd.append("file", file, file.name || "image");
      for (const [k, v] of Object.entries(cfg.fields || {})) fd.append(k, v);
      xhr.open("POST", cfg.url);
      xhr.responseType = "text";
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && up.onProgress) up.onProgress(e.loaded / e.total);
      };
      xhr.onload = () => {
        if (xhr.status < 200 || xhr.status >= 300) {
          let msg = (xhr.responseText || "").trim().split("\n")[0];
          if (xhr.status === 413) msg = "the file is too large";
          reject(new Error(msg || "server answered " + xhr.status));
          return;
        }
        try {
          const data = JSON.parse(xhr.responseText);
          if (!data || typeof data.url !== "string" || !data.url) throw new Error("no url");
          resolve(data.url);
        } catch {
          reject(new Error("unexpected answer from the server"));
        }
      };
      xhr.onerror = () => reject(new Error("network error"));
      xhr.onabort = () => reject(new Error("cancelled"));
      xhr.send(fd);
    });
    return up;
  }
  var altDialog = null;
  function getAltDialog() {
    if (altDialog) return altDialog;
    const d = document.createElement("dialog");
    d.className = "md-img-dialog";
    d.setAttribute("aria-labelledby", "md-img-dialog-title");
    d.innerHTML = '<form method="dialog" class="md-img-form"><h2 id="md-img-dialog-title" class="md-img-title">Insert image</h2><div class="md-img-preview"><img alt=""></div><label class="md-img-label" for="md-img-alt">Alt text <span class="md-img-req">(required)</span></label><textarea id="md-img-alt" class="md-img-alt" rows="2" required aria-describedby="md-img-alt-hint"></textarea><p id="md-img-alt-hint" class="md-img-hint">Describe what the image shows for people who cannot see it. You can change it later in the markdown.</p><progress class="md-img-progress" max="1"></progress><p class="md-img-msg" role="status" aria-live="polite"></p><div class="md-img-actions"><button type="button" value="cancel" class="md-img-cancel">Cancel</button><button type="submit" value="insert" class="md-img-insert">Insert</button></div></form>';
    document.body.appendChild(d);
    altDialog = d;
    return d;
  }
  function q(root, sel) {
    return root.querySelector(sel);
  }
  function askAlt(file, upload, index, total) {
    const d = getAltDialog();
    const form = q(d, "form");
    const alt = q(d, ".md-img-alt");
    const img = q(d, ".md-img-preview img");
    const progress = q(d, ".md-img-progress");
    const msg = q(d, ".md-img-msg");
    const insertBtn = q(d, ".md-img-insert");
    const cancelBtn = q(d, ".md-img-cancel");
    const objURL = URL.createObjectURL(file);
    q(d, ".md-img-title").textContent = total > 1 ? "Insert image " + (index + 1) + " of " + total : "Insert image";
    img.src = objURL;
    alt.value = "";
    progress.removeAttribute("value");
    progress.hidden = false;
    msg.textContent = "Uploading " + (file.name || "image") + "\u2026";
    msg.classList.remove("is-error");
    insertBtn.disabled = true;
    let url = null;
    let failed = false;
    upload.onProgress = (f) => {
      progress.value = f;
    };
    upload.done.then((u) => {
      url = u;
      progress.value = 1;
      progress.hidden = true;
      msg.textContent = "Uploaded.";
      insertBtn.disabled = false;
    }, (err) => {
      failed = true;
      progress.hidden = true;
      msg.textContent = "Upload failed: " + err.message;
      msg.classList.add("is-error");
      insertBtn.disabled = true;
    });
    return new Promise((resolve) => {
      function finish(result) {
        form.removeEventListener("submit", onSubmit);
        cancelBtn.removeEventListener("click", onCancel);
        d.removeEventListener("cancel", onCancel);
        URL.revokeObjectURL(objURL);
        if (d.open) d.close();
        resolve(result);
      }
      function onSubmit(e) {
        e.preventDefault();
        if (!url || failed) return;
        if (!alt.value.trim()) {
          alt.setCustomValidity("Describe the image in a few words.");
          alt.reportValidity();
          return;
        }
        finish({ alt: alt.value, url });
      }
      function onCancel(e) {
        if (e) e.preventDefault();
        if (!url && !failed) upload.abort();
        finish(null);
      }
      alt.oninput = () => {
        alt.setCustomValidity("");
      };
      alt.onkeydown = (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onSubmit(e);
        }
      };
      form.addEventListener("submit", onSubmit);
      cancelBtn.addEventListener("click", onCancel);
      d.addEventListener("cancel", onCancel);
      d.showModal();
      alt.focus();
    });
  }
  function initImageInsert(wrapper, ed, cfg, lastRange) {
    const btn = wrapper.querySelector(".md-img-btn");
    const input = wrapper.querySelector(".md-img-file");
    const status = wrapper.querySelector(".md-img-status");
    let busy = false;
    if (btn) btn.insertAdjacentHTML("afterbegin", imageIcon);
    function say(text, isError) {
      if (!status) return;
      status.textContent = text;
      status.classList.toggle("is-error", !!isError);
    }
    async function insertFiles(all, at) {
      let files = all.filter((f) => f && f.type && f.type.indexOf("image/") === 0);
      if (!files.length) return;
      if (busy) {
        say("Finish the image being inserted first.", true);
        return;
      }
      const rejected = files.filter((f) => IMAGE_TYPES.indexOf(f.type) === -1);
      files = files.filter((f) => IMAGE_TYPES.indexOf(f.type) !== -1);
      if (rejected.length) {
        say("Only PNG, JPEG, GIF and WebP images can be inserted (" + rejected.map((f) => f.name || f.type).join(", ") + " skipped).", true);
      } else {
        say("");
      }
      if (!files.length) return;
      busy = true;
      let range = at || lastRange();
      let inserted = 0;
      try {
        for (let i = 0; i < files.length; i++) {
          const prepared = await prepareImage(files[i]);
          const res = await askAlt(prepared, uploadImage(cfg, prepared), i, files.length);
          if (!res) continue;
          const md = imageMarkdown(res.alt, publicImageURL(res.url, cfg));
          const snippet = asParagraph(ed.getValue(), range.start, range.end, md);
          ed.replaceRange(range.start, range.end, snippet);
          const caret = range.start + snippet.length;
          range = { start: caret, end: caret };
          inserted++;
        }
        if (inserted) say(inserted === 1 ? "Image inserted." : inserted + " images inserted.");
        ed.setSelection(range.start, range.end);
      } catch (err) {
        say("Could not insert the image: " + (err?.message || err), true);
      } finally {
        busy = false;
      }
    }
    if (btn && input) {
      btn.addEventListener("click", () => input.click());
      input.addEventListener("change", () => {
        const files = Array.from(input.files || []);
        input.value = "";
        void insertFiles(files);
      });
    }
    const hasFiles = (e) => !!e.dataTransfer && Array.from(e.dataTransfer.types || []).indexOf("Files") !== -1;
    ed.el.addEventListener("dragover", (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
      wrapper.classList.add("is-dropping");
    });
    ed.el.addEventListener("dragleave", () => wrapper.classList.remove("is-dropping"));
    ed.el.addEventListener("drop", (e) => {
      wrapper.classList.remove("is-dropping");
      if (!hasFiles(e) || !e.dataTransfer) return;
      e.preventDefault();
      const pos = ed.offsetFromPoint(e.clientX, e.clientY);
      void insertFiles(Array.from(e.dataTransfer.files), pos == null ? void 0 : { start: pos, end: pos });
    });
    return (files) => {
      void insertFiles(files);
    };
  }

  // src/widget/index.ts
  window.renderMarkdownSafe = renderMarkdownSafe;
  window.markdownImageSnippet = imageMarkdown;
  window.markdownPublicImageURL = (url, cfg) => publicImageURL(url, cfg);
  window.initMarkdownEditor = function(fieldName, options) {
    const opts = options || {};
    const wrapper = document.getElementById("md-wrapper-" + fieldName);
    if (!wrapper) return;
    const textarea = wrapper.querySelector(".md-textarea");
    if (!textarea) return;
    const serverValue = textarea.value;
    const input = document.createElement("div");
    input.className = "md-input mde";
    input.setAttribute("contenteditable", "true");
    input.setAttribute("role", "textbox");
    input.setAttribute("aria-multiline", "true");
    input.spellcheck = true;
    textarea.insertAdjacentElement("beforebegin", input);
    textarea.hidden = true;
    textarea.tabIndex = -1;
    const label = textarea.labels && textarea.labels[0];
    if (label) {
      if (!label.id) label.id = (textarea.id || "md-textarea-" + fieldName) + "-label";
      input.setAttribute("aria-labelledby", label.id);
      label.addEventListener("click", (e) => {
        e.preventDefault();
        ed.focus();
      });
    }
    if (textarea.required) input.setAttribute("aria-required", "true");
    let pasteFiles = null;
    const ed = create(input, {
      onChange: (text) => {
        textarea.value = text;
        input.removeAttribute("aria-invalid");
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
      },
      onPasteFiles: (files) => {
        if (pasteFiles) pasteFiles(files);
      }
    });
    ed.setValue(serverValue, { resetHistory: true, notify: false });
    const invalidNote = document.createElement("p");
    invalidNote.className = "md-invalid-note";
    invalidNote.setAttribute("role", "alert");
    input.insertAdjacentElement("afterend", invalidNote);
    textarea.addEventListener("invalid", () => {
      invalidNote.textContent = textarea.validationMessage || "Please fill in this field.";
      input.setAttribute("aria-invalid", "true");
      ed.focus();
    });
    textarea.addEventListener("input", () => {
      invalidNote.textContent = "";
    });
    let range = { start: serverValue.length, end: serverValue.length };
    function liveRange() {
      const s = ed.getSelection();
      if (s) return { start: s.start, end: s.end };
      const c = ed.getCaret();
      return c == null ? null : { start: c, end: c };
    }
    document.addEventListener("selectionchange", () => {
      range = liveRange() || range;
    });
    const tabs = Array.from(wrapper.querySelectorAll(".md-tab"));
    const previewPaneId = "md-preview-" + fieldName;
    function selectTab(tab) {
      for (const t of tabs) {
        const on = t === tab;
        t.classList.toggle("is-active", on);
        t.setAttribute("aria-selected", String(on));
        t.tabIndex = on ? 0 : -1;
      }
      const targetId = tab.dataset.target;
      wrapper.querySelectorAll(".md-pane").forEach((pane) => {
        pane.style.display = pane.id === targetId ? "" : "none";
      });
      if (targetId === previewPaneId) {
        const out = document.getElementById(previewPaneId)?.querySelector(".md-preview-content");
        if (out) out.innerHTML = renderMarkdownSafe(ed.getValue());
      }
    }
    tabs.forEach((tab, i) => {
      tab.addEventListener("click", () => selectTab(tab));
      tab.addEventListener("keydown", (e) => {
        const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
        if (!step) return;
        e.preventDefault();
        const next = tabs[(i + step + tabs.length) % tabs.length];
        selectTab(next);
        next.focus();
      });
    });
    if (opts.draftURL) initDraft(fieldName, wrapper, textarea, ed, opts.draftURL, serverValue);
    if (opts.upload && opts.upload.url) {
      pasteFiles = initImageInsert(wrapper, ed, opts.upload, () => liveRange() || range);
    } else {
      input.addEventListener("drop", (e) => {
        if (e.dataTransfer && Array.from(e.dataTransfer.types).indexOf("Files") !== -1) e.preventDefault();
      });
    }
    initFullscreen(wrapper, ed);
  };
  function initDraft(fieldName, wrapper, textarea, ed, draftURL, serverValue) {
    const note = document.createElement("p");
    note.className = "md-draft-note";
    wrapper.insertAdjacentElement("afterend", note);
    fetch(draftURL).then((res) => res.status === 204 ? null : res.json()).then((draft) => {
      if (!draft || typeof draft.value !== "string" || draft.value === serverValue) return;
      ed.setValue(draft.value);
      window._draftSaved = true;
      const when = draft.updated_at ? " from " + new Date(draft.updated_at).toLocaleString() : "";
      note.innerHTML = "";
      const msg = document.createElement("span");
      msg.className = "md-draft-restored";
      msg.textContent = "Draft restored" + when + ". ";
      const discard = document.createElement("a");
      discard.href = "#";
      discard.id = "md-discard-" + fieldName;
      discard.className = "md-draft-discard";
      discard.textContent = "Discard";
      discard.addEventListener("click", (e) => {
        e.preventDefault();
        void fetch(draftURL, { method: "DELETE" });
        ed.setValue(serverValue);
        note.textContent = "";
      });
      note.append(msg, discard);
    }).catch(() => {
    });
    let timer;
    textarea.addEventListener("input", () => {
      window._draftSaved = false;
      clearTimeout(timer);
      timer = setTimeout(() => {
        void fetch(draftURL, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ value: textarea.value })
        }).then(() => {
          window._draftSaved = true;
        });
        note.innerHTML = '<span class="md-draft-saved">Draft saved</span>';
      }, 1e3);
    });
    const form = textarea.form || document.getElementById("contentForm");
    if (form) {
      form.addEventListener("submit", () => {
        void fetch(draftURL, { method: "DELETE" });
      }, { once: true });
    }
  }
  function initFullscreen(wrapper, ed) {
    const btn = wrapper.querySelector(".md-fs-btn");
    if (!btn) return;
    btn.innerHTML = expandIcon;
    function setUI(on) {
      wrapper.classList.toggle("is-fullscreen", on);
      document.body.style.overflow = on ? "hidden" : "";
      btn.title = on ? "Exit fullscreen (Esc)" : "Fullscreen writing mode";
      btn.setAttribute("aria-label", btn.title);
      btn.setAttribute("aria-pressed", String(on));
      btn.innerHTML = on ? collapseIcon : expandIcon;
    }
    function enter() {
      setUI(true);
      if (wrapper.requestFullscreen) wrapper.requestFullscreen().catch(() => {
      });
      ed.focus();
    }
    function exit() {
      setUI(false);
      if (document.fullscreenElement === wrapper && document.exitFullscreen) document.exitFullscreen().catch(() => {
      });
      ed.focus();
    }
    btn.addEventListener("click", () => {
      if (wrapper.classList.contains("is-fullscreen")) exit();
      else enter();
    });
    document.addEventListener("fullscreenchange", () => {
      if (document.fullscreenElement !== wrapper && wrapper.classList.contains("is-fullscreen")) setUI(false);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && wrapper.classList.contains("is-fullscreen") && document.fullscreenElement !== wrapper && !document.querySelector("dialog[open]")) {
        exit();
      }
    });
  }
})();
