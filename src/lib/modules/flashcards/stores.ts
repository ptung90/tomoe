import { writable, derived, get, type Readable, type Writable } from 'svelte/store';
import * as H from '../../history';
import { newProject, type Project, type SchemaField, type RecordItem, type Settings, type CardTemplate, type StyleOverrides } from './model';
import * as ops from './recordOps';
import * as cardMapping from './cardMapping';
import * as cardOps from './cardOps';
import * as ai from './lib/ai';
import { mergeStyle } from './lib/style';

const history = writable<H.History<Project>>(H.createHistory(newProject()));
export const project: Readable<Project> = derived(history, (h) => h.present);
export const canUndo: Readable<boolean> = derived(history, (h) => H.canUndo(h));
export const canRedo: Readable<boolean> = derived(history, (h) => H.canRedo(h));
export const dirty: Writable<boolean> = writable(false);
export const filePath: Writable<string | null> = writable(null);

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

export function initProject(): void {
  history.set(H.createHistory(newProject()));
  filePath.set(null); dirty.set(false);
  selectedRecordId.set(null); activeSchemaId.set(null); schemaEditorOpen.set(null); cardEditorOpen.set(null);
}
export function loadProject(p: Project, path: string | null): void {
  history.set(H.createHistory(p));
  filePath.set(path); dirty.set(false);
  selectedRecordId.set(null);
  activeSchemaId.set(p.schemas[0]?.id ?? null);
  schemaEditorOpen.set(null);
  cardEditorOpen.set(null);
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
export const cardEditorOpen = writable<string | null>(null);

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
export function setTemplateLayout(schemaId: string, patch: Partial<CardTemplate>): void {
  commit(cardMapping.applyTemplatePatch(get(project), schemaId, patch));
}
export function setTemplateStyle(schemaId: string, patch: StyleOverrides): void {
  commit(cardMapping.applyTemplateStyle(get(project), schemaId, patch));
}
export function setCardStyle(cardId: string, patch: StyleOverrides): void {
  const p = get(project);
  commit({ ...p, cards: p.cards.map((c) => (c.id === cardId ? { ...c, style: mergeStyle(c.style, patch) } : c)) });
}
/** Drop ALL style overrides at the given scope in a single undo step (schema template.style / card.style → undefined). */
export function resetScopeStyle(scope: 'schema' | 'card', id: string): void {
  const p = get(project);
  if (scope === 'schema') {
    commit({ ...p, schemas: p.schemas.map((s) => {
      if (s.id !== id || !s.cardTemplates[0]?.style) return s;
      return { ...s, cardTemplates: [{ ...s.cardTemplates[0], style: undefined }, ...s.cardTemplates.slice(1)] };
    }) });
  } else {
    commit({ ...p, cards: p.cards.map((c) => (c.id === id && c.style ? { ...c, style: undefined } : c)) });
  }
}
/** Remove one override key at the given scope's style object; if the resulting style is empty, set it to undefined. */
export function clearStyleOverride(scope: 'schema' | 'card', id: string, key: keyof StyleOverrides): void {
  const p = get(project);
  if (scope === 'schema') {
    commit({ ...p, schemas: p.schemas.map((s) => {
      if (s.id !== id) return s;
      const existing = s.cardTemplates[0];
      if (!existing?.style) return s;
      const { [key]: _drop, ...rest } = existing.style;
      const style = Object.keys(rest).length ? rest : undefined;
      return { ...s, cardTemplates: [{ ...existing, style }, ...s.cardTemplates.slice(1)] };
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
