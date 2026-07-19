import { describe, it, expect } from 'vitest';
import { insertBreak, wrapSmall } from '../src/lib/modules/flashcards/lib/shortEdit';

describe('insertBreak', () => {
  it('inserts <br> at the caret and puts the caret after it', () => {
    const r = insertBreak('Hổ Bengal', 9, 9);
    expect(r.value).toBe('Hổ Bengal<br>');
    expect(r.selStart).toBe(13);
    expect(r.selEnd).toBe(13);
  });
  it('replaces the selection with <br>', () => {
    const r = insertBreak('a  b', 1, 3); // select the two spaces
    expect(r.value).toBe('a<br>b');
    expect(r.selStart).toBe(5);
  });
});

describe('wrapSmall', () => {
  it('wraps the selection in <small>…</small>, keeping it selected', () => {
    const r = wrapSmall('Hổ Bengal (Bengal Tiger)', 10, 24); // select "(Bengal Tiger)"
    expect(r.value).toBe('Hổ Bengal <small>(Bengal Tiger)</small>');
    expect(r.value.slice(r.selStart, r.selEnd)).toBe('(Bengal Tiger)');
  });
  it('with no selection inserts an empty pair and drops the caret inside', () => {
    const r = wrapSmall('Hổ Bengal ', 10, 10);
    expect(r.value).toBe('Hổ Bengal <small></small>');
    expect(r.selStart).toBe(r.selEnd);
    expect(r.value.slice(0, r.selStart)).toBe('Hổ Bengal <small>');
  });
});
