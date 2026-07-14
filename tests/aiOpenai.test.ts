import { describe, it, expect } from 'vitest';
import { parseSseEvents, describeError } from '../src/lib/ai/openai';

describe('parseSseEvents', () => {
  it('extracts delta contents and detects [DONE]', () => {
    const text =
      'data: {"choices":[{"delta":{"content":"He"}}]}\n' +
      'data: {"choices":[{"delta":{"content":"llo"}}]}\n' +
      'data: [DONE]';
    const r = parseSseEvents(text);
    expect(r.deltas).toEqual(['He', 'llo']);
    expect(r.done).toBe(true);
  });
  it('ignores non-data and unparseable lines', () => {
    const r = parseSseEvents(': keep-alive\ndata: {bad json');
    expect(r.deltas).toEqual([]);
    expect(r.done).toBe(false);
  });
});

describe('describeError', () => {
  it('maps common statuses', () => {
    expect(describeError(401)).toMatch(/token/i);
    expect(describeError(429)).toMatch(/rate|quota/i);
    expect(describeError(500, 'boom')).toMatch(/boom|error/i);
  });
});
