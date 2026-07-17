import { describe, it, expect } from 'vitest';
import { hashContent, hasExternalChange } from '../src/lib/modules/flashcards/lib/fileSync';

describe('fileSync.hashContent', () => {
  it('is deterministic for the same text', () => {
    expect(hashContent('{"a":1}')).toBe(hashContent('{"a":1}'));
  });
  it('differs for different text', () => {
    expect(hashContent('{"a":1}')).not.toBe(hashContent('{"a":2}'));
  });
});

describe('fileSync.hasExternalChange', () => {
  it('null baseline is never a conflict', () => {
    expect(hasExternalChange(null, 'anything')).toBe(false);
  });
  it('unchanged content is not a conflict', () => {
    const t = '{"a":1}';
    expect(hasExternalChange(hashContent(t), t)).toBe(false);
  });
  it('changed content is a conflict', () => {
    expect(hasExternalChange(hashContent('{"a":1}'), '{"a":2}')).toBe(true);
  });
});
