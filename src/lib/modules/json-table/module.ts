import type { TomoeModule } from '../types';
import Workspace from './Workspace.svelte';
import * as S from './stores';
import { saveCurrent, openText } from './io';

export const jsonTable: TomoeModule = {
  id: 'json-table',
  label: 'JSON Table',
  extensions: ['json'],
  Workspace,
  newDoc: () => S.loadDocument(null, null),
  open: (text, path) => openText(text, path),
  save: () => saveCurrent(),
  dirty: S.dirty,
  canUndo: S.canUndo,
  canRedo: S.canRedo,
  undo: S.undo,
  redo: S.redo,
};
