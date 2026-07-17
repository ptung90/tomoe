import { get } from 'svelte/store';
import type { TomoeModule } from '../types';
import Workspace from './Workspace.svelte';
import * as S from './stores';
import { parseProject, looksLikeFlashcards } from './model';
import { saveToPath, pickSaveTo } from './io/saveService';
import { checkAndAcquireLock, releaseLock } from './io/lockService';

export const flashcards: TomoeModule = {
  id: 'flashcards', label: 'Flashcards', extensions: ['tomoe.json'],
  matches: (text) => looksLikeFlashcards(text),
  Workspace,
  newDoc: () => { const old = get(S.filePath); if (old) releaseLock(old); S.initProject(); },
  // Pass the raw on-disk `text` so the store can seed the external-change baseline (see saveService).
  // Release the previously-open file's lock, then (async) warn/acquire the newly-opened one's lock.
  open: (text, path) => {
    const p = path && path.endsWith('.tomoe.json') ? path : null;
    const old = get(S.filePath);
    if (old && old !== p) releaseLock(old);
    S.loadProject(parseProject(text), p, text);
    if (p) checkAndAcquireLock(p);
  },
  save: async () => { const p = get(S.filePath); if (p) return saveToPath(p); return pickSaveTo(); },
  saveAs: () => pickSaveTo(),
  dirty: S.dirty, canUndo: S.canUndo, canRedo: S.canRedo, undo: S.undo, redo: S.redo,
};
