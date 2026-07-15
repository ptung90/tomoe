import { describe, it, expect } from 'vitest';
import { newProject, type Project, type Schema } from '../src/lib/modules/flashcards/model';
import * as cardOps from '../src/lib/modules/flashcards/cardOps';
import { collectPrintCards } from '../src/lib/modules/flashcards/lib/printCards';

function proj(layout: string, n: number): Project {
  const p = newProject();
  const schema: Schema = { id: 's1', name: 'W', cardTemplates: [
    { id: 't1', templateType: 'single', layout, size: null, orientation: undefined, hideTitle: false, hideSectionLabels: false, mapping: {} },
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
