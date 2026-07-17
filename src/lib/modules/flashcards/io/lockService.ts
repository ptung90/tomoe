import { readTextFile, writeTextFile, remove } from '@tauri-apps/plugin-fs';
import { get } from 'svelte/store';
import * as S from '../stores';
import { userName } from '../../../shell';
import { lockPath, parseLock, shouldWarn, type FileLock } from '../lib/lockFile';

function me(): string { return get(userName).trim() || 'unknown'; }

async function readLock(path: string): Promise<FileLock | null> {
  try { return parseLock(await readTextFile(lockPath(path))); } catch { return null; }
}

/** Write our lock (best-effort — a lock we can't write just means no advisory protection). */
export async function acquireLock(path: string): Promise<void> {
  try {
    await writeTextFile(lockPath(path), JSON.stringify({ by: me(), at: new Date().toISOString() }));
  } catch { /* best-effort */ }
}

/** Delete the lock, but only if it is ours — never clobber someone else's lock. */
export async function releaseLock(path: string): Promise<void> {
  const l = await readLock(path);
  if (l && l.by === me()) { try { await remove(lockPath(path)); } catch { /* best-effort */ } }
}

/** On open: if a live foreign lock exists, raise `S.openLock` (FileLockModal decides). Otherwise
 *  (no lock, stale lock, or our own) take the lock. */
export async function checkAndAcquireLock(path: string): Promise<void> {
  const lock = await readLock(path);
  if (shouldWarn(lock, me(), Date.now())) { S.openLock.set(lock); return; }
  await acquireLock(path);
}

// ── FileLockModal resolutions ──────────────────────────────────────────────

/** Open read-only: don't take the lock; block saving to this file. */
export function resolveOpenReadOnly(): void {
  S.setReadOnly(true);
  S.openLock.set(null);
}

/** Edit anyway: take over the lock and allow editing. */
export async function resolveEditAnyway(): Promise<void> {
  S.setReadOnly(false);
  S.openLock.set(null);
  const p = get(S.filePath);
  if (p) await acquireLock(p);
}

/** Don't work on the locked file: discard it (fresh empty project). */
export function resolveCloseLocked(): void {
  S.openLock.set(null);
  S.initProject();
}
