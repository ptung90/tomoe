import { describe, it, expect } from 'vitest';
import { newProject, type Project, type Schema, type RecordItem } from '../src/lib/modules/flashcards/model';
import * as ops from '../src/lib/modules/flashcards/cardOps';

function proj(layout = '3card', n = 4): Project {
  const p = newProject();
  const schema: Schema = { id: 's1', name: 'Words', cardTemplates: [
    { id: 't1', templateType: 'compound', layout, size: null, orientation: undefined, hideTitle: false, hideSectionLabels: false, mapping: {} },
  ], fields: [
    { id: 'f1', key: 'title', label: 'Title', type: 'text', multilingual: true },
    { id: 'f2', key: 'def', label: 'Def', type: 'text', multilingual: true },
  ] };
  p.schemas.push(schema);
  for (let i = 0; i < n; i++) {
    p.records.push({ id: 'r' + i, schemaId: 's1', fieldsHash: '', fields: { title: { en: 'W' + i, vi: '' }, def: { en: 'D' + i, vi: '' } } });
  }
  return p;
}

describe('packRecords / packAllForSchema', () => {
  it('packs 4 records (3card) into 2 cards with packedRecordIds + sourceHash', () => {
    const p = ops.packAllForSchema(proj('3card', 4), 's1');
    expect(p.cards).toHaveLength(2);
    expect(p.cards[0].packedRecordIds).toEqual(['r0', 'r1', 'r2']);
    expect(p.cards[1].packedRecordIds).toEqual(['r3']);
    expect(p.cards[0].sourceHash).toBeTruthy();
    expect(p.cards[0].layout).toBe('3card');
  });
  it('is a no-op for single layouts', () => {
    expect(ops.packAllForSchema(proj('1top-1bot', 3), 's1').cards).toHaveLength(0);
  });
  it('re-packing replaces this schema\'s packed cards (no accumulation)', () => {
    const once = ops.packAllForSchema(proj('3card', 4), 's1');
    const twice = ops.packAllForSchema(once, 's1');
    expect(twice.cards).toHaveLength(2);
  });
  it('does not mutate the input project', () => {
    const p = proj('3card', 3);
    ops.packAllForSchema(p, 's1');
    expect(p.cards).toHaveLength(0);
  });
});

describe('isCardStale / regenerateCard', () => {
  it('a freshly packed card is not stale', () => {
    const p = ops.packAllForSchema(proj('3card', 3), 's1');
    expect(ops.isCardStale(p.cards[0], p)).toBe(false);
  });
  it('editing a source record makes its card stale; regenerate clears it', () => {
    let p = ops.packAllForSchema(proj('3card', 3), 's1');
    const cardId = p.cards[0].id;
    // edit r0's field
    p = { ...p, records: p.records.map((r) => r.id === 'r0' ? { ...r, fields: { ...r.fields, title: { en: 'CHANGED', vi: '' } } } : r) };
    expect(ops.isCardStale(p.cards[0], p)).toBe(true);
    p = ops.regenerateCard(p, cardId);
    expect(ops.isCardStale(p.cards.find((c) => c.id === cardId)!, p)).toBe(false);
    expect(p.cards.find((c) => c.id === cardId)!.sections[0].content).toBe('D0'); // rebuilt content (2nd text field)
  });
  it('deleting a source record makes the card stale', () => {
    let p = ops.packAllForSchema(proj('3card', 3), 's1');
    p = { ...p, records: p.records.filter((r) => r.id !== 'r1') };
    expect(ops.isCardStale(p.cards[0], p)).toBe(true);
  });
});

describe('deleteCard / schemaForCard', () => {
  it('deleteCard removes the card', () => {
    const p = ops.packAllForSchema(proj('3card', 3), 's1');
    const p2 = ops.deleteCard(p, p.cards[0].id);
    expect(p2.cards).toHaveLength(0);
  });
  it('schemaForCard resolves via the first packed record', () => {
    const p = ops.packAllForSchema(proj('3card', 3), 's1');
    expect(ops.schemaForCard(p, p.cards[0])?.id).toBe('s1');
  });
  it('schemaForCard resolves via a surviving record when the first packed record is deleted (no orphaned card)', () => {
    let p = ops.packAllForSchema(proj('3card', 3), 's1');
    const card = p.cards[0];
    expect(card.packedRecordIds).toEqual(['r0', 'r1', 'r2']);
    // Delete the FIRST packed record — schemaForCard must fall back to a surviving one.
    p = { ...p, records: p.records.filter((r) => r.id !== 'r0') };
    expect(ops.schemaForCard(p, card)?.id).toBe('s1');
    expect(ops.isCardStale(card, p)).toBe(true);
    // Repacking must replace the orphaned card, not accumulate alongside it.
    const repacked = ops.packAllForSchema(p, 's1');
    expect(repacked.cards).toHaveLength(1);
  });
});

describe('setCardCell / applyCardToRecords', () => {
  it('setCardCell edits a cell and marks the card edited', () => {
    let p = ops.packAllForSchema(proj('3card', 3), 's1');
    const id = p.cards[0].id;
    p = ops.setCardCell(p, id, 0, { label: 'NEWLABEL', content: 'NEWBODY', image: 'http://x/z.png' });
    const c = p.cards[0];
    expect(c.sections[0].label).toBe('NEWLABEL');
    expect(c.sections[0].content).toBe('NEWBODY');
    expect(c.images.find((im) => im.slot === 0)?.url).toBe('http://x/z.png');
    expect(c.edited).toBe(true);
  });
  it('setCardCell with empty image removes that cell image', () => {
    let p = ops.packAllForSchema(proj('3card', 3), 's1');
    const id = p.cards[0].id;
    p = ops.setCardCell(p, id, 0, { image: 'http://x/z.png' });
    p = ops.setCardCell(p, id, 0, { image: '' });
    expect(p.cards[0].images.find((im) => im.slot === 0)).toBeUndefined();
  });
  it('applyCardToRecords writes label→1st text field, content→2nd, image→image field of the mapped record', () => {
    // proj: fields title(text), def(text); add an image field so apply can write it
    let p = proj('3card', 3);
    p.schemas[0].fields.push({ id: 'f3', key: 'pic', label: 'Pic', type: 'image' });
    p.records.forEach((r) => { r.fields.pic = ''; });
    p = ops.packAllForSchema(p, 's1');
    const id = p.cards[0].id;
    p = ops.setCardCell(p, id, 0, { label: 'Owl', content: 'a bird', image: 'http://x/o.png' });
    p = ops.applyCardToRecords(p, id);
    const r0 = p.records.find((r) => r.id === 'r0')!;
    expect((r0.fields.title as Record<string, string>).en).toBe('Owl');   // 1st text field, active locale (en)
    expect((r0.fields.def as Record<string, string>).en).toBe('a bird');  // 2nd text field
    expect(r0.fields.pic).toBe('http://x/o.png');                          // image field (plain string)
    expect(p.cards[0].edited).toBe(false);                                 // cleared
    expect(ops.isCardStale(p.cards[0], p)).toBe(false);                    // restamped → synced
  });
  it('applyCardToRecords skips a cell whose source record was deleted', () => {
    let p = ops.packAllForSchema(proj('3card', 3), 's1');
    const id = p.cards[0].id;
    p = ops.setCardCell(p, id, 1, { label: 'X' });
    p = { ...p, records: p.records.filter((r) => r.id !== 'r1') }; // delete the cell-1 record
    expect(() => ops.applyCardToRecords(p, id)).not.toThrow();
    expect(p.records.find((r) => r.id === 'r1')).toBeUndefined();
  });
  it('regenerateCard clears the edited flag', () => {
    let p = ops.packAllForSchema(proj('3card', 3), 's1');
    const id = p.cards[0].id;
    p = ops.setCardCell(p, id, 0, { label: 'X' });
    expect(p.cards[0].edited).toBe(true);
    p = ops.regenerateCard(p, id);
    expect(p.cards[0].edited).toBeFalsy();
  });
});
