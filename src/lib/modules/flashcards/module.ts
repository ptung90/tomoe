import { get } from 'svelte/store';
import type { TomoeModule } from '../types';
import Workspace from './Workspace.svelte';
import * as S from './stores';
import { parseProject, looksLikeFlashcards } from './model';
import { saveToPath, pickSaveTo } from './io/saveService';

export const flashcards: TomoeModule = {
  id: 'flashcards', label: 'Flashcards', extensions: ['tomoe.json'],
  matches: (text) => looksLikeFlashcards(text),
  Workspace,
  newDoc: () => S.initProject(),
  // Pass the raw on-disk `text` so the store can seed the external-change baseline (see saveService).
  open: (text, path) => S.loadProject(parseProject(text), path && path.endsWith('.tomoe.json') ? path : null, text),
  save: async () => { const p = get(S.filePath); if (p) return saveToPath(p); return pickSaveTo(); },
  saveAs: () => pickSaveTo(),
  filePath: S.filePath,
  dirty: S.dirty, canUndo: S.canUndo, canRedo: S.canRedo, undo: S.undo, redo: S.redo,
};
