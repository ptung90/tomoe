import { describe, it, expect } from 'vitest';
import { pathExists, clampPath } from '../src/lib/pathUtils';

const root = { a: { b: [10, 20] } };

describe('pathExists', () => {
  it('true for existing, false for missing', () => {
    expect(pathExists(root, ['a', 'b', 1])).toBe(true);
    expect(pathExists(root, ['a', 'b', 5])).toBe(false);
    expect(pathExists(root, ['x'])).toBe(false);
    expect(pathExists(root, [])).toBe(true);
    expect(pathExists(null, [])).toBe(false);
  });
});

describe('clampPath', () => {
  it('returns the path if it exists', () => {
    expect(clampPath(root, ['a', 'b', 1])).toEqual(['a', 'b', 1]);
  });
  it('walks up to the nearest existing ancestor', () => {
    expect(clampPath(root, ['a', 'b', 9])).toEqual(['a', 'b']);
    expect(clampPath(root, ['a', 'z', 3])).toEqual(['a']);
  });
  it('returns [] when nothing deeper exists', () => {
    expect(clampPath(root, ['nope'])).toEqual([]);
    expect(clampPath(null, ['a'])).toEqual([]);
  });
});
