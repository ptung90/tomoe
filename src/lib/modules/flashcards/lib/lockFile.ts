// Advisory file lock: a sidecar `<project>.lock` recording who is editing and when, so a second
// person opening the same shared file (Drive/Dropbox) is warned. Pure helpers — no fs here.
export interface FileLock { by: string; at: string }

/** Default staleness window: a lock older than this is treated as abandoned (crash / didn't release). */
export const LOCK_TTL_MS = 30 * 60_000;

export function lockPath(projectPath: string): string {
  return projectPath + '.lock';
}

/** Parse lock-file text into a FileLock, or null if malformed. */
export function parseLock(text: string): FileLock | null {
  try {
    const o = JSON.parse(text);
    if (o && typeof o.by === 'string' && typeof o.at === 'string') return { by: o.by, at: o.at };
  } catch { /* not JSON */ }
  return null;
}

/** True when the lock is older than ttl (or has an unparseable timestamp) — i.e. abandoned. */
export function isStale(lock: FileLock, nowMs: number, ttlMs: number = LOCK_TTL_MS): boolean {
  const t = Date.parse(lock.at);
  return Number.isNaN(t) || nowMs - t > ttlMs;
}

export function isForeign(lock: FileLock, me: string): boolean {
  return lock.by !== me;
}

/** Should we warn on open? Only when someone ELSE holds a still-live lock. */
export function shouldWarn(lock: FileLock | null, me: string, nowMs: number, ttlMs: number = LOCK_TTL_MS): boolean {
  return !!lock && !isStale(lock, nowMs, ttlMs) && isForeign(lock, me);
}
