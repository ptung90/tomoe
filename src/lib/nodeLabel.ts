import { classify, type JsonValue } from './jsonModel';

// Keys that tend to identify a record, tried in priority order.
const NAME_KEYS = [
  'name', 'title', 'label', 'key', 'id',
  'keySound', 'grapheme', 'word', 'text', 'value',
];

/**
 * A human-friendly label for an array item, so the tree shows meaningful
 * previews (e.g. "ai", "b[ai]t") instead of bare indices.
 */
export function itemLabel(value: JsonValue, index: number): string {
  const kind = classify(value);
  if (kind === 'string') return (value as string).trim() || '(empty)';
  if (kind === 'number' || kind === 'boolean') return String(value);
  if (kind === 'null') return 'null';

  if (kind === 'object') {
    const obj = value as Record<string, JsonValue>;
    for (const key of NAME_KEYS) {
      const v = obj[key];
      if (typeof v === 'string' && v.trim()) return v.trim();
      if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    }
    for (const [key, v] of Object.entries(obj)) {
      if (v === null) return `${key}: null`;
      if (typeof v !== 'object') return `${key}: ${v}`;
    }
    return `{ ${Object.keys(obj).length} keys }`;
  }

  // arrays (of objects / scalars / mixed)
  return `[ ${(value as JsonValue[]).length} items ]`;
}
