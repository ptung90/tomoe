import { writable, derived, get, type Readable } from 'svelte/store';
import { updateAtPath, addArrayItem, removeArrayItem, type JsonValue, type Path } from './jsonModel';
import * as H from '../../history';
import { clampPath } from './pathUtils';
import { loadBool, saveBool, loadTheme } from '../../theme';
import type { Theme } from '../../theme';

const history = writable<H.History<JsonValue | null>>(H.createHistory(null));

export const data: Readable<JsonValue | null> = derived(history, (h) => h.present);
export const canUndo: Readable<boolean> = derived(history, (h) => H.canUndo(h));
export const canRedo: Readable<boolean> = derived(history, (h) => H.canRedo(h));

export const filePath = writable<string | null>(null);
export const dirty = writable<boolean>(false);
export const selectedPath = writable<Path>([]);
export const theme = writable<Theme>(loadTheme());
export const toast = writable<{ message: string; kind: 'success' | 'error' } | null>(null);
export const bigEditorPath = writable<Path | null>(null);
export const twoLevel = writable<boolean>(loadBool('jte-two-level', true));
export const editorTab = writable<'form' | 'text'>('form');

export function loadDocument(value: JsonValue, path: string | null): void {
  history.set(H.createHistory(value));
  filePath.set(path);
  dirty.set(false);
  selectedPath.set([]);
}

function commit(next: JsonValue): void {
  history.update((h) => H.push(h, next));
  dirty.set(true);
}

export function editValue(path: Path, newValue: JsonValue): void {
  const cur = get(data);
  if (cur === null) return;
  commit(updateAtPath(cur, path, newValue));
}
export function addItem(arrayPath: Path): void {
  const cur = get(data);
  if (cur === null) return;
  commit(addArrayItem(cur, arrayPath));
}
export function removeItem(arrayPath: Path, index: number): void {
  const cur = get(data);
  if (cur === null) return;
  commit(removeArrayItem(cur, arrayPath, index));
}

function reclampSelection(): void {
  const cur = get(data);
  selectedPath.update((p) => clampPath(cur, p));
}
export function undo(): void {
  history.update((h) => H.undo(h));
  dirty.set(true);
  reclampSelection();
}
export function redo(): void {
  history.update((h) => H.redo(h));
  dirty.set(true);
  reclampSelection();
}

export function select(path: Path): void { selectedPath.set(path); }
export function markSaved(path: string): void { filePath.set(path); dirty.set(false); }

export function openBigEditor(path: Path): void { bigEditorPath.set(path); }
export function closeBigEditor(): void { bigEditorPath.set(null); }

export function setTwoLevel(on: boolean): void { twoLevel.set(on); saveBool('jte-two-level', on); }
export function setEditorTab(t: 'form' | 'text'): void { editorTab.set(t); }

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function showToast(message: string, kind: 'success' | 'error' = 'success'): void {
  toast.set({ message, kind });
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.set(null), 2500);
}

export function setTheme(t: Theme): void { theme.set(t); }
