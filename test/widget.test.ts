// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

// The markup mdeditor.Render emits (see mdeditor.go), for field "body".
const markup = `<form id="f"><label for="md-textarea-body">Body</label>
<div id="md-wrapper-body" class="markdown-wrapper">
  <div class="md-toolbar">
    <div class="md-tabs" role="tablist">
      <button type="button" class="md-tab is-active" role="tab" aria-selected="true" data-target="md-write-body">Write</button>
      <button type="button" class="md-tab" role="tab" aria-selected="false" tabindex="-1" data-target="md-preview-body">Preview</button>
    </div>
    <div class="md-actions"><button type="button" class="md-fs-btn"></button></div>
  </div>
  <div class="md-pane" id="md-write-body" role="tabpanel">
    <textarea id="md-textarea-body" name="body" class="md-textarea" required>REPLACE</textarea>
  </div>
  <div class="md-pane md-preview-pane" id="md-preview-body" role="tabpanel" style="display:none">
    <div class="md-preview-content"></div>
  </div>
</div></form>`;

beforeAll(async () => {
  // Hosts load these as plain scripts before markdown-editor.js.
  for (const f of ['static/marked.min.js', 'static/purify.min.js']) {
    window.eval(readFileSync(f, 'utf8'));
  }
  await import('../src/widget/index');
});

let textarea: HTMLTextAreaElement;
let input: HTMLElement;

function setup(value: string): void {
  document.body.innerHTML = markup.replace('REPLACE', value);
  window.initMarkdownEditor('body', {});
  textarea = document.querySelector('textarea')!;
  input = document.querySelector('.md-input')!;
}

beforeEach(() => setup('# Hello\n\nworld'));

describe('initMarkdownEditor', () => {
  it('replaces the textarea with the core editor', () => {
    expect(textarea.hidden).toBe(true);
    expect(input.getAttribute('contenteditable')).toBe('true');
    expect(input.querySelector('.ln--h1')?.textContent).toBe('# Hello');
    expect(input.getAttribute('aria-labelledby')).toBe(document.querySelector('label')!.id);
    expect(input.getAttribute('aria-required')).toBe('true');
  });

  it('copies edits back into the textarea the form posts', () => {
    const sel = window.getSelection()!;
    const text = input.children[2].firstChild!;
    const r = document.createRange();
    r.setStart(text, 0);
    r.setEnd(text, 5);
    sel.removeAllRanges();
    sel.addRange(r);
    let inputs = 0;
    textarea.addEventListener('input', () => inputs++);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: '_', bubbles: true, cancelable: true }));
    expect(textarea.value).toBe('# Hello\n\n_world_');
    expect(inputs).toBe(1);
    expect(new FormData(document.querySelector('form')!).get('body')).toBe('# Hello\n\n_world_');
  });

  it('switches tabs with aria-selected and renders a sanitized preview', () => {
    setup('hi <img src=x onerror="alert(1)">');
    const [write, preview] = Array.from(document.querySelectorAll<HTMLButtonElement>('.md-tab'));
    preview.click();
    expect(preview.getAttribute('aria-selected')).toBe('true');
    expect(write.getAttribute('aria-selected')).toBe('false');
    expect(document.getElementById('md-write-body')!.style.display).toBe('none');
    const html = document.querySelector('.md-preview-content')!.innerHTML;
    expect(html).toContain('<img src="x">');
    expect(html).not.toContain('onerror');
    preview.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(write.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(write);
  });

  it('reports a required empty field', () => {
    setup('');
    expect(document.querySelector('form')!.checkValidity()).toBe(false);
    expect(document.querySelector('.md-invalid-note')!.textContent).not.toBe('');
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('exposes the sanitizer and image helpers globally', () => {
    const html = window.renderMarkdownSafe('**b** <script>x()</script>');
    expect(html).toContain('<strong>b</strong>');
    expect(html).not.toContain('script');
    expect(window.markdownImageSnippet('a', 'https://x/y')).toBe('![a](https://x/y)');
  });
});
