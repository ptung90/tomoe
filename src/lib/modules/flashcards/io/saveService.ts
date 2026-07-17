import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { save as saveDialog } from '@tauri-apps/plugin-dialog';
import { get } from 'svelte/store';
import * as S from '../stores';
import { parseProject, serializeProject } from '../model';
import { hasExternalChange } from '../lib/fileSync';
import { acquireLock } from './lockService';
import { writeBackup } from './backupService';
import { showToast, userName } from '../../../shell';

async function readDisk(path: string): Promise<string | null> {
  try { return await readTextFile(path); } catch { return null; }
}

/** Serialize + write the current project to `path`, refresh the sync baseline, toast.
 *  Stamps the shared edit log with who saved and when BEFORE serializing, so the entry lands
 *  in the written file (and updates the in-app "last edited by" line). */
async function doWrite(path: string): Promise<void> {
  S.stampEditLog(get(userName).trim() || 'unknown', new Date().toISOString());
  const text = serializeProject(get(S.project));
  try {
    await writeTextFile(path, text);
    S.markSaved(path, text);
    // A successful write means we own this file now: clear read-only and (re)take/refresh the lock.
    S.setReadOnly(false);
    await acquireLock(path);
    showToast('Saved');
    void writeBackup(text);  // best-effort, non-blocking auto-backup to the configured folder
  } catch (e) { showToast(`Could not save: ${(e as Error).message}`, 'error'); }
}

/** Save to an existing path. First checks the on-disk file hasn't changed since we last synced;
 *  on an external change, raises `S.saveConflict` (SaveConflictModal resolves it) instead of
 *  overwriting. If the file is gone/unreadable, treats it as no conflict and writes.
 *  Note: this is a check-then-write, not a lock — a sync landing in the tiny window between the
 *  read and the write can still be overwritten (residual last-write-wins). */
export async function saveToPath(path: string): Promise<void> {
  if (get(S.readOnly)) {
    showToast('Opened read-only — someone else is editing this file', 'error');
    return;
  }
  const disk = await readDisk(path);
  if (disk !== null && hasExternalChange(get(S.diskBaselineHash), disk)) {
    S.saveConflict.set({ path, diskText: disk });
    return;
  }
  await doWrite(path);
}

/** Prompt for a path and write the current project there. Returns true if a file was written,
 *  false if the user cancelled the dialog. */
async function saveToNewPath(): Promise<boolean> {
  const np = await saveDialog({ filters: [{ name: 'Tomoe Project', extensions: ['tomoe.json'] }] });
  if (!np) return false;
  await doWrite(np);
  return true;
}

/** Prompt for a new path and write there (Save As / save-a-copy). */
export async function pickSaveTo(): Promise<void> {
  await saveToNewPath();
}

// ── Conflict resolutions (called by SaveConflictModal) ─────────────────────

/** Overwrite the on-disk file with our version despite the external change. */
export async function resolveOverwrite(): Promise<void> {
  const c = get(S.saveConflict);
  S.saveConflict.set(null);
  if (c) await doWrite(c.path);
}

/** Discard our in-memory changes and load the current on-disk version instead. Keeps the conflict
 *  open (and toasts) if the on-disk text can't be parsed — e.g. a truncated/partial cloud sync. */
export function resolveReload(): void {
  const c = get(S.saveConflict);
  if (!c) return;
  let p;
  try { p = parseProject(c.diskText); }
  catch (e) { showToast(`Could not load the on-disk version: ${(e as Error).message}`, 'error'); return; }
  S.saveConflict.set(null);
  S.loadProject(p, c.path, c.diskText);
}

/** Keep both versions: write ours to a new path, leaving theirs untouched. Only clears the
 *  conflict once the copy is actually written — cancelling the dialog leaves it open. */
export async function resolveSaveCopy(): Promise<void> {
  if (await saveToNewPath()) S.saveConflict.set(null);
}

/** Dismiss the conflict without saving. */
export function resolveCancel(): void {
  S.saveConflict.set(null);
}
