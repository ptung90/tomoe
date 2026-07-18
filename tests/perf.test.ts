import { describe, it, expect, vi, afterEach } from 'vitest';
import { heapMB, heapSuffix, withTimeout } from '../src/lib/modules/flashcards/lib/perf';

type MemPerf = { memory?: { usedJSHeapSize: number } };
afterEach(() => { delete (performance as unknown as MemPerf).memory; vi.useRealTimers(); });

describe('heapMB / heapSuffix', () => {
  it('returns null / empty when the runtime does not expose memory', () => {
    delete (performance as unknown as MemPerf).memory;
    expect(heapMB()).toBeNull();
    expect(heapSuffix()).toBe('');
  });
  it('reports MB (rounded) when memory is available', () => {
    (performance as unknown as MemPerf).memory = { usedJSHeapSize: 780_400_000 };
    expect(heapMB()).toBe(780);
    expect(heapSuffix()).toBe(' · heap 780 MB');
  });
});

describe('withTimeout', () => {
  it('resolves with the inner value when it settles in time (timer cleared, no reject)', async () => {
    const p = withTimeout(Promise.resolve('ok'), 1000, () => 'stalled');
    await expect(p).resolves.toBe('ok');
  });
  it('propagates the inner rejection unchanged', async () => {
    const p = withTimeout(Promise.reject(new Error('boom')), 1000, () => 'stalled');
    await expect(p).rejects.toThrow('boom');
  });
  it('rejects with the lazily-built message when the inner never settles', async () => {
    vi.useFakeTimers();
    let built = 0;
    const never = new Promise<string>(() => {});
    const p = withTimeout(never, 5000, () => { built++; return `stalled after 5s`; });
    const assertion = expect(p).rejects.toThrow('stalled after 5s');
    await vi.advanceTimersByTimeAsync(5000);
    await assertion;
    expect(built).toBe(1); // message built exactly once, at timeout
  });
});
