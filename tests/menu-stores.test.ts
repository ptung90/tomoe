import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';
import * as S from '../src/lib/modules/menu/stores';
import { newMenuDoc, uid, cellKey } from '../src/lib/modules/menu/model';
import * as B from '../src/lib/modules/menu/dishBank';

vi.mock('../src/lib/modules/menu/ai', () => ({
  loadAiConfig: () => ({ apiKey: 'k', model: 'm' }),
  generateWeek: vi.fn(async () => ({
    cells: { 'c_man:0': 'Cá kho', 'bogus_cat:0': 'X', 'c_man:99': 'Y', 'c_man:abc': 'Z' },
    newDishes: [{ name: 'Cá kho', categoryKey: 'man' }],
  })),
}));

beforeEach(() => S.initDoc());

describe('menu stores', () => {
  it('starts clean, not dirty, cannot undo', () => {
    expect(get(S.dirty)).toBe(false);
    expect(get(S.canUndo)).toBe(false);
    expect(get(S.doc).weeks).toEqual([]);
  });

  it('commit flips dirty and enables undo; undo restores', () => {
    const d = newMenuDoc(); d.projectName = 'X';
    S.commit(d);
    expect(get(S.dirty)).toBe(true);
    expect(get(S.doc).projectName).toBe('X');
    expect(get(S.canUndo)).toBe(true);
    S.undo();
    expect(get(S.doc).projectName).toBe('Untitled');
  });

  it('setSettings merges into settings as one undo step', () => {
    S.setSettings({ headerColor: '#123456' });
    expect(get(S.doc).settings.headerColor).toBe('#123456');
    expect(get(S.canUndo)).toBe(true);
  });

  it('loadDoc resets dirty and selects the first week', () => {
    const d = newMenuDoc(); d.weeks.push({ id: 'w1', title: 'T', cells: {} });
    S.loadDoc(d, '/tmp/x.menu.tomoe.json');
    expect(get(S.dirty)).toBe(false);
    expect(get(S.selectedWeekId)).toBe('w1');
  });
});

describe('menu template actions', () => {
  beforeEach(() => S.initDoc());
  it('addCategory appends to a period', () => {
    const pid = get(S.doc).template.periods[0].id;
    S.addCategory(pid);
    expect(get(S.doc).template.periods[0].categories.length).toBe(5);
  });
  it('renameCategory + setCategoryFlag update in place', () => {
    const cat = get(S.doc).template.periods[0].categories[0];
    S.renameCategory(cat.id, 'Mặn');
    S.setCategoryFlag(cat.id, { balanceByIngredient: false, defaultValue: 'x' });
    const after = get(S.doc).template.periods[0].categories[0];
    expect(after.label).toBe('Mặn');
    expect(after.balanceByIngredient).toBe(false);
    expect(after.defaultValue).toBe('x');
  });
  it('moveCategory reorders within its period', () => {
    const cats = get(S.doc).template.periods[0].categories;
    const second = cats[1].id;
    S.moveCategory(second, -1);
    expect(get(S.doc).template.periods[0].categories[0].id).toBe(second);
  });
  it('setDays replaces the day columns', () => {
    S.setDays(['T2', 'T3', 'T4', 'T5', 'T6', 'T7']);
    expect(get(S.doc).template.days.length).toBe(6);
  });
});

describe('menu week actions', () => {
  beforeEach(() => S.initDoc());
  it('addWeek creates + selects a week', () => {
    S.addWeek();
    expect(get(S.doc).weeks.length).toBe(1);
    expect(get(S.selectedWeekId)).toBe(get(S.doc).weeks[0].id);
  });
  it('setCell writes a cell keyed by category+day', () => {
    S.addWeek();
    const w = get(S.doc).weeks[0];
    const cat = get(S.doc).template.periods[0].categories[0];
    S.setCell(w.id, cat.id, 2, 'Cá kho');
    expect(get(S.doc).weeks[0].cells[cellKey(cat.id, 2)]).toBe('Cá kho');
  });
  it('duplicateWeek copies cells into a new selected week', () => {
    S.addWeek();
    const w = get(S.doc).weeks[0];
    const cat = get(S.doc).template.periods[0].categories[0];
    S.setCell(w.id, cat.id, 0, 'X');
    S.duplicateWeek(w.id);
    expect(get(S.doc).weeks.length).toBe(2);
    expect(get(S.doc).weeks[1].cells[cellKey(cat.id, 0)]).toBe('X');
  });
  it('deleteWeek clears selection when the selected week goes', () => {
    S.addWeek();
    const id = get(S.doc).weeks[0].id;
    S.deleteWeek(id);
    expect(get(S.doc).weeks.length).toBe(0);
    expect(get(S.selectedWeekId)).toBe(null);
  });
});

describe('menu fill/harvest actions', () => {
  beforeEach(() => { S.initDoc(); localStorage.clear(); });
  it('fillCurrentWeek fills default + bank-backed categories', () => {
    B.addDish({ name: 'Cá kho', categoryKey: 'man' });
    S.addWeek();
    S.fillCurrentWeek('overwrite');
    const w = get(S.doc).weeks[0];
    const com = get(S.doc).template.periods[0].categories.find((c) => c.id === 'c_com')!;
    const man = get(S.doc).template.periods[0].categories.find((c) => c.id === 'c_man')!;
    expect(w.cells[`${com.id}:0`]).toBe('Cơm trắng');
    expect(w.cells[`${man.id}:0`]).toBe('Cá kho');
  });
  it('rerollCell replaces one cell using the bank', () => {
    B.addDish({ name: 'Tôm rim', categoryKey: 'man' });
    S.addWeek();
    const w = get(S.doc).weeks[0];
    const man = get(S.doc).template.periods[0].categories.find((c) => c.id === 'c_man')!;
    S.rerollCell(w.id, man.id, 0);
    expect(get(S.doc).weeks[0].cells[`${man.id}:0`]).toBe('Tôm rim');
  });
  it('rerollCell avoids a dish already used elsewhere in the week when an alternative exists', () => {
    B.addDish({ name: 'Dish A', categoryKey: 'man' });
    B.addDish({ name: 'Dish B', categoryKey: 'man' });
    S.addWeek();
    const w = get(S.doc).weeks[0];
    const man = get(S.doc).template.periods[0].categories.find((c) => c.id === 'c_man')!;
    S.setCell(w.id, man.id, 0, 'Dish A');
    S.setCell(w.id, man.id, 1, 'Dish A');
    S.rerollCell(w.id, man.id, 1);
    expect(get(S.doc).weeks[0].cells[`${man.id}:1`]).toBe('Dish B');
  });
  it('harvestCurrentWeek adds current cells into the bank', () => {
    S.addWeek();
    const w = get(S.doc).weeks[0];
    const man = get(S.doc).template.periods[0].categories.find((c) => c.id === 'c_man')!;
    S.setCell(w.id, man.id, 0, 'Gà kho sả');
    const added = S.harvestCurrentWeek();
    expect(added).toBeGreaterThanOrEqual(1);
    expect(B.dishesByCategory('man').some((d) => d.name === 'Gà kho sả')).toBe(true);
  });
});

describe('menu AI action', () => {
  beforeEach(() => { S.initDoc(); localStorage.clear(); });
  it('aiGenerateCurrentWeek applies returned cells + harvests dishes', async () => {
    S.addWeek();
    const n = await S.aiGenerateCurrentWeek('thực đơn tháng 6');
    expect(n).toBe(1);
    expect(get(S.doc).weeks[0].cells['c_man:0']).toBe('Cá kho');
    expect(B.dishesByCategory('man').some((d) => d.name === 'Cá kho')).toBe(true);
  });
  it('aiGenerateCurrentWeek drops orphan cells with unknown category id or out-of-range day index', async () => {
    S.addWeek();
    await S.aiGenerateCurrentWeek('thực đơn tháng 6');
    const cells = get(S.doc).weeks[0].cells;
    expect(cells['bogus_cat:0']).toBeUndefined();
    expect(cells['c_man:99']).toBeUndefined();
    expect(cells['c_man:abc']).toBeUndefined();
  });
});
