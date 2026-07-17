import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { save as saveDialog } from '@tauri-apps/plugin-dialog';
import { get } from 'svelte/store';
import * as S from '../stores';
import { parseProject, serializeProject } from '../model';
import { hasExternalChange } from '../lib/fileSync';
import { showToast } from '../../../shell';

async function readDisk(path: string): Promise<string | null> {
  try { return await readTextFile(path); } catch { return null; }
}

/** Serialize + write the current project to `path`, refresh the sync baseline, toast. */
async function doWrite(path: string): Promise<void> {
  const text = serializeProject(get(S.project));
  try { await writeTextFile(path, text); S.markSaved(path, text); showToast('Saved'); }
  catch (e) { showToast(`Could not save: ${(e as Error).message}`, 'error'); }
}

/** Save to an existing path. First checks the on-disk file hasn't changed since we last synced;
 *  on an external change, raises `S.saveConflict` (SaveConflictModal resolves it) instead of
 *  overwriting. If the file is gone/unreadable, treats it as no conflict and writes. */
export async function saveToPath(path: string): Promise<void> {
  const disk = await readDisk(path);
  if (disk !== null && hasExternalChange(get(S.diskBaselineHash), disk)) {
    S.saveConflict.set({ path, diskText: disk });
    return;
  }
  await doWrite(path);
}

/** Prompt for a new path and write there (Save As / save-a-copy). */
export async function pickSaveTo(): Promise<void> {
  const np = await saveDialog({ filters: [{ name: 'Tomoe Project', extensions: ['tomoe.json'] }] });
  if (np) await doWrite(np);
}

// ── Conflict resolutions (called by SaveConflictModal) ─────────────────────

/** Overwrite the on-disk file with our version despite the external change. */
export async function resolveOverwrite(): Promise<void> {
  const c = get(S.saveConflict);
  S.saveConflict.set(null);
  if (c) await doWrite(c.path);
}

/** Discard our in-memory changes and load the current on-disk version instead. */
export function resolveReload(): void {
  const c = get(S.saveConflict);
  S.saveConflict.set(null);
  if (c) S.loadProject(parseProject(c.diskText), c.path, c.diskText);
}

/** Keep both versions: write ours to a new path, leaving theirs untouched. */
export async function resolveSaveCopy(): Promise<void> {
  S.saveConflict.set(null);
  await pickSaveTo();
}

/** Dismiss the conflict without saving. */
export function resolveCancel(): void {
  S.saveConflict.set(null);
}
