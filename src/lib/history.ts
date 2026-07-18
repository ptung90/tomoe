export interface History<T> { past: T[]; present: T; future: T[] }

/** Cap on retained undo steps — bounds memory, since each snapshot can hold a large document
 *  (e.g. flashcard projects with embedded base64 images). Older steps beyond this are dropped. */
export const HISTORY_CAP = 50;

export function createHistory<T>(initial: T): History<T> {
  return { past: [], present: initial, future: [] };
}
export function push<T>(h: History<T>, next: T): History<T> {
  const past = [...h.past, h.present];
  return { past: past.length > HISTORY_CAP ? past.slice(-HISTORY_CAP) : past, present: next, future: [] };
}
export function undo<T>(h: History<T>): History<T> {
  if (h.past.length === 0) return h;
  const previous = h.past[h.past.length - 1];
  return { past: h.past.slice(0, -1), present: previous, future: [h.present, ...h.future] };
}
export function redo<T>(h: History<T>): History<T> {
  if (h.future.length === 0) return h;
  const next = h.future[0];
  return { past: [...h.past, h.present], present: next, future: h.future.slice(1) };
}
export function canUndo<T>(h: History<T>): boolean { return h.past.length > 0; }
export function canRedo<T>(h: History<T>): boolean { return h.future.length > 0; }
export function reset<T>(h: History<T>, value: T): History<T> {
  return { past: [], present: value, future: [] };
}
