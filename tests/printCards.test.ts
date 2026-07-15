import { describe, it, expect } from 'vitest';
import { newProject, type Project, type Schema, type CardTemplate } from '../src/lib/modules/flashcards/model';
import * as cardOps from '../src/lib/modules/flashcards/cardOps';
import { collectPrintCards, collectPrintSheets } from '../src/lib/modules/flashcards/lib/printCards';

function proj(layout: string, n: number, templatePatch: Partial<CardTemplate> = {}): Project {
  const p = newProject();
  const schema: Schema = { id: 's1', name: 'W', cardTemplates: [
    { id: 't1', templateType: 'single', layout, size: null, orientation: undefined, hideTitle: false, hideSectionLabels: false, mapping: {}, ...templatePatch },
  ], fields: [{ id: 'f1', key: 'title', label: 'T', type: 'text', multilingual: true }] };
  p.schemas.push(schema);
  for (let i = 0; i < n; i++) p.records.push({ id: 'r' + i, schemaId: 's1', fieldsHash: '', fields: { title: { en: 'W' + i, vi: '' } } });
  return p;
}

describe('collectPrintCards', () => {
  it('single layout → one card per record', () => {
    expect(collectPrintCards(proj('1top-1bot', 3))).toHaveLength(3);
  });
  it('packed cards + auto for unpacked (pack all → all packed, all auto-derived otherwise)', () => {
    const packed = cardOps.packAllForSchema(proj('1top-1bot', 4), 's1');
    const cards = collectPrintCards(packed);
    expect(cards).toHaveLength(4);
    expect(cards.every((c) => c.recordId)).toBe(true); // all packed snapshots
  });
  it('empty project → []', () => {
    expect(collectPrintCards(newProject())).toEqual([]);
  });
});

describe('collectPrintSheets', () => {
  it('fixed grid: 7 records, cardsPerPage 6 → 2 sheets (6 + 1)', () => {
    const sheets = collectPrintSheets(proj('1top-1bot', 7, { cardsPerPage: 6 }));
    expect(sheets).toHaveLength(2);
    expect(sheets[0].cards).toHaveLength(6);
    expect(sheets[1].cards).toHaveLength(1);
    expect(sheets[0].lay.perPage).toBe(6);
    expect(sheets[0].lay.fillCell).toBe(true);
  });
  it('auto-fit: sheet count = ceil(records/perPage)', () => {
    const p = proj('1top-1bot', 7, { autoFit: true, cardSize: 'A7' });
    const sheets = collectPrintSheets(p);
    const perPage = sheets[0].lay.perPage;
    expect(sheets).toHaveLength(Math.ceil(7 / perPage));
    const total = sheets.reduce((n, s) => n + s.cards.length, 0);
    expect(total).toBe(7);
    expect(sheets[0].lay.fillCell).toBe(false);
  });
  it('empty project → []', () => {
    expect(collectPrintSheets(newProject())).toEqual([]);
  });
});
