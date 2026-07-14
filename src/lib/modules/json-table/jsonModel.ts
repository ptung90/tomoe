export type JsonValue =
  | string | number | boolean | null
  | JsonValue[]
  | { [k: string]: JsonValue };

export type ValueKind =
  | 'object' | 'array-of-objects' | 'array-of-scalars' | 'array-mixed'
  | 'string' | 'number' | 'boolean' | 'null';

export type Path = (string | number)[];

const isPlainObject = (v: JsonValue): v is { [k: string]: JsonValue } =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

export function classify(v: JsonValue): ValueKind {
  if (v === null) return 'null';
  if (Array.isArray(v)) {
    if (v.length === 0) return 'array-of-scalars';
    const allPlainObjects = v.every(isPlainObject);
    if (allPlainObjects) return 'array-of-objects';
    const allScalars = v.every((x) => x === null || typeof x !== 'object');
    if (allScalars) return 'array-of-scalars';
    return 'array-mixed';
  }
  if (isPlainObject(v)) return 'object';
  return typeof v as 'string' | 'number' | 'boolean';
}

export function getAtPath(root: JsonValue, path: Path): JsonValue {
  let cur: JsonValue = root;
  for (const key of path) {
    if (Array.isArray(cur) && typeof key === 'number') cur = cur[key];
    else if (cur !== null && typeof cur === 'object' && typeof key === 'string')
      cur = (cur as { [k: string]: JsonValue })[key];
    else throw new Error(`Invalid path segment: ${String(key)}`);
  }
  return cur;
}

export function updateAtPath(root: JsonValue, path: Path, newValue: JsonValue): JsonValue {
  if (path.length === 0) return newValue;
  const [head, ...rest] = path;
  if (Array.isArray(root) && typeof head === 'number') {
    const copy = root.slice();
    copy[head] = updateAtPath(root[head], rest, newValue);
    return copy;
  }
  if (root !== null && typeof root === 'object' && typeof head === 'string') {
    const obj = root as { [k: string]: JsonValue };
    // Rebuild in original key order to preserve insertion order.
    const copy: { [k: string]: JsonValue } = {};
    for (const k of Object.keys(obj)) {
      copy[k] = k === head ? updateAtPath(obj[k], rest, newValue) : obj[k];
    }
    return copy;
  }
  throw new Error(`Invalid path segment: ${String(head)}`);
}

export function objectKeyUnion(arr: JsonValue[]): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const item of arr) {
    if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
      for (const k of Object.keys(item)) {
        if (!seen.has(k)) { seen.add(k); keys.push(k); }
      }
    }
  }
  return keys;
}

function emptyLike(v: JsonValue): JsonValue {
  if (typeof v === 'string') return '';
  if (typeof v === 'number') return 0;
  if (typeof v === 'boolean') return false;
  if (Array.isArray(v)) return [];
  if (v !== null && typeof v === 'object') return {};
  return null;
}

export function buildAddTemplate(arr: JsonValue[]): JsonValue {
  const kind = classify(arr);
  if (kind === 'array-of-objects') {
    const keys = objectKeyUnion(arr);
    const template: { [k: string]: JsonValue } = {};
    for (const k of keys) {
      // Use the first item that has this key to infer the empty type.
      const sample = arr.find(
        (it) => it !== null && typeof it === 'object' && !Array.isArray(it) && k in it);
      const sampleVal = sample ? (sample as { [k: string]: JsonValue })[k] : '';
      template[k] = emptyLike(sampleVal);
    }
    return template;
  }
  return ''; // scalar array or empty array -> empty string
}

export function addArrayItem(root: JsonValue, arrayPath: Path): JsonValue {
  const arr = getAtPath(root, arrayPath);
  if (!Array.isArray(arr)) throw new Error('addArrayItem: target is not an array');
  const next = [...arr, buildAddTemplate(arr)];
  return updateAtPath(root, arrayPath, next);
}

export function removeArrayItem(root: JsonValue, arrayPath: Path, index: number): JsonValue {
  const arr = getAtPath(root, arrayPath);
  if (!Array.isArray(arr)) throw new Error('removeArrayItem: target is not an array');
  const next = arr.filter((_, i) => i !== index);
  return updateAtPath(root, arrayPath, next);
}
