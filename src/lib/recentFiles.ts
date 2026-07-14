import { writable, type Writable } from 'svelte/store';

export interface RecentFile { path: string; name: string; ts: number }

const KEY = 'tomoe.recentFiles';
const CAP = 10;

/** Last path segment, tolerant of both / and \ separators. */
export function basename(path: string): string {
  const parts = path.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] || path;
}

/** Pure: new list with `path` recorded most-recent-first, deduped by path, capped at 10. */
export function pushRecent(list: RecentFile[], path: string, ts: number): RecentFile[] {
  const entry: RecentFile = { path, name: basename(path), ts };
  return [entry, ...list.filter((r) => r.path !== path)].slice(0, CAP);
}

function load(): RecentFile[] {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((r) => r && typeof r.path === 'string') : [];
  } catch { return []; }
}
function persist(list: RecentFile[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* ignore storage errors */ }
}

export const recentFiles: Writable<RecentFile[]> = writable(load());

export function recordRecent(path: string): void {
  recentFiles.update((list) => { const next = pushRecent(list, path, Date.now()); persist(next); return next; });
}
export function removeRecent(path: string): void {
  recentFiles.update((list) => { const next = list.filter((r) => r.path !== path); persist(next); return next; });
}
export function clearRecent(): void { recentFiles.set([]); persist([]); }
