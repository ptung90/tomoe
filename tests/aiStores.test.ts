import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

vi.mock('../src/lib/ai/openai', () => ({
  streamChat: vi.fn(async (opts: any) => { opts.onDelta('Hi'); return 'Hi'; }),
}));
import { streamChat } from '../src/lib/ai/openai';
import {
  aiToken, aiModel, chatMessages, data,
  setAiConfig, insertAnswer, appendAnswer, sendChat, loadDocument, select,
} from '../src/lib/stores';

beforeEach(() => {
  localStorage.clear();
  loadDocument({ obj: { a: 1 }, words: ['x'] }, null);
  chatMessages.set([]);
  setAiConfig('sk-test', 'gpt-4o-mini');
  (streamChat as any).mockClear();
});

describe('AI stores', () => {
  it('setAiConfig persists token and model', () => {
    setAiConfig('sk-abc', 'gpt-4o');
    expect(get(aiToken)).toBe('sk-abc');
    expect(get(aiModel)).toBe('gpt-4o');
    expect(localStorage.getItem('jte-ai-token')).toBe('sk-abc');
    expect(localStorage.getItem('jte-ai-model')).toBe('gpt-4o');
  });
  it('insertAnswer writes parsed JSON when valid, string otherwise', () => {
    select(['obj']);
    insertAnswer('{"a": 9}');
    expect((get(data) as any).obj).toEqual({ a: 9 });
    select(['words', 0]);
    insertAnswer('hello');
    expect((get(data) as any).words[0]).toBe('hello');
  });
  it('appendAnswer appends items to a selected array (spreads an array answer)', () => {
    loadDocument({ words: ['a', 'b'] }, null);
    select(['words']);
    appendAnswer('["c", "d"]');
    expect((get(data) as any).words).toEqual(['a', 'b', 'c', 'd']);
    appendAnswer('plain');           // non-JSON → pushed as one string
    expect((get(data) as any).words).toEqual(['a', 'b', 'c', 'd', 'plain']);
  });
  it('appendAnswer falls back to replace when the target is not an array', () => {
    loadDocument({ name: 'x' }, null);
    select(['name']);
    appendAnswer('y');
    expect((get(data) as any).name).toBe('y');
  });
  it('sendChat appends an assistant reply via streamChat', async () => {
    select(['words']);
    await sendChat('fill it');
    const msgs = get(chatMessages);
    expect(msgs[msgs.length - 2]).toEqual({ role: 'user', content: 'fill it' });
    expect(msgs[msgs.length - 1]).toEqual({ role: 'assistant', content: 'Hi' });
  });
  it('includes context on first send and after node change, omits on same-node follow-up', async () => {
    select(['words']);
    await sendChat('one');
    await sendChat('two');
    select(['obj']);
    await sendChat('three');
    const calls = (streamChat as any).mock.calls;
    const last = (c: any) => c[0].messages[c[0].messages.length - 1].content as string;
    expect(last(calls[0])).toContain('Context:');
    expect(last(calls[1])).not.toContain('Context:');
    expect(last(calls[2])).toContain('Context:');
  });
});
