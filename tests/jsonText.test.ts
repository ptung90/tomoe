import { describe, it, expect } from 'vitest';
import { formatNode, validateJson, autoFix } from '../src/lib/jsonText';

describe('formatNode', () => {
  it('pretty-prints with 2 spaces', () => {
    expect(formatNode({ a: 1 })).toBe('{\n  "a": 1\n}');
  });
});

describe('validateJson', () => {
  it('parses valid JSON', () => {
    const r = validateJson('{"a": 1}');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ a: 1 });
  });
  it('reports an error for invalid JSON', () => {
    const r = validateJson('{"a":}');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(typeof r.error).toBe('string');
  });
});

describe('autoFix', () => {
  it('fixes trailing commas', () => {
    const r = autoFix('{"a": 1,}');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ a: 1 });
  });
  it('fixes single quotes and unquoted keys', () => {
    const r = autoFix("{a: 'x'}");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ a: 'x' });
  });
  it('fixes // comments', () => {
    const r = autoFix('{\n  "a": 1 // note\n}');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ a: 1 });
  });
  it('fails on truly broken input', () => {
    const r = autoFix('{a: ');
    expect(r.ok).toBe(false);
  });
});
