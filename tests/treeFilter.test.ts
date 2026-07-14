import { describe, it, expect } from 'vitest';
import { nodeMatches, subtreeMatches } from '../src/lib/treeFilter';

describe('treeFilter', () => {
  it('nodeMatches key or scalar value, case-insensitive', () => {
    expect(nodeMatches('keySound', 'ai', 'sound')).toBe(true);
    expect(nodeMatches('x', 'Hello', 'hell')).toBe(true);
    expect(nodeMatches('x', 5, '5')).toBe(true);
    expect(nodeMatches('x', 'nope', 'zzz')).toBe(false);
  });
  it('subtreeMatches finds deep matches', () => {
    const v = { cards: [{ words: ['b[ai]t', 'rain'] }] };
    expect(subtreeMatches('folders', v, 'rain')).toBe(true);
    expect(subtreeMatches('folders', v, 'cards')).toBe(true);
    expect(subtreeMatches('folders', v, 'zzz')).toBe(false);
  });
});
