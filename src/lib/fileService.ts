import { readTextFile } from '@tauri-apps/plugin-fs';
import { open, confirm } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { get } from 'svelte/store';
import { activeModuleId, setActiveModule, showToast } from './shell';
import { pickModuleForOpen, getModule } from './modules/registry';
import { recordRecent } from './recentFiles';

/**
 * Guard against silently discarding unsaved edits in the active module.
 * Returns true if it is safe to proceed (nothing dirty, or the user confirmed).
 */
export async function confirmDiscardIfDirty(): Promise<boolean> {
  const id = get(activeModuleId);
  if (!id) return true;
  const mod = getModule(id);
  if (!get(mod.dirty)) return true;
  return confirm(
    'You have unsaved changes. Discard them and open the new file?',
    { title: 'Unsaved changes', kind: 'warning' },
  );
}

export async function openPath(path: string): Promise<void> {
  if (!(await confirmDiscardIfDirty())) return;
  try {
    const text = await readTextFile(path);
    const mod = pickModuleForOpen(path, text);
    setActiveModule(mod.id);
    mod.open(text, path);
    recordRecent(path);
  } catch (e) {
    showToast(`Cannot open file: ${(e as Error).message}`, 'error');
  }
}

export async function pickOpen(): Promise<void> {
  const sel = await open({ multiple: false, filters: [{ name: 'Tomoe / JSON', extensions: ['tomoe.json', 'json'] }] });
  if (typeof sel === 'string') await openPath(sel);
}

/** Pull the file passed on launch (cold start) once the frontend is ready. */
export async function loadStartupFile(): Promise<void> {
  try {
    const p = await invoke<string | null>('take_startup_file');
    if (p) await openPath(p);
  } catch { /* not running under Tauri, or nothing to open */ }
}

/** Warm-start opens (app already running) arrive via this event. */
export function listenForOpenFile(): void {
  listen<string>('open-file', (e) => { if (e.payload) openPath(e.payload); });
}
