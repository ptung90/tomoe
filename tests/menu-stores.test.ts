import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import * as S from '../src/lib/modules/menu/stores';
import { newMenuDoc, uid, cellKey } from '../src/lib/modules/menu/model';

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
