import { cellKey, type MenuTemplate, type MenuWeek, type MenuCategory } from './model';
import type { Dish } from './dishBank';

export interface FillOpts { mode: 'empty-only' | 'overwrite'; avoidWeeks?: number; rng?: () => number }
export interface FillResult { cells: Record<string, string>; warnings: string[] }

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1)) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Names used in the last `avoidWeeks` weeks for a given category, keyed by categoryId. */
function recentNames(recentWeeks: MenuWeek[], catId: string, avoidWeeks: number, nDays: number): Set<string> {
  const set = new Set<string>();
  const slice = recentWeeks.slice(-avoidWeeks);
  for (const w of slice) for (let d = 0; d < nDays; d++) {
    const v = w.cells[cellKey(catId, d)];
    if (v) set.add(v);
  }
  return set;
}

function pickForCategory(
  cat: MenuCategory, bank: Dish[], nDays: number, recent: Set<string>, rng: () => number,
): { values: string[]; relaxed: boolean } {
  const candidates = shuffle(bank.filter((d) => d.categoryKey === cat.key), rng);
  const values: string[] = [];
  const usedNames = new Set<string>();
  const typeCount = new Map<string, number>();
  const cap = cat.maxPerTypePerWeek ?? 2;
  let relaxed = false;

  // Order a candidate pool by ingredient balance: least-used type first, ties
  // broken by type name so the choice is deterministic regardless of dish
  // insertion order. No-op for categories that don't balance by ingredient.
  const byBalance = (pool: Dish[]): Dish[] => {
    if (!cat.balanceByIngredient) return pool;
    return pool.slice().sort((a, b) => {
      const ca = typeCount.get(a.ingredientType ?? '') ?? 0;
      const cb = typeCount.get(b.ingredientType ?? '') ?? 0;
      if (ca !== cb) return ca - cb;
      return (a.ingredientType ?? '').localeCompare(b.ingredientType ?? '');
    });
  };

  for (let day = 0; day < nDays; day++) {
    // Tiered candidate filters, from strict to relaxed. First non-empty tier wins.
    const notUsed = candidates.filter((d) => !usedNames.has(d.name));
    const notRecent = notUsed.filter((d) => !recent.has(d.name));
    const withinCap = cat.balanceByIngredient
      ? notRecent.filter((d) => (typeCount.get(d.ingredientType ?? '') ?? 0) < cap)
      : notRecent;

    let pool = withinCap;
    if (!pool.length) { pool = notRecent; }             // relax balance/cap
    if (!pool.length) { pool = notUsed; relaxed = true; } // relax recent window
    if (!pool.length) { pool = candidates; relaxed = true; } // relax in-week uniqueness
    if (!pool.length) { values.push(''); continue; }      // truly empty bank for this category

    const chosen = byBalance(pool)[0];
    values.push(chosen.name);
    usedNames.add(chosen.name);
    const t = chosen.ingredientType ?? '';
    typeCount.set(t, (typeCount.get(t) ?? 0) + 1);
  }
  return { values, relaxed };
}

export function fillWeek(
  template: MenuTemplate, bank: Dish[], recentWeeks: MenuWeek[], target: MenuWeek, opts: FillOpts,
): FillResult {
  const rng = opts.rng ?? Math.random;
  const avoidWeeks = opts.avoidWeeks ?? 2;
  const nDays = template.days.length;
  const cells: Record<string, string> = { ...target.cells };
  const warnings: string[] = [];

  for (const period of template.periods) {
    for (const cat of period.categories) {
      if (cat.defaultValue) {
        for (let d = 0; d < nDays; d++) {
          const k = cellKey(cat.id, d);
          if (opts.mode === 'overwrite' || !cells[k]) cells[k] = cat.defaultValue;
        }
        continue;
      }
      const recent = recentNames(recentWeeks, cat.id, avoidWeeks, nDays);
      const { values, relaxed } = pickForCategory(cat, bank, nDays, recent, rng);
      for (let d = 0; d < nDays; d++) {
        const k = cellKey(cat.id, d);
        if (opts.mode === 'empty-only' && cells[k]) continue;
        cells[k] = values[d] ?? '';
      }
      if (relaxed || values.includes('')) {
        warnings.push(`Kho món chưa đủ cho nhóm "${cat.label}" — có thể lặp hoặc còn ô trống.`);
      }
    }
  }
  return { cells, warnings };
}
