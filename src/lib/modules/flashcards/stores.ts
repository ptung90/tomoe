import { writable, derived, get, type Readable, type Writable } from 'svelte/store';
import * as H from '../../history';
import { newProject, uid, type Project, type Schema, type SchemaField, type RecordItem, type Settings, type CardTemplate, type StyleOverrides } from './model';
import * as ops from './recordOps';
import * as cardMapping from './cardMapping';
import * as cardOps from './cardOps';
import * as ai from './lib/ai';
import { mergeStyle } from './lib/style';
import { settingsToPreset, stripPresetKeys, type StylePreset } from './lib/stylePreset';
import { parseSchemaExport, type SchemaExportPayload, type SchemaLibraryEntry } from './io/schemaIO';
import { parseStylePreset, type StylePresetEntry } from './io/stylePresetIO';
import { hashContent } from './lib/fileSync';
import { CONTINENT_COLORS } from './lib/palette';
import type { PrintSelection } from './lib/printCards';

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
// Status-bar control clusters delegated UP from the preview / gallery panes into the single
// Workspace footer (see CardPreview/CardGallery `hostStatusbar`). Each pane registers its own
// controls snippet while mounted+hosted; the Workspace footer renders the one for the active view.
export const previewStatusbar: Writable<import('svelte').Snippet | null> = writable(null);
export const galleryStatusbar: Writable<import('svelte').Snippet | null> = writable(null);
// Transient export filter for the print flow: set before window.print(), read by PrintView, then
// cleared. null = print everything (default). PDF export passes its selection directly instead.
export const printSelection: Writable<PrintSelection | null> = writable(null);

// ── Continent color palette (app-level, localStorage; editable in Settings) ─────────────────
// Defaults come from CONTINENT_COLORS; the user can remap any continent's color in Settings and it
// feeds the color-picker presets (ColorField) everywhere.
const CONTINENT_COLORS_KEY = 'tomoe.continentColors';
function defaultContinentColors(): Record<string, string> {
  return Object.fromEntries(CONTINENT_COLORS.map((c) => [c.key, c.hex]));
}
function loadContinentColors(): Record<string, string> {
  const defaults = defaultContinentColors();
  try {
    const raw = localStorage.getItem(CONTINENT_COLORS_KEY);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return defaults;
}
export const continentColors: Writable<Record<string, string>> = writable(loadContinentColors());
export function setContinentColor(key: string, hex: string): void {
  continentColors.update((m) => {
    const next = { ...m, [key]: hex };
    try { localStorage.setItem(CONTINENT_COLORS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  });
}
export function resetContinentColors(): void {
  continentColors.set(defaultContinentColors());
  try { localStorage.removeItem(CONTINENT_COLORS_KEY); } catch { /* ignore */ }
}

/** The style patch a continent contributes. v1: just the border colour (from the remappable
 *  `continentColors` store). Isolated so a continent can contribute more later — a richer
 *  StyleOverrides — without a data-model change (see spec Feature B extensibility). */
function continentPatch(key: string): StyleOverrides {
  return { border: { color: get(continentColors)[key] } };
}
/** Set the project's continent (or null = none) in ONE undo step. A continent auto-applies its
 *  signature colour to Global border; None only clears the category (border colour left as-is). */
export function setProjectCategory(key: string | null): void {
  const p = get(project);
  if (!key) { commit({ ...p, category: undefined }); return; }
  const np = cardMapping.applySettings(p, continentPatch(key));
  commit({ ...np, category: key });
}

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

// ── Style Preset Library (localStorage, app-level — mirrors the Schema Library above) ────────
const STYLE_PRESET_KEY = 'tomoe.flashcards.stylePresetLibrary';
function loadStylePresets(): StylePresetEntry[] {
  try { const raw = localStorage.getItem(STYLE_PRESET_KEY); const a = raw ? JSON.parse(raw) : []; return Array.isArray(a) ? a : []; }
  catch { return []; }
}
function persistStylePresets(list: StylePresetEntry[]): void {
  try { localStorage.setItem(STYLE_PRESET_KEY, JSON.stringify(list)); } catch { /* ignore storage errors */ }
}
const _stylePresetVersion = writable(0);
export const stylePresetLibrary: Readable<StylePresetEntry[]> = derived(_stylePresetVersion, () => loadStylePresets());
/** Drives the StylePresetModal open/closed (UI only, not in the document). */
export const stylePresetOpen: Writable<boolean> = writable(false);

/** Snapshot the CURRENT project's Global style into the library as a new named preset. */
export function saveStylePreset(name: string): string {
  const id = uid('sp');
  const entry: StylePresetEntry = { id, name, addedAt: Date.now(), preset: settingsToPreset(get(project).settings) };
  persistStylePresets([entry, ...loadStylePresets()]);
  _stylePresetVersion.update((n) => n + 1);
  return id;
}
export function deleteStylePreset(id: string): void {
  persistStylePresets(loadStylePresets().filter((e) => e.id !== id));
  _stylePresetVersion.update((n) => n + 1);
}
export function renameStylePreset(id: string, name: string): void {
  persistStylePresets(loadStylePresets().map((e) => (e.id === id ? { ...e, name } : e)));
  _stylePresetVersion.update((n) => n + 1);
}
/** Parse + add a portable `.tomoestyle.json` file's contents to the library. Never throws. */
export function importStylePresetText(text: string): { ok: boolean; name?: string; error?: string } {
  try {
    const { name, preset } = parseStylePreset(text);
    const entry: StylePresetEntry = { id: uid('sp'), name, addedAt: Date.now(), preset };
    persistStylePresets([entry, ...loadStylePresets()]);
    _stylePresetVersion.update((n) => n + 1);
    return { ok: true, name };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Not a valid Tomoe style preset file' }; }
}

/** Apply a preset project-wide in ONE undo step: always write Global; optionally strip the preset's
 *  keys from every view (template.style) and/or card (card.style) so they inherit the new Global.
 *  Border + page + layout overrides are always preserved (they're not preset keys). */
export function applyStylePreset(preset: StylePreset, opts: { syncViews: boolean; clearCards: boolean }): void {
  let np = cardMapping.applySettings(get(project), preset);
  if (opts.syncViews) {
    np = { ...np, schemas: np.schemas.map((s) => ({
      ...s, cardTemplates: s.cardTemplates.map((t) => (t.style ? { ...t, style: stripPresetKeys(t.style) } : t)),
    })) };
  }
  if (opts.clearCards) {
    np = { ...np, cards: np.cards.map((c) => (c.style ? { ...c, style: stripPresetKeys(c.style) } : c)) };
  }
  commit(np);
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

const EDIT_LOG_CAP = 50;
/** Append a {by, at} entry to the document's shared edit log, capped to the last EDIT_LOG_CAP.
 *  Patches `present` directly — deliberately NOT an undoable history step and does NOT flip
 *  `dirty` — because it is stamped as part of saving (saveService.doWrite), not a user edit. */
export function stampEditLog(by: string, at: string): void {
  history.update((h) => {
    const editLog = [...(h.present.editLog ?? []), { by, at }].slice(-EDIT_LOG_CAP);
    return { ...h, present: { ...h.present, editLog } };
  });
}

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
export function importRecords(schemaId: string, incoming: RecordItem[], mode: 'overwrite' | 'append' | 'merge'): void {
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
