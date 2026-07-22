import { get } from 'svelte/store';
import type { TomoeModule } from '../types';
import Workspace from './Workspace.svelte';
import * as S from './stores';
import { parseMenuDoc, looksLikeMenu } from './model';
import { saveToPath, pickSaveTo } from './io/saveService';

export const menu: TomoeModule = {
  id: 'menu', label: 'Thực đơn', extensions: ['menu.tomoe.json'],
  matches: (text) => looksLikeMenu(text),
  Workspace,
  newDoc: () => S.initDoc(),
  open: (text, path) =>
    S.loadDoc(parseMenuDoc(text), path && path.endsWith('.menu.tomoe.json') ? path : null, text),
  save: async () => { const p = get(S.filePath); if (p) return saveToPath(p); return pickSaveTo(); },
  saveAs: () => pickSaveTo(),
  filePath: S.filePath,
  dirty: S.dirty, canUndo: S.canUndo, canRedo: S.canRedo, undo: S.undo, redo: S.redo,
};
