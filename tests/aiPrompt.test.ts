import { describe, it, expect } from 'vitest';
import { buildContext, buildMessages } from '../src/lib/ai/prompt';

const doc = {
  title: 'Reading Folders',
  notes: ['lowercased'],
  folders: [{ keySound: 'ai', cards: [{ grapheme: 'ai', words: ['b[ai]t'] }] }],
};

describe('buildContext', () => {
  it('includes doc meta, ancestor scalars, and the selected node', () => {
    const ctx = buildContext(doc, ['folders', 0, 'cards', 0, 'words']);
    expect(ctx).toContain('Reading Folders');
    expect(ctx).toContain('keySound');
    expect(ctx).toContain('grapheme');
    expect(ctx).toContain('b[ai]t');
  });
  it('does not dump the whole folders array as meta', () => {
    const ctx = buildContext(doc, ['title']);
    expect(ctx).not.toContain('b[ai]t');
  });
  it('returns empty string for no document', () => {
    expect(buildContext(null, [])).toBe('');
  });
});

describe('buildMessages', () => {
  it('puts system first and context in the final user turn', () => {
    const msgs = buildMessages([{ role: 'user', content: 'hi' }], 'fill it', 'CTX');
    expect(msgs[0].role).toBe('system');
    expect(msgs[1]).toEqual({ role: 'user', content: 'hi' });
    expect(msgs[2].role).toBe('user');
    expect(msgs[2].content).toContain('CTX');
    expect(msgs[2].content).toContain('fill it');
  });
  it('omits context block when context is null', () => {
    const msgs = buildMessages([], 'plain', null);
    expect(msgs[msgs.length - 1].content).toBe('plain');
  });
});
