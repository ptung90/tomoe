import { type JsonValue, type Path } from './jsonModel';

export function pathExists(root: JsonValue | null, path: Path): boolean {
  if (root === null) return false;
  let cur: JsonValue = root;
  for (const key of path) {
    if (Array.isArray(cur) && typeof key === 'number') {
      if (key < 0 || key >= cur.length) return false;
      cur = cur[key];
    } else if (cur !== null && typeof cur === 'object' && typeof key === 'string') {
      if (!Object.prototype.hasOwnProperty.call(cur, key)) return false;
      cur = (cur as { [k: string]: JsonValue })[key];
    } else {
      return false;
    }
  }
  return true;
}

export function clampPath(root: JsonValue | null, path: Path): Path {
  if (root === null) return [];
  for (let len = path.length; len >= 0; len--) {
    const candidate = path.slice(0, len);
    if (pathExists(root, candidate)) return candidate;
  }
  return [];
}
