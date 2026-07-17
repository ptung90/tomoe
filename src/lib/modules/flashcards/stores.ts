import { writable, derived, get, type Readable, type Writable } from 'svelte/store';
import * as H from '../../history';
import { newProject, uid, type Project, type Schema, type SchemaField, type RecordItem, type Settings, type CardTemplate, type StyleOverrides } from './model';
import * as ops from './recordOps';
import * as cardMapping from './cardMapping';
import * as cardOps from './cardOps';
import * as ai from './lib/ai';
import { mergeStyle } from './lib/style';
import { parseSchemaExport, type SchemaExportPayload, type SchemaLibraryEntry } from './io/schemaIO';
import { hashContent } from './lib/fileSync';

const history = writable<H.History<Project>>(H.createHistory(newProject()));
export const project: Readable<Project> = derived(history, (h) => h.present);
export const canUndo: Readable<boolean> = derived(history, (h) => H.canUndo(h));
export const canRedo: Readable<boolean> = derived(history, (h) => H.canRedo(h));
export const dirty: Writable<boolean> = writable(false);
export const filePath: Writable<string | null> = writable(null);
// Hash of the file's on-disk content as of our last sync (open, or a successful save). Compared
// against the current on-disk content at save time to detect an external change (see fileSync).
export const diskBaselineHash: Writable<string | null> = writable(null);
// Set when a save is blocked because the file changed externally; drives SaveConflictModal.
// null = no pending conflict.
export const saveConflict: Writable<{ path: string; diskText: string } | null> = writable(null);

// ── AI config (localStorage, NOT in the document) ───────────────────────
function loadAiConfig(): ai.AiConfig {
  try {
    return {
      apiKey: localStorage.getItem('tomoe.ai.apiKey') ?? '',
      model: localStorage.getItem('tomoe.ai.model') ?? ai.DEFAULT_AI_MODEL,
    };
  } catch { return { apiKey: '', model: ai.DEFAULT_AI_MODEL }; }
}
const _aiConfig = writable<ai.AiConfig>(loadAiConfig());
export const aiConfig: Readable<ai.AiConfig> = derived(_aiConfig, (c) => c);
export function setAiConfig(patch: Partial<ai.AiConfig>): void {
  _aiConfig.update((c) => {
    const next = { ...c, ...patch };
    try {
      if (patch.apiKey !== undefined) localStorage.setItem('tomoe.ai.apiKey', next.apiKey);
      if (patch.model !== undefined) localStorage.setItem('tomoe.ai.model', next.model);
    } catch { /* ignore storage errors */ }
    return next;
  });
}
export async function aiGenerateRecords(schemaId: string, instruction: string, count: number): Promise<number> {
  const p = get(project);
  const schema = p.schemas.find((s) => s.id === schemaId);
  if (!schema) return 0;
  const recs = await ai.generateRecords(get(_aiConfig), schema, instruction, count, p.locales);
  if (recs.length) importRecords(schemaId, recs, 'append');
  return recs.length;
}

// ── Schema Library (localStorage, app-level — NOT part of the project document; NOT cleared
// by initProject/loadProject) ────────────────────────────────────────────────────────────
const SCHEMA_LIBRARY_KEY = 'tomoe.flashcards.schemaLibrary';
function loadSchemaLibrary(): SchemaLibraryEntry[] {
  try {
    const raw = localStorage.getItem(SCHEMA_LIBRARY_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
function persistSchemaLibrary(list: SchemaLibraryEntry[]): void {
  try { localStorage.setItem(SCHEMA_LIBRARY_KEY, JSON.stringify(list)); } catch { /* ignore storage errors */ }
}
// The list is always re-read from localStorage (the single source of truth) rather than cached
// in memory — `_schemaLibraryVersion` only drives *when* subscribers recompute/re-render. This
// keeps the store from ever going stale relative to localStorage (e.g. across tests that clear
// it directly without going through these actions).
const _schemaLibraryVersion = writable(0);
export const schemaLibrary: Readable<SchemaLibraryEntry[]> = derived(_schemaLibraryVersion, () => loadSchemaLibrary());

export function addToLibrary(entry: { name: string; schema: SchemaExportPayload; settings: Settings }): string {
  const id = uid('lib');
  const full: SchemaLibraryEntry = {
    id, name: entry.name, addedAt: Date.now(),
    schema: structuredClone(entry.schema), settings: structuredClone(entry.settings),
  };
  const next = [full, ...loadSchemaLibrary()];
  persistSchemaLibrary(next);
  _schemaLibraryVersion.update((n) => n + 1);
  return id;
}
export function removeFromLibrary(id: string): void {
  const next = loadSchemaLibrary().filter((e) => e.id !== id);
  persistSchemaLibrary(next);
  _schemaLibraryVersion.update((n) => n + 1);
}
/** Snapshot the CURRENT project's schema (its fields + cardTemplates) + the project's global
 *  settings into the library, as a new entry. */
export function addSchemaToLibrary(schemaId: string): void {
  const p = get(project);
  const schema = p.schemas.find((s) => s.id === schemaId);
  if (!schema) return;
  addToLibrary({ name: schema.name, schema: { name: schema.name, fields: schema.fields, cardTemplates: schema.cardTemplates }, settings: p.settings });
}
/** Parse + add a portable `.schema.json` file's contents to the library. Never throws — used by
 *  both the Schema Library modal's "Import from file…" and the shell open-router (a schema file
 *  double-clicked/opened must toast, not crash). */
export function importSchemaFileText(text: string): { ok: boolean; name?: string; error?: string } {
  try {
    const { schema, settings } = parseSchemaExport(text);
    addToLibrary({ name: schema.name, schema, settings });
    return { ok: true, name: schema.name };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Not a valid Tomoe schema file' };
  }
}
export function insertLibrarySchema(id: string): void {
  const entry = get(schemaLibrary).find((e) => e.id === id);
  if (!entry) return;
  const np = cardMapping.insertSchema(get(project), entry);
  commit(np);
  activeSchemaId.set(np.schemas[np.schemas.length - 1].id);
}
/** Rename a library entry: sets both the entry label AND the schema payload name. Persisted. */
export function renameLibraryEntry(id: string, name: string): void {
  const next = loadSchemaLibrary().map((e) =>
    e.id === id ? { ...e, name, schema: { ...e.schema, name } } : e);
  persistSchemaLibrary(next);
  _schemaLibraryVersion.update((n) => n + 1);
}
/** Replace a library entry's fields (immutable, deep-cloned). cardTemplates are left as-is — a
 *  later Insert + recordToCard tolerates cardTemplate field keys that no longer exist. Persisted. */
export function setLibraryEntryFields(id: string, fields: SchemaField[]): void {
  const next = loadSchemaLibrary().map((e) =>
    e.id === id ? { ...e, schema: { ...e.schema, fields: structuredClone(fields) } } : e);
  persistSchemaLibrary(next);
  _schemaLibraryVersion.update((n) => n + 1);
}
/** Overwrite an existing entry's schema (name+fields+cardTemplates) + settings from a PROJECT
 *  schema + the current project global settings (mirrors addSchemaToLibrary, but overwrites in
 *  place). No-op if either id is missing. Persisted. */
export function updateLibraryEntryFromSchema(entryId: string, schemaId: string): void {
  const p = get(project);
  const schema = p.schemas.find((s) => s.id === schemaId);
  if (!schema) return;
  const list = loadSchemaLibrary();
  if (!list.some((e) => e.id === entryId)) return;
  const next = list.map((e) => (e.id === entryId ? {
    ...e,
    schema: structuredClone({ name: schema.name, fields: schema.fields, cardTemplates: schema.cardTemplates }),
    settings: structuredClone(p.settings),
  } : e));
  persistSchemaLibrary(next);
  _schemaLibraryVersion.update((n) => n + 1);
}

export function initProject(): void {
  history.set(H.createHistory(newProject()));
  filePath.set(null); dirty.set(false);
  diskBaselineHash.set(null); saveConflict.set(null);
  selectedRecordId.set(null); activeSchemaId.set(null); schemaEditorOpen.set(null); cardEditorOpen.set(null);
  activeViewId.set(null);
}
/** `rawText` (when given) is the exact on-disk text this project was loaded from; it seeds the
 *  external-change baseline so a later save can detect the file being overwritten out from under us. */
export function loadProject(p: Project, path: string | null, rawText?: string): void {
  history.set(H.createHistory(p));
  filePath.set(path); dirty.set(false);
  diskBaselineHash.set(rawText != null ? hashContent(rawText) : null);
  saveConflict.set(null);
  selectedRecordId.set(null);
  activeSchemaId.set(p.schemas[0]?.id ?? null);
  schemaEditorOpen.set(null);
  cardEditorOpen.set(null);
  activeViewId.set(null);
}
export function commit(next: Project): void { history.update((h) => H.push(h, next)); dirty.set(true); }
export function undo(): void { history.update((h) => H.undo(h)); dirty.set(true); }
export function redo(): void { history.update((h) => H.redo(h)); dirty.set(true); }
/** `savedText` (when given) is the exact text just written to disk; it refreshes the
 *  external-change baseline so the next save compares against what WE last wrote. */
export function markSaved(path: string, savedText?: string): void {
  filePath.set(path); dirty.set(false);
  diskBaselineHash.set(savedText != null ? hashContent(savedText) : null);
}
export function setProjectName(name: string): void { commit({ ...get(project), projectName: name }); }

// ── UI-only state (not in history) ─────────────────────────────────────
export const selectedRecordId = writable<string | null>(null);
export const activeSchemaId = writable<string | null>(null);
export const schemaEditorOpen = writable<string | '__new__' | null>(null);
export const cardEditorOpen = writable<string | null>(null);
export const activeViewId: Writable<string | null> = writable(null);
export const schemaLibraryOpen: Writable<boolean> = writable(false);

export function selectView(id: string | null): void { activeViewId.set(id); }

export function selectRecord(id: string | null): void { selectedRecordId.set(id); }

/** Move selection to a sibling record (same schema, in list order). delta -1 = prev, +1 = next. No-op at the ends. */
export function selectAdjacentRecord(delta: number): void {
  const p = get(project);
  const curId = get(selectedRecordId);
  const cur = p.records.find((r) => r.id === curId);
  if (!cur) return;
  const sibs = p.records.filter((r) => r.schemaId === cur.schemaId);
  const j = sibs.findIndex((r) => r.id === curId) + delta;
  if (j < 0 || j >= sibs.length) return;
  selectedRecordId.set(sibs[j].id);
}

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
export function applyImageAutofill(updates: { recordId: string; key: string; url: string }[]): void {
  if (updates.length === 0) return;
  commit(ops.setImageFields(get(project), updates));
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
export function setSettings(patch: Partial<Settings> | StyleOverrides): void {
  commit(cardMapping.applySettings(get(project), patch));
}
function resolveTemplateId(schemaId: string, templateId?: string): string | null {
  if (templateId) return templateId;
  const active = get(activeViewId);
  if (active) return active;
  return get(project).schemas.find((s) => s.id === schemaId)?.cardTemplates[0]?.id ?? null;
}

export function setTemplateLayout(schemaId: string, patch: Partial<CardTemplate>, templateId?: string): void {
  commit(cardMapping.applyTemplatePatch(get(project), schemaId, resolveTemplateId(schemaId, templateId), patch));
}
export function setTemplateStyle(schemaId: string, patch: StyleOverrides, templateId?: string): void {
  commit(cardMapping.applyTemplateStyle(get(project), schemaId, resolveTemplateId(schemaId, templateId), patch));
}
export function setCardStyle(cardId: string, patch: StyleOverrides): void {
  const p = get(project);
  commit({ ...p, cards: p.cards.map((c) => (c.id === cardId ? { ...c, style: mergeStyle(c.style, patch) } : c)) });
}
/** Drop ALL style overrides at the given scope in a single undo step (schema template.style / card.style → undefined). */
export function resetScopeStyle(scope: 'schema' | 'card', id: string, templateId?: string): void {
  const p = get(project);
  if (scope === 'schema') {
    const tid = resolveTemplateId(id, templateId);
    commit({ ...p, schemas: p.schemas.map((s) => {
      if (s.id !== id) return s;
      const idx = s.cardTemplates.findIndex((t) => t.id === tid);
      if (idx === -1 || !s.cardTemplates[idx].style) return s;
      const cardTemplates = s.cardTemplates.slice();
      cardTemplates[idx] = { ...cardTemplates[idx], style: undefined };
      return { ...s, cardTemplates };
    }) });
  } else {
    commit({ ...p, cards: p.cards.map((c) => (c.id === id && c.style ? { ...c, style: undefined } : c)) });
  }
}
/** Remove one override key at the given scope's style object; if the resulting style is empty, set it to undefined. */
export function clearStyleOverride(scope: 'schema' | 'card', id: string, key: keyof StyleOverrides, templateId?: string): void {
  const p = get(project);
  if (scope === 'schema') {
    const tid = resolveTemplateId(id, templateId);
    commit({ ...p, schemas: p.schemas.map((s) => {
      if (s.id !== id) return s;
      const idx = s.cardTemplates.findIndex((t) => t.id === tid);
      if (idx === -1 || !s.cardTemplates[idx].style) return s;
      const existing = s.cardTemplates[idx];
      const { [key]: _drop, ...rest } = existing.style!;
      const style = Object.keys(rest).length ? rest : undefined;
      const cardTemplates = s.cardTemplates.slice();
      cardTemplates[idx] = { ...existing, style };
      return { ...s, cardTemplates };
    }) });
  } else {
    commit({ ...p, cards: p.cards.map((c) => {
      if (c.id !== id || !c.style) return c;
      const { [key]: _drop, ...rest } = c.style;
      const style = Object.keys(rest).length ? rest : undefined;
      return { ...c, style };
    }) });
  }
}

// ── View (multi-view per schema) actions ────────────────────────────────
export function addView(schemaId: string): void {
  const { project: np, id } = cardMapping.addView(get(project), schemaId);
  if (!id) return;
  commit(np);
  activeViewId.set(id);
}
export function renameView(schemaId: string, templateId: string, name: string): void {
  commit(cardMapping.renameView(get(project), schemaId, templateId, name));
}
export function deleteView(schemaId: string, templateId: string): void {
  const before = get(project).schemas.find((s) => s.id === schemaId)?.cardTemplates.length ?? 0;
  commit(cardMapping.deleteView(get(project), schemaId, templateId));
  const after = get(project).schemas.find((s) => s.id === schemaId)?.cardTemplates ?? [];
  if (after.length < before && get(activeViewId) === templateId) activeViewId.set(after[0]?.id ?? null);
}
export function setViewFields(schemaId: string, templateId: string, keys: string[]): void {
  commit(cardMapping.setViewFields(get(project), schemaId, templateId, keys));
}

// ── Card pack/regenerate/delete actions ─────────────────────────────────
export function packAllForSchema(schemaId: string): void {
  commit(cardOps.packAllForSchema(get(project), schemaId));
}
export function regenerateCard(cardId: string): void {
  commit(cardOps.regenerateCard(get(project), cardId));
}
export function deleteCard(cardId: string): void {
  commit(cardOps.deleteCard(get(project), cardId));
}

// ── Card edit actions ──────────────────────────────────────────────────────
export function setCardCell(cardId: string, i: number, patch: { label?: string; content?: string; image?: string }): void {
  commit(cardOps.setCardCell(get(project), cardId, i, patch));
}
export function applyCardToRecords(cardId: string): void {
  commit(cardOps.applyCardToRecords(get(project), cardId));
}
