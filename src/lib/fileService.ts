import { readTextFile } from '@tauri-apps/plugin-fs';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { setActiveModule, showToast } from './shell';
import { pickModuleForOpen } from './modules/registry';

export async function openPath(path: string): Promise<void> {
  try {
    const text = await readTextFile(path);
    const mod = pickModuleForOpen(path, text);
    setActiveModule(mod.id);
    mod.open(text, path);
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
