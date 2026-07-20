import { writable, derived, get, type Readable, type Writable } from 'svelte/store';
import * as H from '../../history';
import { newMenuDoc, parseMenuDoc, type MenuDoc, type MenuStyle } from './model';
import { hashContent } from '../flashcards/lib/fileSync';

const history = writable<H.History<MenuDoc>>(H.createHistory(newMenuDoc()));
export const doc: Readable<MenuDoc> = derived(history, (h) => h.present);
export const canUndo: Readable<boolean> = derived(history, (h) => H.canUndo(h));
export const canRedo: Readable<boolean> = derived(history, (h) => H.canRedo(h));
export const dirty: Writable<boolean> = writable(false);
export const filePath: Writable<string | null> = writable(null);
export const diskBaselineHash: Writable<string | null> = writable(null);

// UI-only state (not in history)
export const selectedWeekId: Writable<string | null> = writable(null);
export const templateEditorOpen: Writable<boolean> = writable(false);
export const dishBankOpen: Writable<boolean> = writable(false);
export const aiModalOpen: Writable<boolean> = writable(false);

export function initDoc(): void {
  history.set(H.createHistory(newMenuDoc()));
  filePath.set(null); dirty.set(false); diskBaselineHash.set(null);
  selectedWeekId.set(null); templateEditorOpen.set(false); dishBankOpen.set(false); aiModalOpen.set(false);
}
export function loadDoc(d: MenuDoc, path: string | null, rawText?: string): void {
  history.set(H.createHistory(d));
  filePath.set(path); dirty.set(false);
  diskBaselineHash.set(rawText != null ? hashContent(rawText) : null);
  selectedWeekId.set(d.weeks[0]?.id ?? null);
  templateEditorOpen.set(false); dishBankOpen.set(false); aiModalOpen.set(false);
}
export function commit(next: MenuDoc): void { history.update((h) => H.push(h, next)); dirty.set(true); }
export function undo(): void { history.update((h) => H.undo(h)); dirty.set(true); }
export function redo(): void { history.update((h) => H.redo(h)); dirty.set(true); }
export function markSaved(path: string, savedText?: string): void {
  filePath.set(path); dirty.set(false);
  diskBaselineHash.set(savedText != null ? hashContent(savedText) : null);
}

const EDIT_LOG_CAP = 50;
export function stampEditLog(by: string, at: string): void {
  history.update((h) => {
    const editLog = [...(h.present.editLog ?? []), { by, at }].slice(-EDIT_LOG_CAP);
    return { ...h, present: { ...h.present, editLog } };
  });
}

export function selectWeek(id: string | null): void { selectedWeekId.set(id); }
export function setProjectName(name: string): void { commit({ ...get(doc), projectName: name }); }
export function setSettings(patch: Partial<MenuStyle>): void {
  const p = get(doc);
  commit({ ...p, settings: { ...p.settings, ...patch } });
}
