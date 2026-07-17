import { writable, get, type Writable } from 'svelte/store';
import { loadTheme, type Theme } from './theme';

export const toast: Writable<{ message: string; kind: 'success' | 'error' } | null> = writable(null);
let _t: ReturnType<typeof setTimeout> | undefined;
export function showToast(message: string, kind: 'success' | 'error' = 'success'): void {
  toast.set({ message, kind }); if (_t) clearTimeout(_t); _t = setTimeout(() => toast.set(null), 2500);
}

// null = start screen; otherwise the id of the TomoeModule currently mounted.
export const activeModuleId: Writable<string | null> = writable(null);
export function setActiveModule(id: string | null): void { activeModuleId.set(id); }

export const theme: Writable<Theme> = writable(loadTheme());
export const configOpen: Writable<boolean> = writable(false);

// ── Identity ("Your name") — app-level, NOT in any document. Used by the edit
//    log and the lock-file to record/attribute who is editing. ───────────────
const USER_NAME_KEY = 'tomoe.userName';
export const userName: Writable<string> = writable(localStorage.getItem(USER_NAME_KEY) ?? '');
export function setUserName(name: string): void {
  userName.set(name);
  try { localStorage.setItem(USER_NAME_KEY, name); } catch { /* ignore storage errors */ }
}
/** On first run (no name stored yet), seed the identity from the OS username.
 *  Best-effort: silently no-ops outside Tauri or if the command is unavailable. */
export async function seedUserName(): Promise<void> {
  if (localStorage.getItem(USER_NAME_KEY)) return;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const os = (await invoke<string>('os_username')).trim();
    if (os) setUserName(os);
  } catch { /* not under Tauri, or command unavailable */ }
}

// ── Auto-backup config (app-level, NOT in any document) ─────────────────────
const BK_ENABLED = 'tomoe.backup.enabled', BK_DIR = 'tomoe.backup.dir', BK_KEEP = 'tomoe.backup.keep';
export const backupEnabled: Writable<boolean> = writable(localStorage.getItem(BK_ENABLED) === '1');
export const backupDir: Writable<string | null> = writable(localStorage.getItem(BK_DIR));
export const backupKeep: Writable<number> = writable(Number(localStorage.getItem(BK_KEEP)) || 20);
export function setBackupEnabled(v: boolean): void {
  backupEnabled.set(v);
  try { localStorage.setItem(BK_ENABLED, v ? '1' : '0'); } catch { /* ignore */ }
}
export function setBackupDir(dir: string | null): void {
  backupDir.set(dir);
  try { if (dir) localStorage.setItem(BK_DIR, dir); else localStorage.removeItem(BK_DIR); } catch { /* ignore */ }
}
export function setBackupKeep(n: number): void {
  const k = Math.max(1, Math.floor(n) || 20);
  backupKeep.set(k);
  try { localStorage.setItem(BK_KEEP, String(k)); } catch { /* ignore */ }
}
/** Prompt for a backup folder and store it. (Dynamic tauri import keeps the shell test-friendly.) */
export async function chooseBackupDir(): Promise<void> {
  const { open } = await import('@tauri-apps/plugin-dialog');
  const sel = await open({ directory: true, multiple: false });
  if (typeof sel === 'string') setBackupDir(sel);
}
/** Open the configured backup folder in the OS file manager. */
export async function openBackupFolder(): Promise<void> {
  const dir = get(backupDir);
  if (!dir) return;
  try {
    const { openPath } = await import('@tauri-apps/plugin-opener');
    await openPath(dir);
  } catch (e) { showToast(`Could not open folder: ${(e as Error).message}`, 'error'); }
}
