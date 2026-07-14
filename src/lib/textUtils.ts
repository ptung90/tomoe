/** A string is "long" (needs a roomy editor) if it wraps or exceeds this length. */
export const LONG_TEXT_THRESHOLD = 60;

export function isLongText(v: unknown): boolean {
  return typeof v === 'string' && (v.length > LONG_TEXT_THRESHOLD || v.includes('\n'));
}

export function truncate(s: string, max = 40): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
