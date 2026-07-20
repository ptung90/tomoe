import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import * as S from '../src/lib/modules/menu/stores';
import { newMenuDoc } from '../src/lib/modules/menu/model';

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
