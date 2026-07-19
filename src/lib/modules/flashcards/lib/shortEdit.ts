/** Pure text-manipulation helpers for the short-text mini toolbar (RecordField's `text` fields).
 *  Each takes the current value and the textarea selection range and returns the new value plus the
 *  selection to restore, so the component can apply the edit and keep the caret sensible. */

export interface EditResult { value: string; selStart: number; selEnd: number }

/** Insert `<br>` at the caret, replacing any selection; the caret lands just after the tag. */
export function insertBreak(value: string, start: number, end: number): EditResult {
  const tag = '<br>';
  const next = value.slice(0, start) + tag + value.slice(end);
  const caret = start + tag.length;
  return { value: next, selStart: caret, selEnd: caret };
}

/** Wrap the selection in `<small>…</small>` (a subtitle). With no selection, insert an empty pair
 *  and place the caret between the tags so the user can type the subtitle straight away. */
export function wrapSmall(value: string, start: number, end: number): EditResult {
  const open = '<small>';
  const close = '</small>';
  if (start === end) {
    const next = value.slice(0, start) + open + close + value.slice(end);
    const caret = start + open.length;
    return { value: next, selStart: caret, selEnd: caret };
  }
  const sel = value.slice(start, end);
  const next = value.slice(0, start) + open + sel + close + value.slice(end);
  return { value: next, selStart: start + open.length, selEnd: start + open.length + sel.length };
}
