import { writeTextFile } from '@tauri-apps/plugin-fs';
import { save } from '@tauri-apps/plugin-dialog';
import { get } from 'svelte/store';
import type { TomoeModule } from '../types';
import Workspace from './Workspace.svelte';
import * as S from './stores';
import { parseProject, serializeProject, looksLikeFlashcards } from './model';
import { showToast } from '../../shell';

async function writeTo(path: string) {
  try { await writeTextFile(path, serializeProject(get(S.project))); S.markSaved(path); showToast('Saved'); }
  catch (e) { showToast(`Could not save: ${(e as Error).message}`, 'error'); }
}
export const flashcards: TomoeModule = {
  id: 'flashcards', label: 'Flashcards', extensions: ['tomoe.json'],
  matches: (text) => looksLikeFlashcards(text),
  Workspace,
  newDoc: () => S.initProject(),
  open: (text, path) => S.loadProject(parseProject(text), path && path.endsWith('.tomoe.json') ? path : null),
  save: async () => { const p = get(S.filePath); if (p) return writeTo(p); const np = await save({ filters: [{ name: 'Tomoe Project', extensions: ['tomoe.json'] }] }); if (np) await writeTo(np); },
  dirty: S.dirty, canUndo: S.canUndo, canRedo: S.canRedo, undo: S.undo, redo: S.redo,
};
