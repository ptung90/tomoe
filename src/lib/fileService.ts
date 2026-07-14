import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { open, save, confirm } from '@tauri-apps/plugin-dialog';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { get } from 'svelte/store';
import { data, filePath, dirty, loadDocument, markSaved, showToast } from './stores';
import type { JsonValue } from './jsonModel';

export function serialize(value: JsonValue): string {
  return JSON.stringify(value, null, 2) + '\n';
}

export async function openPath(path: string): Promise<void> {
  // Guard unsaved edits before replacing the current document.
  if (get(dirty)) {
    const ok = await confirm(
      'You have unsaved changes. Discard them and open the new file?',
      { title: 'Unsaved changes', kind: 'warning' },
    );
    if (!ok) return;
  }
  try {
    const text = await readTextFile(path);
    loadDocument(JSON.parse(text) as JsonValue, path);
  } catch (e) {
    showToast(`Invalid JSON file: ${(e as Error).message}`, 'error');
  }
}

/**
 * Pull the file passed on launch (cold start) once the frontend is ready.
 * Warm-start opens still arrive via the "open-file" event listener.
 */
export async function loadStartupFile(): Promise<void> {
  try {
    const path = await invoke<string | null>('take_startup_file');
    if (path) await openPath(path);
  } catch { /* not running under Tauri, or nothing to open */ }
}

export async function pickOpen(): Promise<void> {
  const selected = await open({ multiple: false, filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (typeof selected === 'string') await openPath(selected);
}

async function writeTo(path: string): Promise<void> {
  const current = get(data);
  if (current === null) return;
  try {
    await writeTextFile(path, serialize(current));
    markSaved(path);
    showToast('Saved');
  } catch (e) {
    showToast(`Could not save file: ${(e as Error).message}`, 'error');
  }
}

export async function saveCurrent(): Promise<void> {
  if (get(data) === null) return;
  const path = get(filePath);
  if (!path) { await pickSave(); return; }
  await writeTo(path);
}

export async function pickSave(): Promise<void> {
  if (get(data) === null) return;
  const path = await save({ filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (path) await writeTo(path);
}

export function listenForOpenFile(): void {
  listen<string>('open-file', (event) => { if (event.payload) openPath(event.payload); });
}
