import { writable, derived, get, type Readable, type Writable } from 'svelte/store';
import * as H from '../../history';
import { newProject, type Project, type SchemaField, type RecordItem, type Settings, type CardTemplate } from './model';
import * as ops from './recordOps';
import * as cardOps from './cardMapping';

const history = writable<H.History<Project>>(H.createHistory(newProject()));
export const project: Readable<Project> = derived(history, (h) => h.present);
export const canUndo: Readable<boolean> = derived(history, (h) => H.canUndo(h));
export const canRedo: Readable<boolean> = derived(history, (h) => H.canRedo(h));
export const dirty: Writable<boolean> = writable(false);
export const filePath: Writable<string | null> = writable(null);

export function initProject(): void {
  history.set(H.createHistory(newProject()));
  filePath.set(null); dirty.set(false);
  selectedRecordId.set(null); activeSchemaId.set(null); schemaEditorOpen.set(null);
}
export function loadProject(p: Project, path: string | null): void {
  history.set(H.createHistory(p));
  filePath.set(path); dirty.set(false);
  selectedRecordId.set(null);
  activeSchemaId.set(p.schemas[0]?.id ?? null);
  schemaEditorOpen.set(null);
}
export function commit(next: Project): void { history.update((h) => H.push(h, next)); dirty.set(true); }
export function undo(): void { history.update((h) => H.undo(h)); dirty.set(true); }
export function redo(): void { history.update((h) => H.redo(h)); dirty.set(true); }
export function markSaved(path: string): void { filePath.set(path); dirty.set(false); }
export function setProjectName(name: string): void { commit({ ...get(project), projectName: name }); }

// ── UI-only state (not in history) ─────────────────────────────────────
export const selectedRecordId = writable<string | null>(null);
export const activeSchemaId = writable<string | null>(null);
export const schemaEditorOpen = writable<string | '__new__' | null>(null);

export function selectRecord(id: string | null): void { selectedRecordId.set(id); }

// ── Record actions ─────────────────────────────────────────────────────
export function addRecord(schemaId: string): void {
  const { project: np, id } = ops.addRecord(get(project), schemaId);
  if (!id) return;
  commit(np);
  activeSchemaId.set(schemaId);
  selectedRecordId.set(id);
}
export function deleteRecord(id: string): void {
  commit(ops.deleteRecord(get(project), id));
  if (get(selectedRecordId) === id) selectedRecordId.set(null);
}
export function duplicateRecord(id: string): void {
  const { project: np, id: nid } = ops.duplicateRecord(get(project), id);
  if (!nid) return;
  commit(np);
  selectedRecordId.set(nid);
}
export function setField(recordId: string, key: string, value: string, locale?: string): void {
  commit(ops.setField(get(project), recordId, key, value, locale));
}

// ── Schema actions ─────────────────────────────────────────────────────
export function addSchema(name: string): string {
  const { project: np, id } = ops.addSchema(get(project), name);
  commit(np);
  activeSchemaId.set(id);
  return id;
}
export function updateSchema(schemaId: string, patch: { name?: string; fields?: SchemaField[] }): void {
  commit(ops.updateSchema(get(project), schemaId, patch));
}
export function deleteSchema(id: string): void {
  commit(ops.deleteSchema(get(project), id));
  if (get(activeSchemaId) === id) activeSchemaId.set(get(project).schemas[0]?.id ?? null);
  const sel = get(project).records.find((r) => r.id === get(selectedRecordId));
  if (!sel) selectedRecordId.set(null);
}

// ── Locale actions ─────────────────────────────────────────────────────
export function addLocale(l: string): void { commit(ops.addLocale(get(project), l)); }
export function removeLocale(l: string): void { commit(ops.removeLocale(get(project), l)); }
export function setActiveLocale(l: string): void { commit(ops.setActiveLocale(get(project), l)); }

// ── Import ─────────────────────────────────────────────────────────────
export function importRecords(schemaId: string, incoming: RecordItem[], mode: 'overwrite' | 'append'): void {
  commit(ops.importRecords(get(project), schemaId, incoming, mode));
}

// ── Card/settings actions ───────────────────────────────────────────────
export function setSettings(patch: Partial<Settings>): void {
  commit(cardOps.applySettings(get(project), patch));
}
export function setTemplateLayout(schemaId: string, patch: Partial<CardTemplate>): void {
  commit(cardOps.applyTemplatePatch(get(project), schemaId, patch));
}
