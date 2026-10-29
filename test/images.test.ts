import { describe, expect, it } from 'vitest';
import { asParagraph, imageMarkdown, publicImageURL } from '../src/widget/images';

describe('imageMarkdown', () => {
  it('escapes brackets in alt text and wraps awkward URLs', () => {
    expect(imageMarkdown(' a [b] ', 'https://x/y.png')).toBe('![a \\[b\\]](https://x/y.png)');
    expect(imageMarkdown('a', 'https://x/my file.png')).toBe('![a](<https://x/my file.png>)');
  });
});

describe('publicImageURL', () => {
  it('swaps the media prefix for the public base', () => {
    expect(publicImageURL('/media/site/a.png', { url: '/u', mediaPrefix: '/media/', publicBase: 'https://cdn.example/' }, 'https://admin.example/x'))
      .toBe('https://cdn.example/site/a.png');
  });
  it('makes a relative URL absolute against the admin origin', () => {
    expect(publicImageURL('/media/a.png', { url: '/u' }, 'https://admin.example/x')).toBe('https://admin.example/media/a.png');
  });
});

describe('asParagraph', () => {
  it('adds blank lines around the snippet as needed', () => {
    expect(asParagraph('', 0, 0, 'IMG')).toBe('IMG\n');
    expect(asParagraph('ab', 1, 1, 'IMG')).toBe('\n\nIMG\n\n');
    expect(asParagraph('a\n\nb', 3, 3, 'IMG')).toBe('IMG\n\n');
    expect(asParagraph('a\n', 2, 2, 'IMG')).toBe('\nIMG\n');
  });
});
