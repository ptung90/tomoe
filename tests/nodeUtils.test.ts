import { describe, it, expect } from 'vitest';
import { hasContainerChild } from '../src/lib/modules/json-table/nodeUtils';

describe('hasContainerChild', () => {
  it('true for objects with a nested object or array', () => {
    expect(hasContainerChild({ a: 1, b: { c: 2 } })).toBe(true);
    expect(hasContainerChild({ a: 1, list: [1, 2] })).toBe(true);
  });
  it('false for all-scalar objects', () => {
    expect(hasContainerChild({ a: 1, b: 'x', c: true, d: null })).toBe(false);
  });
  it('false for non-objects', () => {
    expect(hasContainerChild([1, 2])).toBe(false);
    expect(hasContainerChild('x')).toBe(false);
    expect(hasContainerChild(null)).toBe(false);
  });
});
