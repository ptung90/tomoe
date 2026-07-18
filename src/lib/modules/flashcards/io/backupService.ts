import { writeFile, readDir, remove } from '@tauri-apps/plugin-fs';
import { get } from 'svelte/store';
import * as S from '../stores';
import { backupEnabled, backupDir, backupKeep, showToast } from '../../../shell';
import { backupFileName, isBackupOf, selectToPrune } from '../lib/backup';
import { timeStamp } from '../lib/filename';

function join(dir: string, name: string): string {
  const base = dir.endsWith('/') || dir.endsWith('\\') ? dir.slice(0, -1) : dir;
  return `${base}/${name}`;
}

async function pruneBackups(dir: string, projectName: string, keep: number): Promise<void> {
  try {
    const entries = await readDir(dir);
    const names = entries.filter((e) => e.isFile && isBackupOf(e.name, projectName)).map((e) => e.name);
    for (const name of selectToPrune(names, keep)) {
      try { await remove(join(dir, name)); } catch { /* best-effort */ }
    }
  } catch { /* listing failed — skip prune */ }
}

/** Write a timestamped backup of `text` to the configured folder, then prune to keep-N.
 *  Best-effort: any failure toasts a warning but never throws (never blocks the save). No-op
 *  when disabled or no folder is set. */
export async function writeBackup(text: string): Promise<void> {
  if (!get(backupEnabled)) return;
  const dir = get(backupDir);
  if (!dir) return;
  const projectName = get(S.project).projectName;
  try {
    await writeFile(join(dir, backupFileName(projectName, timeStamp(new Date()))), new TextEncoder().encode(text));
    await pruneBackups(dir, projectName, get(backupKeep));
  } catch (e) {
    showToast(`Backup failed: ${(e as Error).message}`, 'error');
  }
}

/** This project's backups, newest first, for the restore UI. */
export async function listBackups(): Promise<{ name: string; path: string }[]> {
  const dir = get(backupDir);
  if (!dir) return [];
  const projectName = get(S.project).projectName;
  try {
    const entries = await readDir(dir);
    return entries
      .filter((e) => e.isFile && isBackupOf(e.name, projectName))
      .map((e) => e.name).sort((a, b) => b.localeCompare(a))  // newest first
      .map((name) => ({ name, path: join(dir, name) }));
  } catch { return []; }
}
// chooseBackupDir / openBackupFolder live in shell.ts (generic — no project dependency).
