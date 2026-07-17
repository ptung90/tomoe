import { writable, type Writable } from 'svelte/store';
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
