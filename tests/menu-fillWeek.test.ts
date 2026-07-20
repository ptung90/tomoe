import { describe, it, expect } from 'vitest';
import { fillWeek } from '../src/lib/modules/menu/fillWeek';
import { newMenuDoc, cellKey } from '../src/lib/modules/menu/model';
import type { Dish } from '../src/lib/modules/menu/dishBank';

const seq = (vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]; };

describe('fillWeek', () => {
  const { template } = newMenuDoc();
  const com = template.periods[0].categories.find((c) => c.id === 'c_com')!;
  const man = template.periods[0].categories.find((c) => c.id === 'c_man')!;
  const emptyWeek = { id: 'w', title: 'T', cells: {} as Record<string, string> };

  it('fills defaultValue categories with the constant (Cơm trắng) every day', () => {
    const { cells } = fillWeek(template, [], [], emptyWeek, { mode: 'overwrite', rng: () => 0 });
    for (let d = 0; d < template.days.length; d++) expect(cells[cellKey(com.id, d)]).toBe('Cơm trắng');
  });

  it('empty-only keeps an existing hand-edited cell', () => {
    const bank: Dish[] = [{ id: 'd1', name: 'Cá kho', categoryKey: 'man' }, { id: 'd2', name: 'Thịt kho', categoryKey: 'man' }];
    const week = { id: 'w', title: 'T', cells: { [cellKey(man.id, 0)]: 'GIỮ NGUYÊN' } };
    const { cells } = fillWeek(template, bank, [], week, { mode: 'empty-only', rng: () => 0 });
    expect(cells[cellKey(man.id, 0)]).toBe('GIỮ NGUYÊN');
  });

  it('does not repeat a dish within the same week when the bank is large enough', () => {
    const bank: Dish[] = Array.from({ length: 5 }, (_, i) => ({ id: `d${i}`, name: `Man${i}`, categoryKey: 'man' }));
    const { cells } = fillWeek(template, bank, [], emptyWeek, { mode: 'overwrite', rng: () => 0 });
    const picks = template.days.map((_d, day) => cells[cellKey(man.id, day)]);
    expect(new Set(picks).size).toBe(picks.length);
  });

  it('balances ingredientType: with 5 thit + 5 ca, no more than maxPerTypePerWeek (2) of one type appears', () => {
    const bank: Dish[] = [
      ...Array.from({ length: 5 }, (_, i) => ({ id: `t${i}`, name: `Thit${i}`, categoryKey: 'man', ingredientType: 'thit' })),
      ...Array.from({ length: 5 }, (_, i) => ({ id: `c${i}`, name: `Ca${i}`, categoryKey: 'man', ingredientType: 'ca' })),
    ];
    const { cells } = fillWeek(template, bank, [], emptyWeek, { mode: 'overwrite', rng: () => 0 });
    const types = template.days.map((_d, day) => bank.find((b) => b.name === cells[cellKey(man.id, day)])!.ingredientType);
    const thit = types.filter((t) => t === 'thit').length;
    expect(thit).toBeLessThanOrEqual(2);
  });

  it('warns and relaxes when the bank cannot cover a category without repeats', () => {
    const bank: Dish[] = [{ id: 'd1', name: 'Only', categoryKey: 'man' }];
    const { cells, warnings } = fillWeek(template, bank, [], emptyWeek, { mode: 'overwrite', rng: () => 0 });
    expect(cells[cellKey(man.id, 0)]).toBe('Only');
    expect(warnings.some((w) => w.includes('Món mặn'))).toBe(true);
  });

  it('warns when a real ingredient type overflows its cap (all 5 dishes share ingredientType "thit")', () => {
    const bank: Dish[] = Array.from({ length: 5 }, (_, i) => (
      { id: `t${i}`, name: `Thit${i}`, categoryKey: 'man', ingredientType: 'thit' }
    ));
    const catThit = { ...man, balanceByIngredient: true, maxPerTypePerWeek: 2 };
    const templateThit = {
      ...template,
      periods: template.periods.map((p) => ({
        ...p, categories: p.categories.map((c) => (c.id === man.id ? catThit : c)),
      })),
    };
    const { warnings } = fillWeek(templateThit, bank, [], emptyWeek, { mode: 'overwrite', rng: () => 0 });
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('does not false-alarm when 5 typeless dishes fill 5 distinct days under balanceByIngredient', () => {
    const bank: Dish[] = Array.from({ length: 5 }, (_, i) => (
      { id: `d${i}`, name: `Man${i}`, categoryKey: 'man' }
    ));
    const catBal = { ...man, balanceByIngredient: true, maxPerTypePerWeek: 2 };
    const templateBal = { days: template.days, periods: [{ id: 'p1', label: 'P', categories: [catBal] }] };
    const { warnings } = fillWeek(templateBal, bank, [], emptyWeek, { mode: 'overwrite', rng: () => 0 });
    expect(warnings).toEqual([]);
  });
});
