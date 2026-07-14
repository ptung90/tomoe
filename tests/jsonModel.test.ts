import { describe, it, expect } from 'vitest';
import {
  classify,
  getAtPath,
  updateAtPath,
  buildAddTemplate,
  addArrayItem,
  removeArrayItem,
  objectKeyUnion,
} from '../src/lib/modules/json-table/jsonModel';

describe('classify', () => {
  it('classifies scalars', () => {
    expect(classify('x')).toBe('string');
    expect(classify(3)).toBe('number');
    expect(classify(true)).toBe('boolean');
    expect(classify(null)).toBe('null');
  });
  it('classifies plain objects', () => {
    expect(classify({ a: 1 })).toBe('object');
  });
  it('classifies array of scalars', () => {
    expect(classify(['a', 'b'])).toBe('array-of-scalars');
    expect(classify([])).toBe('array-of-scalars');
  });
  it('classifies array of objects', () => {
    expect(classify([{ a: 1 }, { a: 2 }])).toBe('array-of-objects');
  });
  it('classifies mixed/nested arrays', () => {
    expect(classify([1, { a: 1 }])).toBe('array-mixed');
    expect(classify([[1], [2]])).toBe('array-mixed');
  });
});

describe('getAtPath', () => {
  it('reads nested values', () => {
    const root = { a: { b: [10, 20] } };
    expect(getAtPath(root, ['a', 'b', 1])).toBe(20);
    expect(getAtPath(root, [])).toBe(root);
  });
});

describe('updateAtPath', () => {
  it('updates a nested leaf without mutating input', () => {
    const root = { a: { b: [10, 20] } };
    const next = updateAtPath(root, ['a', 'b', 1], 99);
    expect(getAtPath(next, ['a', 'b', 1])).toBe(99);
    expect(root.a.b[1]).toBe(20); // original untouched
  });
  it('preserves key order of the touched object', () => {
    const root = { first: 1, second: 2, third: 3 };
    const next = updateAtPath(root, ['second'], 20) as Record<string, number>;
    expect(Object.keys(next)).toEqual(['first', 'second', 'third']);
  });
  it('replaces the whole root when path is empty', () => {
    expect(updateAtPath({ a: 1 }, [], { b: 2 })).toEqual({ b: 2 });
  });
});

describe('objectKeyUnion', () => {
  it('unions keys in first-seen order', () => {
    expect(objectKeyUnion([{ a: 1, b: 2 }, { b: 3, c: 4 }])).toEqual(['a', 'b', 'c']);
  });
});

describe('buildAddTemplate', () => {
  it('builds empty object matching union with type-appropriate empties', () => {
    expect(buildAddTemplate([{ name: 'x', age: 5, ok: true }]))
      .toEqual({ name: '', age: 0, ok: false });
  });
  it('returns empty string for scalar arrays', () => {
    expect(buildAddTemplate(['a', 'b'])).toBe('');
  });
  it('returns empty string for an empty array', () => {
    expect(buildAddTemplate([])).toBe('');
  });
});

describe('addArrayItem / removeArrayItem', () => {
  it('appends a template row to a nested array of objects', () => {
    const root = { items: [{ name: 'a', qty: 1 }] };
    const next = addArrayItem(root, ['items']);
    expect(getAtPath(next, ['items', 1])).toEqual({ name: '', qty: 0 });
    expect((root.items as unknown[]).length).toBe(1); // input untouched
  });
  it('appends "" to a scalar array', () => {
    const root = { words: ['cat'] };
    const next = addArrayItem(root, ['words']);
    expect(getAtPath(next, ['words'])).toEqual(['cat', '']);
  });
  it('removes an item by index', () => {
    const root = { words: ['a', 'b', 'c'] };
    const next = removeArrayItem(root, ['words'], 1);
    expect(getAtPath(next, ['words'])).toEqual(['a', 'c']);
  });
});
