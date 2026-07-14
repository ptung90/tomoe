import { writeTextFile } from '@tauri-apps/plugin-fs';
import { save } from '@tauri-apps/plugin-dialog';
import { get } from 'svelte/store';
import { data, filePath, loadDocument, markSaved, showToast } from './stores';
import type { JsonValue } from './jsonModel';

export function serialize(value: JsonValue): string {
  return JSON.stringify(value, null, 2) + '\n';
}

/** Parse already-loaded text into this module's store (no re-read, no dirty confirm). */
export function openText(text: string, path: string | null): void {
  try {
    loadDocument(JSON.parse(text) as JsonValue, path);
  } catch (e) {
    showToast(`Invalid JSON file: ${(e as Error).message}`, 'error');
  }
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
