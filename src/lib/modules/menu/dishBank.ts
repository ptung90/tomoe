import { writable, derived, type Readable } from 'svelte/store';
import { uid } from './model';

export interface Dish { id: string; name: string; categoryKey: string; ingredientType?: string; tags?: string[] }

const KEY = 'tomoe.menu.dishBank';
const _version = writable(0);
export const bankVersion: Readable<number> = derived(_version, (n) => n);

export function loadBank(): Dish[] {
  try { const raw = localStorage.getItem(KEY); const arr = raw ? JSON.parse(raw) : []; return Array.isArray(arr) ? arr : []; }
  catch { return []; }
}
function persist(list: Dish[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* ignore */ }
  _version.update((n) => n + 1);
}
export const bank: Readable<Dish[]> = derived(_version, () => loadBank());

export function addDish(entry: { name: string; categoryKey: string; ingredientType?: string }): string {
  const id = uid('dish');
  persist([...loadBank(), { id, name: entry.name.trim(), categoryKey: entry.categoryKey, ingredientType: entry.ingredientType?.trim() || undefined }]);
  return id;
}
export function updateDish(id: string, patch: Partial<Omit<Dish, 'id'>>): void {
  persist(loadBank().map((d) => (d.id === id ? { ...d, ...patch } : d)));
}
export function removeDish(id: string): void { persist(loadBank().filter((d) => d.id !== id)); }
export function dishesByCategory(key: string): Dish[] { return loadBank().filter((d) => d.categoryKey === key); }

export function harvestDishes(entries: { name: string; categoryKey: string; ingredientType?: string }[]): number {
  const list = loadBank();
  const seen = new Set(list.map((d) => `${d.categoryKey}::${d.name.toLowerCase()}`));
  let added = 0;
  for (const e of entries) {
    const name = e.name.trim();
    if (!name) continue;
    const k = `${e.categoryKey}::${name.toLowerCase()}`;
    if (seen.has(k)) continue;
    seen.add(k);
    list.push({ id: uid('dish'), name, categoryKey: e.categoryKey, ingredientType: e.ingredientType?.trim() || undefined });
    added++;
  }
  if (added) persist(list);
  return added;
}
