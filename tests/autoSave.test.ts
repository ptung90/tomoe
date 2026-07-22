import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writable } from 'svelte/store';
import { shouldAutoSave, startAutoSave } from '../src/lib/autoSave';

describe('shouldAutoSave', () => {
  it('is true only when enabled AND dirty AND a file path exists', () => {
    expect(shouldAutoSave(true, true, true)).toBe(true);
    expect(shouldAutoSave(false, true, true)).toBe(false);
    expect(shouldAutoSave(true, false, true)).toBe(false);
    expect(shouldAutoSave(true, true, false)).toBe(false);
  });
});

describe('startAutoSave', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup() {
    const enabled = writable(true);
    const dirty = writable(false);
    const filePath = writable<string | null>('/p.tomoe.json');
    const save = vi.fn();
    const stop = startAutoSave({ enabled, dirty, filePath, save, delay: 1000 });
    return { enabled, dirty, filePath, save, stop };
  }

  it('saves once, delay after the doc becomes dirty', () => {
    const { dirty, save } = setup();
    dirty.set(true);
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('debounces rapid edits into a single save', () => {
    const { dirty, save } = setup();
    dirty.set(true);
    vi.advanceTimersByTime(500);
    dirty.set(false); dirty.set(true); // another edit — resets the timer
    vi.advanceTimersByTime(500);
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('never saves when disabled', () => {
    const { enabled, dirty, save } = setup();
    enabled.set(false);
    dirty.set(true);
    vi.advanceTimersByTime(2000);
    expect(save).not.toHaveBeenCalled();
  });

  it('never saves an unsaved project (no file path)', () => {
    const { filePath, dirty, save } = setup();
    filePath.set(null);
    dirty.set(true);
    vi.advanceTimersByTime(2000);
    expect(save).not.toHaveBeenCalled();
  });

  it('cancel() stops a pending save and further changes', () => {
    const { dirty, save, stop } = setup();
    dirty.set(true);
    stop();
    vi.advanceTimersByTime(2000);
    expect(save).not.toHaveBeenCalled();
    dirty.set(false); dirty.set(true);
    vi.advanceTimersByTime(2000);
    expect(save).not.toHaveBeenCalled();
  });
});
