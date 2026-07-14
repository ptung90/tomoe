import { describe, it, expect, vi } from 'vitest';
import { keyedDebounce } from '../src/lib/debounce';

describe('keyedDebounce', () => {
  it('coalesces rapid calls with the same key to the last args', () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    const d = keyedDebounce(spy, 300);
    d.call('a', 1); d.call('a', 2); d.call('a', 3);
    vi.advanceTimersByTime(300);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(3);
    vi.useRealTimers();
  });
  it('keeps different keys independent', () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    const d = keyedDebounce(spy, 300);
    d.call('a', 'x'); d.call('b', 'y');
    vi.advanceTimersByTime(300);
    expect(spy).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
  it('flushAll fires pending immediately', () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    const d = keyedDebounce(spy, 300);
    d.call('a', 'x');
    d.flushAll();
    expect(spy).toHaveBeenCalledWith('x');
    vi.useRealTimers();
  });
});
