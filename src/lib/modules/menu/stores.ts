import { writable, derived, get, type Readable, type Writable } from 'svelte/store';
import * as H from '../../history';
import {
  newMenuDoc, parseMenuDoc, uid, cellKey,
  type MenuDoc, type MenuStyle, type MenuCategory, type MenuPeriod, type MenuWeek,
} from './model';
import { hashContent } from '../flashcards/lib/fileSync';
import { fillWeek } from './fillWeek';
import { loadBank, harvestDishes, dishesByCategory } from './dishBank';
import { showToast } from '../../shell';

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

function mapPeriods(fn: (p: MenuPeriod) => MenuPeriod): void {
  const p = get(doc);
  commit({ ...p, template: { ...p.template, periods: p.template.periods.map(fn) } });
}
function mapCategory(catId: string, fn: (c: MenuCategory) => MenuCategory): void {
  mapPeriods((p) => ({ ...p, categories: p.categories.map((c) => (c.id === catId ? fn(c) : c)) }));
}

export function addCategory(periodId: string): void {
  mapPeriods((p) => p.id !== periodId ? p
    : { ...p, categories: [...p.categories, { id: uid('c'), key: 'man', label: 'Nhóm mới' }] });
}
export function removeCategory(catId: string): void {
  mapPeriods((p) => ({ ...p, categories: p.categories.filter((c) => c.id !== catId) }));
}
export function renameCategory(catId: string, label: string): void { mapCategory(catId, (c) => ({ ...c, label })); }
export function setCategoryKey(catId: string, key: string): void { mapCategory(catId, (c) => ({ ...c, key })); }
export function setCategoryFlag(
  catId: string,
  patch: Partial<Pick<MenuCategory, 'hideLabel' | 'defaultValue' | 'balanceByIngredient' | 'maxPerTypePerWeek'>>,
): void { mapCategory(catId, (c) => ({ ...c, ...patch })); }
export function moveCategory(catId: string, delta: number): void {
  mapPeriods((p) => {
    const i = p.categories.findIndex((c) => c.id === catId);
    if (i === -1) return p;
    const j = i + delta;
    if (j < 0 || j >= p.categories.length) return p;
    const cats = p.categories.slice();
    [cats[i], cats[j]] = [cats[j], cats[i]];
    return { ...p, categories: cats };
  });
}
export function addPeriod(): void {
  const p = get(doc);
  const period: MenuPeriod = { id: uid('p'), label: 'Buổi mới', categories: [{ id: uid('c'), key: 'man', label: 'Nhóm' }] };
  commit({ ...p, template: { ...p.template, periods: [...p.template.periods, period] } });
}
export function removePeriod(periodId: string): void {
  const p = get(doc);
  commit({ ...p, template: { ...p.template, periods: p.template.periods.filter((x) => x.id !== periodId) } });
}
export function renamePeriod(periodId: string, label: string): void {
  mapPeriods((p) => (p.id === periodId ? { ...p, label } : p));
}
export function setDays(days: string[]): void {
  const p = get(doc);
  commit({ ...p, template: { ...p.template, days: days.slice() } });
}

function mapWeek(weekId: string, fn: (w: MenuWeek) => MenuWeek): void {
  const p = get(doc);
  commit({ ...p, weeks: p.weeks.map((w) => (w.id === weekId ? fn(w) : w)) });
}

export function addWeek(): void {
  const p = get(doc);
  const n = p.weeks.length + 1;
  const week: MenuWeek = { id: uid('w'), title: `Tuần ${n}`, cells: {} };
  commit({ ...p, weeks: [...p.weeks, week] });
  selectedWeekId.set(week.id);
}
export function duplicateWeek(id: string): void {
  const p = get(doc);
  const src = p.weeks.find((w) => w.id === id);
  if (!src) return;
  const copy: MenuWeek = { ...structuredClone(src), id: uid('w'), title: `${src.title} (bản sao)` };
  const i = p.weeks.findIndex((w) => w.id === id);
  const weeks = p.weeks.slice(); weeks.splice(i + 1, 0, copy);
  commit({ ...p, weeks });
  selectedWeekId.set(copy.id);
}
export function deleteWeek(id: string): void {
  const p = get(doc);
  commit({ ...p, weeks: p.weeks.filter((w) => w.id !== id) });
  if (get(selectedWeekId) === id) selectedWeekId.set(get(doc).weeks[0]?.id ?? null);
}
export function moveWeek(id: string, delta: number): void {
  const p = get(doc);
  const i = p.weeks.findIndex((w) => w.id === id);
  if (i === -1) return;
  const j = i + delta;
  if (j < 0 || j >= p.weeks.length) return;
  const weeks = p.weeks.slice();
  [weeks[i], weeks[j]] = [weeks[j], weeks[i]];
  commit({ ...p, weeks });
}
export function setWeekTitle(id: string, title: string): void { mapWeek(id, (w) => ({ ...w, title })); }
export function setCell(weekId: string, catId: string, dayIndex: number, value: string): void {
  mapWeek(weekId, (w) => ({ ...w, cells: { ...w.cells, [cellKey(catId, dayIndex)]: value } }));
}

/** Weeks positioned before the given week id, in document order. */
function weeksBefore(weekId: string): MenuWeek[] {
  const p = get(doc);
  const i = p.weeks.findIndex((w) => w.id === weekId);
  return i <= 0 ? [] : p.weeks.slice(0, i);
}

export function fillCurrentWeek(mode: 'empty-only' | 'overwrite'): void {
  const id = get(selectedWeekId);
  const p = get(doc);
  const week = p.weeks.find((w) => w.id === id);
  if (!week) return;
  const { cells, warnings } = fillWeek(p.template, loadBank(), weeksBefore(week.id), week, { mode });
  commit({ ...get(doc), weeks: get(doc).weeks.map((w) => (w.id === week.id ? { ...w, cells } : w)) });
  if (warnings.length) showToast(warnings[0], 'error');
}

export function rerollCell(weekId: string, catId: string, dayIndex: number): void {
  const p = get(doc);
  const cat = p.template.periods.flatMap((pr) => pr.categories).find((c) => c.id === catId);
  if (!cat) return;
  const week = p.weeks.find((w) => w.id === weekId);
  if (!week) return;
  if (cat.defaultValue) { setCell(weekId, catId, dayIndex, cat.defaultValue); return; }
  const current = week.cells[cellKey(catId, dayIndex)] ?? '';
  const pool = dishesByCategory(cat.key).filter((d) => d.name !== current);
  const src = pool.length ? pool : dishesByCategory(cat.key);
  if (!src.length) { showToast(`Kho món chưa có nhóm "${cat.label}"`, 'error'); return; }
  const chosen = src[Math.floor(Math.random() * src.length)];
  setCell(weekId, catId, dayIndex, chosen.name);
}

export function harvestCurrentWeek(): number {
  const id = get(selectedWeekId);
  const p = get(doc);
  const week = p.weeks.find((w) => w.id === id);
  if (!week) return 0;
  const entries: { name: string; categoryKey: string }[] = [];
  for (const period of p.template.periods) for (const cat of period.categories) {
    if (cat.defaultValue) continue;
    for (let d = 0; d < p.template.days.length; d++) {
      const v = week.cells[cellKey(cat.id, d)];
      if (v) entries.push({ name: v, categoryKey: cat.key });
    }
  }
  const added = harvestDishes(entries);
  showToast(added ? `Đã thêm ${added} món vào kho` : 'Không có món mới để thêm');
  return added;
}
