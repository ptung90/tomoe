import { describe, it, expect } from 'vitest';
import {
  newMenuDoc, serializeMenuDoc, parseMenuDoc, looksLikeMenu, cellKey, DEFAULT_TEMPLATE,
} from '../src/lib/modules/menu/model';

describe('menu model', () => {
  it('newMenuDoc has the default template (Trưa/Xế) and no weeks', () => {
    const d = newMenuDoc();
    expect(d.weeks).toEqual([]);
    expect(d.template.periods.map((p) => p.label)).toEqual(['Trưa', 'Xế']);
    const com = d.template.periods[0].categories.find((c) => c.key === 'com');
    expect(com?.defaultValue).toBe('Cơm trắng');
  });

  it('cellKey composes category id + day index', () => {
    expect(cellKey('cat1', 3)).toBe('cat1:3');
  });

  it('serialize → parse round-trips and ends with a newline', () => {
    const d = newMenuDoc();
    d.projectName = 'Thực đơn mầm non';
    d.weeks.push({ id: 'w1', title: 'Tuần 2', cells: { 'cat1:0': 'Thịt kho trứng' } });
    const text = serializeMenuDoc(d);
    expect(text.endsWith('\n')).toBe(true);
    const back = parseMenuDoc(text);
    expect(back.projectName).toBe('Thực đơn mầm non');
    expect(back.weeks[0].cells['cat1:0']).toBe('Thịt kho trứng');
  });

  it('parse tolerates missing optional fields', () => {
    const back = parseMenuDoc(JSON.stringify({ template: DEFAULT_TEMPLATE, weeks: [] }));
    expect(back.projectName).toBe('Untitled');
    expect(Array.isArray(back.weeks)).toBe(true);
    expect(back.settings.headerColor).toBeTruthy();
  });

  it('parse sanitizes malformed periods/categories instead of crashing', () => {
    const back = parseMenuDoc(JSON.stringify({ template: { days: ['a'], periods: [{ label: 'X' }] }, weeks: [] }));
    expect(back.template.periods[0].categories).toEqual([]);
    expect(back.template.periods[0].label).toBe('X');
    expect(back.template.periods[0].id).toBeTruthy();

    const withCat = parseMenuDoc(JSON.stringify({
      template: { days: ['a'], periods: [{ label: 'Y', categories: [{}] }] }, weeks: [],
    }));
    const cat = withCat.template.periods[0].categories[0];
    expect(cat.id).toBeTruthy();
    expect(cat.key).toBe('');
    expect(cat.label).toBe('');
  });

  it('looksLikeMenu: true only for objects with a template.periods + weeks array', () => {
    expect(looksLikeMenu(serializeMenuDoc(newMenuDoc()))).toBe(true);
    expect(looksLikeMenu(JSON.stringify({ schemas: [], records: [] }))).toBe(false);
    expect(looksLikeMenu('not json')).toBe(false);
    expect(looksLikeMenu(JSON.stringify({ template: {}, weeks: [] }))).toBe(false);
  });
});
