import { classify, type JsonValue } from './jsonModel';

export function hasContainerChild(v: JsonValue): boolean {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
  return Object.values(v).some((c) => {
    const k = classify(c);
    return k === 'object' || k.startsWith('array');
  });
}
