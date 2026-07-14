import { describe, it, expect } from 'vitest';
import { isLongText, truncate } from '../src/lib/textUtils';

describe('isLongText', () => {
  it('true for long or multiline strings', () => {
    expect(isLongText('short')).toBe(false);
    expect(isLongText('a'.repeat(61))).toBe(true);
    expect(isLongText('line1\nline2')).toBe(true);
    expect(isLongText(12345)).toBe(false);
    expect(isLongText(null)).toBe(false);
  });
});

describe('truncate', () => {
  it('adds ellipsis past max', () => {
    expect(truncate('hello', 40)).toBe('hello');
    expect(truncate('abcdef', 4)).toBe('abc…');
  });
});
