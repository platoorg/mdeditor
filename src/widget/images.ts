// Image insertion for the widget: the Image button, paste and drop all
// upload the file to the host (see mdeditor.UploadOptions), ask for alt
// text, and insert ![alt](url) as its own paragraph.

import type { Editor } from '../core/editor';
import { imageIcon } from './icons';

export interface UploadConfig {
  url: string;
  fields?: Record<string, string>;
  mediaPrefix?: string;
  publicBase?: string;
}

// Formats the upload endpoint stores (it sniffs bytes and refuses the rest).
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
// Longest side an inserted image is scaled down to before upload. Markdown
// images are served as-is (no variants), so a 6000px phone photo would
// otherwise be shipped whole to every reader.
const MAX_IMAGE_SIDE = 2400;

// escapeAlt keeps alt text from closing the ![...] bracket early.
function escapeAlt(s: string): string {
  return s.replace(/[\\[\]]/g, '\\$&').replace(/\s*\n\s*/g, ' ');
}

/** The snippet inserted for one uploaded image. */
export function imageMarkdown(alt: string, url: string): string {
  const dest = /[\s()<>]/.test(url) ? '<' + url.replace(/[<>]/g, encodeURIComponent) + '>' : url;
  return '![' + escapeAlt(alt.trim()) + '](' + dest + ')';
}

/** Maps the address the upload endpoint answered with to the one the
 * markdown should carry: MediaPrefix is swapped for PublicBase, and a
 * still-relative URL is made absolute, because other sites read it. */
export function publicImageURL(url: string, cfg: UploadConfig, base = window.location.href): string {
  if (cfg.publicBase && cfg.mediaPrefix && url.indexOf(cfg.mediaPrefix) === 0) {
    url = cfg.publicBase.replace(/\/+$/, '') + url.slice(cfg.mediaPrefix.replace(/\/+$/, '').length);
  }
  return new URL(url, base).href;
}

/** Places `snippet` over text[start, end) as its own paragraph: blank
 * lines are added before and after as needed. */
export function asParagraph(text: string, start: number, end: number, snippet: string): string {
  const before = text.slice(0, start);
  const after = text.slice(end);
  const lead = before === '' || /\n\n$/.test(before) ? '' : (/\n$/.test(before) ? '\n' : '\n\n');
  const trail = after === '' ? '\n' : (/^\n\n/.test(after) ? '' : (/^\n/.test(after) ? '\n' : '\n\n'));
  return lead + snippet + trail;
}

// prepareImage scales photos down to MAX_IMAGE_SIDE and re-encodes
// JPEG/WebP, which also drops their EXIF block (camera, GPS position).
// PNG is only re-encoded when it is too large; GIF is never touched so
// animations survive. Any failure falls back to the original file.
async function prepareImage(file: File): Promise<File> {
  const photo = file.type === 'image/jpeg' || file.type === 'image/webp';
  if (file.type === 'image/gif' || typeof createImageBitmap !== 'function') return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bmp.width, bmp.height));
    if (scale === 1 && !photo) { bmp.close(); return file; }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) { bmp.close(); return file; }
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    return await new Promise<File>((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob || blob.type !== file.type) { resolve(file); return; }
        resolve(new File([blob], file.name, { type: file.type }));
      }, file.type, 0.86);
    });
  } catch {
    return file;
  }
}

interface Upload {
  done: Promise<string>;
  abort(): void;
  onProgress: ((fraction: number) => void) | null;
}

// uploadImage POSTs one file. done resolves with the stored URL or rejects
// with a message fit to show the author. XHR rather than fetch for the
// upload progress events.
function uploadImage(cfg: UploadConfig, file: File): Upload {
  const xhr = new XMLHttpRequest();
  const up: Upload = { done: Promise.resolve(''), abort: () => xhr.abort(), onProgress: null };
  up.done = new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append('file', file, file.name || 'image');
    for (const [k, v] of Object.entries(cfg.fields || {})) fd.append(k, v);
    xhr.open('POST', cfg.url);
    xhr.responseType = 'text';
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && up.onProgress) up.onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        let msg = (xhr.responseText || '').trim().split('\n')[0];
        if (xhr.status === 413) msg = 'the file is too large';
        reject(new Error(msg || 'server answered ' + xhr.status));
        return;
      }
      try {
        const data = JSON.parse(xhr.responseText);
        if (!data || typeof data.url !== 'string' || !data.url) throw new Error('no url');
        resolve(data.url);
      } catch {
        reject(new Error('unexpected answer from the server'));
      }
    };
    xhr.onerror = () => reject(new Error('network error'));
    xhr.onabort = () => reject(new Error('cancelled'));
    xhr.send(fd);
  });
  return up;
}

// One <dialog> per page, appended to <body> so it is not a form nested
// inside the host's content form.
let altDialog: HTMLDialogElement | null = null;
function getAltDialog(): HTMLDialogElement {
  if (altDialog) return altDialog;
  const d = document.createElement('dialog');
  d.className = 'md-img-dialog';
  d.setAttribute('aria-labelledby', 'md-img-dialog-title');
  d.innerHTML =
    '<form method="dialog" class="md-img-form">' +
    '<h2 id="md-img-dialog-title" class="md-img-title">Insert image</h2>' +
    '<div class="md-img-preview"><img alt=""></div>' +
    '<label class="md-img-label" for="md-img-alt">Alt text <span class="md-img-req">(required)</span></label>' +
    '<textarea id="md-img-alt" class="md-img-alt" rows="2" required aria-describedby="md-img-alt-hint"></textarea>' +
    '<p id="md-img-alt-hint" class="md-img-hint">Describe what the image shows for people who cannot see it. You can change it later in the markdown.</p>' +
    '<progress class="md-img-progress" max="1"></progress>' +
    '<p class="md-img-msg" role="status" aria-live="polite"></p>' +
    '<div class="md-img-actions">' +
    '<button type="button" value="cancel" class="md-img-cancel">Cancel</button>' +
    '<button type="submit" value="insert" class="md-img-insert">Insert</button>' +
    '</div></form>';
  document.body.appendChild(d);
  altDialog = d;
  return d;
}

function q<T extends Element>(root: ParentNode, sel: string): T {
  return root.querySelector(sel) as T;
}

// askAlt shows the dialog for one file while its upload runs. Resolves with
// the alt text and URL once both are done, or null when cancelled.
function askAlt(file: File, upload: Upload, index: number, total: number): Promise<{ alt: string; url: string } | null> {
  const d = getAltDialog();
  const form = q<HTMLFormElement>(d, 'form');
  const alt = q<HTMLTextAreaElement>(d, '.md-img-alt');
  const img = q<HTMLImageElement>(d, '.md-img-preview img');
  const progress = q<HTMLProgressElement>(d, '.md-img-progress');
  const msg = q<HTMLElement>(d, '.md-img-msg');
  const insertBtn = q<HTMLButtonElement>(d, '.md-img-insert');
  const cancelBtn = q<HTMLButtonElement>(d, '.md-img-cancel');
  const objURL = URL.createObjectURL(file);

  q<HTMLElement>(d, '.md-img-title').textContent =
    total > 1 ? 'Insert image ' + (index + 1) + ' of ' + total : 'Insert image';
  img.src = objURL;
  alt.value = '';
  progress.removeAttribute('value');
  progress.hidden = false;
  msg.textContent = 'Uploading ' + (file.name || 'image') + '…';
  msg.classList.remove('is-error');
  insertBtn.disabled = true;

  let url: string | null = null;
  let failed = false;
  upload.onProgress = (f) => { progress.value = f; };
  upload.done.then((u) => {
    url = u;
    progress.value = 1;
    progress.hidden = true;
    msg.textContent = 'Uploaded.';
    insertBtn.disabled = false;
  }, (err: Error) => {
    failed = true;
    progress.hidden = true;
    msg.textContent = 'Upload failed: ' + err.message;
    msg.classList.add('is-error');
    insertBtn.disabled = true;
  });

  return new Promise((resolve) => {
    function finish(result: { alt: string; url: string } | null): void {
      form.removeEventListener('submit', onSubmit);
      cancelBtn.removeEventListener('click', onCancel);
      d.removeEventListener('cancel', onCancel);
      URL.revokeObjectURL(objURL);
      if (d.open) d.close();
      resolve(result);
    }
    function onSubmit(e: Event): void {
      e.preventDefault();
      if (!url || failed) return;
      if (!alt.value.trim()) {
        alt.setCustomValidity('Describe the image in a few words.');
        alt.reportValidity();
        return;
      }
      finish({ alt: alt.value, url });
    }
    function onCancel(e?: Event): void {
      if (e) e.preventDefault();
      if (!url && !failed) upload.abort();
      finish(null);
    }
    alt.oninput = () => { alt.setCustomValidity(''); };
    // Enter inserts; alt text needs no line breaks.
    alt.onkeydown = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); onSubmit(e); }
    };
    form.addEventListener('submit', onSubmit);
    cancelBtn.addEventListener('click', onCancel);
    d.addEventListener('cancel', onCancel);
    d.showModal();
    alt.focus();
  });
}

/** Wires the Image button, paste and drop for one widget. Returns the
 * handler for pasted files, which the editor core reports. */
export function initImageInsert(
  wrapper: HTMLElement,
  ed: Editor,
  cfg: UploadConfig,
  lastRange: () => { start: number; end: number },
): (files: File[]) => void {
  const btn = wrapper.querySelector<HTMLButtonElement>('.md-img-btn');
  const input = wrapper.querySelector<HTMLInputElement>('.md-img-file');
  const status = wrapper.querySelector<HTMLElement>('.md-img-status');
  let busy = false;
  if (btn) btn.insertAdjacentHTML('afterbegin', imageIcon);

  function say(text: string, isError?: boolean): void {
    if (!status) return;
    status.textContent = text;
    status.classList.toggle('is-error', !!isError);
  }

  // insertFiles handles a batch one image at a time, so every image gets
  // its own alt text and lands where the caret was.
  async function insertFiles(all: File[], at?: { start: number; end: number }): Promise<void> {
    let files = all.filter((f) => f && f.type && f.type.indexOf('image/') === 0);
    if (!files.length) return;
    if (busy) { say('Finish the image being inserted first.', true); return; }
    const rejected = files.filter((f) => IMAGE_TYPES.indexOf(f.type) === -1);
    files = files.filter((f) => IMAGE_TYPES.indexOf(f.type) !== -1);
    if (rejected.length) {
      say('Only PNG, JPEG, GIF and WebP images can be inserted (' +
        rejected.map((f) => f.name || f.type).join(', ') + ' skipped).', true);
    } else {
      say('');
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
      if (inserted) say(inserted === 1 ? 'Image inserted.' : inserted + ' images inserted.');
      ed.setSelection(range.start, range.end);
    } catch (err) {
      say('Could not insert the image: ' + ((err as Error)?.message || err), true);
    } finally {
      busy = false;
    }
  }

  if (btn && input) {
    btn.addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
      const files = Array.from(input.files || []);
      // Clear it so the host's dirty check never sees a pending file and
      // picking the same file again still fires change.
      input.value = '';
      void insertFiles(files);
    });
  }

  const hasFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types || []).indexOf('Files') !== -1;
  ed.el.addEventListener('dragover', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    wrapper.classList.add('is-dropping');
  });
  ed.el.addEventListener('dragleave', () => wrapper.classList.remove('is-dropping'));
  ed.el.addEventListener('drop', (e) => {
    wrapper.classList.remove('is-dropping');
    if (!hasFiles(e) || !e.dataTransfer) return;
    e.preventDefault();
    // Insert where the file was dropped when the browser can tell.
    const pos = ed.offsetFromPoint(e.clientX, e.clientY);
    void insertFiles(Array.from(e.dataTransfer.files), pos == null ? undefined : { start: pos, end: pos });
  });

  return (files) => { void insertFiles(files); };
}
