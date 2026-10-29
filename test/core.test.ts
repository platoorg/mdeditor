import { describe, expect, it } from 'vitest';
import { headingLevel, listContinuation, renderLines, wrapSelection } from '../src/core';

describe('headingLevel', () => {
  it('counts hashes followed by a space', () => {
    expect(headingLevel('# a')).toBe(1);
    expect(headingLevel('###### a')).toBe(6);
    expect(headingLevel('####### a')).toBe(0);
    expect(headingLevel('#a')).toBe(0);
  });
});

describe('renderLines', () => {
  it('renders one div per line with heading classes', () => {
    expect(renderLines('# T\n\nx<y')).toBe('<div class="ln ln--h1"># T</div><div class="ln"><br></div><div class="ln">x&lt;y</div>');
  });
  it('weaves highlight ranges across lines', () => {
    const html = renderLines('ab\ncd', [{ key: 'k', kind: 'issue', start: 1, end: 4 }]);
    expect(html).toBe('<div class="ln">a<mark class="hl hl--issue" data-key="k">b</mark></div><div class="ln"><mark class="hl hl--issue" data-key="k">c</mark>d</div>');
  });
});

describe('listContinuation', () => {
  it('continues bullets, numbers and tasks', () => {
    expect(listContinuation('- a', '')).toEqual({ kind: 'insert', text: '\n- ' });
    expect(listContinuation('  9) a', '')).toEqual({ kind: 'insert', text: '\n  10) ' });
    expect(listContinuation('- [x] done', '')).toEqual({ kind: 'insert', text: '\n- [ ] ' });
  });
  it('ends the list on an empty item', () => {
    expect(listContinuation('- ', '')).toEqual({ kind: 'end', markerLength: 2 });
  });
  it('ignores plain lines and a caret inside the marker', () => {
    expect(listContinuation('text', '')).toBeNull();
    expect(listContinuation('-', ' a')).toBeNull();
  });
});

describe('wrapSelection', () => {
  it('wraps and keeps the inner text selected', () => {
    expect(wrapSelection('say hi now', 4, 6, '(')).toEqual({ text: 'say (hi) now', start: 5, end: 7 });
    expect(wrapSelection('a', 0, 1, '*')).toEqual({ text: '*a*', start: 1, end: 2 });
  });
  it('does nothing without a selection or for other keys', () => {
    expect(wrapSelection('abc', 1, 1, '(')).toBeNull();
    expect(wrapSelection('abc', 0, 1, 'x')).toBeNull();
  });
});
