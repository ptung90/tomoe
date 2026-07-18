import { describe, it, expect } from 'vitest';
import { createHistory, push, undo, redo, canUndo, canRedo, reset, HISTORY_CAP } from '../src/lib/history';

describe('history', () => {
  it('starts with no undo/redo', () => {
    const h = createHistory(0);
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
    expect(h.present).toBe(0);
  });
  it('push then undo restores previous, redo re-applies', () => {
    let h = createHistory(0);
    h = push(h, 1); h = push(h, 2);
    expect(h.present).toBe(2);
    h = undo(h); expect(h.present).toBe(1); expect(canRedo(h)).toBe(true);
    h = undo(h); expect(h.present).toBe(0); expect(canUndo(h)).toBe(false);
    h = redo(h); expect(h.present).toBe(1);
  });
  it('push clears the redo stack', () => {
    let h = createHistory(0);
    h = push(h, 1); h = undo(h); h = push(h, 9);
    expect(h.present).toBe(9);
    expect(canRedo(h)).toBe(false);
  });
  it('undo/redo are no-ops at the ends', () => {
    let h = createHistory(5);
    expect(undo(h).present).toBe(5);
    expect(redo(h).present).toBe(5);
  });
  it('caps the undo stack at HISTORY_CAP (drops oldest, keeps present)', () => {
    let h = createHistory(0);
    for (let i = 1; i <= HISTORY_CAP + 20; i++) h = push(h, i);
    expect(h.past.length).toBe(HISTORY_CAP);          // bounded
    expect(h.present).toBe(HISTORY_CAP + 20);          // latest kept
    expect(h.past[0]).toBe(20);                        // oldest 20 dropped (0..19)
  });
  it('reset clears both stacks with a new baseline', () => {
    let h = createHistory(0); h = push(h, 1);
    h = reset(h, 100);
    expect(h.present).toBe(100);
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
  });
});
