import { type JsonValue } from './jsonModel';

export function nodeMatches(key: string, value: JsonValue, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (key.toLowerCase().includes(q)) return true;
  if (value === null || typeof value !== 'object') return String(value).toLowerCase().includes(q);
  return false;
}

export function subtreeMatches(key: string, value: JsonValue, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (nodeMatches(key, value, q)) return true;
  if (Array.isArray(value)) return value.some((v, i) => subtreeMatches(String(i), v, q));
  if (value !== null && typeof value === 'object')
    return Object.entries(value).some(([k, v]) => subtreeMatches(k, v, q));
  return false;
}
