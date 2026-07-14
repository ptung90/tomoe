import { describe, it, expect } from 'vitest';
import { itemLabel } from '../src/lib/nodeLabel';

describe('itemLabel', () => {
  it('shows scalar values directly', () => {
    expect(itemLabel('b[ai]t', 0)).toBe('b[ai]t');
    expect(itemLabel(42, 1)).toBe('42');
    expect(itemLabel(true, 2)).toBe('true');
    expect(itemLabel(null, 3)).toBe('null');
    expect(itemLabel('', 4)).toBe('(empty)');
  });
  it('picks a representative field from objects', () => {
    expect(itemLabel({ keySound: 'ai', graphemes: [] }, 0)).toBe('ai');
    expect(itemLabel({ grapheme: 'ee', words: [] }, 0)).toBe('ee');
    expect(itemLabel({ name: 'An', email: 'a@x' }, 0)).toBe('An');
  });
  it('falls back to first scalar field, then key count', () => {
    expect(itemLabel({ qty: 5, note: 'x' }, 0)).toBe('qty: 5');
    expect(itemLabel({ nested: { a: 1 } }, 0)).toBe('{ 1 keys }');
  });
  it('summarizes array items', () => {
    expect(itemLabel([1, 2, 3], 0)).toBe('[ 3 items ]');
  });
});
