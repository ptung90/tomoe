import { describe, it, expect } from 'vitest';
import { serialize } from '../src/lib/modules/json-table/io';

describe('serialize', () => {
  it('produces 2-space JSON with trailing newline', () => {
    expect(serialize({ a: 1 })).toBe('{\n  "a": 1\n}\n');
  });
});
