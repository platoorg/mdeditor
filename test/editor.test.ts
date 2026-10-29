// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { create, type Editor } from '../src/core';

let root: HTMLElement;
let ed: Editor;
let changes: string[];

function key(k: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
  root.dispatchEvent(e);
  return e;
}

beforeEach(() => {
  document.body.innerHTML = '<div id="ed" contenteditable="true"></div>';
  root = document.getElementById('ed')!;
  changes = [];
  ed = create(root, { onChange: (t) => changes.push(t) });
});

describe('core editor', () => {
  it('renders the canonical line model', () => {
    ed.setValue('# Title\nbody');
    expect(root.children).toHaveLength(2);
    expect(root.children[0].className).toBe('ln ln--h1');
    expect(ed.getValue()).toBe('# Title\nbody');
  });

  it('wraps a selection in a typed pair and keeps it selected', () => {
    ed.setValue('make this bold');
    ed.setSelection(5, 9);
    expect(key('*').defaultPrevented).toBe(true);
    key('*');
    expect(ed.getValue()).toBe('make **this** bold');
    expect(ed.getSelection()?.text).toBe('this');
    expect(changes[changes.length - 1]).toBe('make **this** bold');
  });

  it('wraps with Option held (macOS German brackets) but not with Cmd/Ctrl', () => {
    ed.setValue('abc');
    ed.setSelection(0, 3);
    key('[', { altKey: true });
    expect(ed.getValue()).toBe('[abc]');
    ed.setSelection(1, 4);
    expect(key('(', { metaKey: true }).defaultPrevented).toBe(false);
    expect(key('(', { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(ed.getValue()).toBe('[abc]');
  });

  it('leaves a collapsed caret alone', () => {
    ed.setValue('abc');
    ed.setSelection(1);
    expect(key('(').defaultPrevented).toBe(false);
  });

  it('undoes a wrap in one step', () => {
    ed.setValue('abc', { resetHistory: true });
    ed.setSelection(0, 3);
    key('"');
    ed.undo();
    expect(ed.getValue()).toBe('abc');
  });

  it('can turn wrapping off', () => {
    root.remove();
    document.body.innerHTML = '<div id="ed2" contenteditable="true"></div>';
    root = document.getElementById('ed2')!;
    ed = create(root, { wrapPairs: false });
    ed.setValue('abc');
    ed.setSelection(0, 3);
    expect(key('(').defaultPrevented).toBe(false);
  });

  it('continues a list on Enter', () => {
    ed.setValue('- one');
    ed.setSelection(5);
    expect(key('Enter').defaultPrevented).toBe(true);
    expect(ed.getValue()).toBe('- one\n- ');
  });
});
