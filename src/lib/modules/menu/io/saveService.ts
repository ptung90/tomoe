import { writeFile } from '@tauri-apps/plugin-fs';
import { save as saveDialog } from '@tauri-apps/plugin-dialog';
import { get } from 'svelte/store';
import * as S from '../stores';
import { serializeMenuDoc } from '../model';
import { showToast, userName } from '../../../shell';

async function doWrite(path: string): Promise<void> {
  S.stampEditLog(get(userName).trim() || 'unknown', new Date().toISOString());
  const text = serializeMenuDoc(get(S.doc));
  try {
    await writeFile(path, new TextEncoder().encode(text));
    S.markSaved(path, text);
    showToast('Saved');
  } catch (e) { showToast(`Could not save: ${(e as Error).message}`, 'error'); }
}

export async function saveToPath(path: string): Promise<void> { await doWrite(path); }

export async function pickSaveTo(): Promise<void> {
  const np = await saveDialog({ filters: [{ name: 'Tomoe Menu', extensions: ['menu.tomoe.json'] }] });
  if (!np) return;
  await doWrite(np);
}
