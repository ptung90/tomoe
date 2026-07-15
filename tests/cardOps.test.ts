import { describe, it, expect } from 'vitest';
import { newProject, serializeProject, parseProject, type Project, type Schema } from '../src/lib/modules/flashcards/model';
import * as ops from '../src/lib/modules/flashcards/cardOps';

function proj(layout = '1top-1bot', n = 3): Project {
  const p = newProject();
  const schema: Schema = { id: 's1', name: 'Words', cardTemplates: [
    { id: 't1', templateType: 'single', layout, size: null, orientation: undefined, hideTitle: false, hideSectionLabels: false, mapping: {} },
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
  it('packs one card per record, with sourceHash', () => {
    const p = ops.packAllForSchema(proj('1top-1bot', 3), 's1');
    expect(p.cards).toHaveLength(3);
    expect(p.cards.map((c) => c.recordId).sort()).toEqual(['r0', 'r1', 'r2']);
    expect(p.cards[0].sourceHash).toBeTruthy();
    expect(p.cards[0].layout).toBe('1top-1bot');
  });
  it('re-packing replaces this schema\'s packed cards (no accumulation)', () => {
    const once = ops.packAllForSchema(proj('1top-1bot', 3), 's1');
    const twice = ops.packAllForSchema(once, 's1');
    expect(twice.cards).toHaveLength(3);
  });
  it('does not mutate the input project', () => {
    const p = proj('1top-1bot', 3);
    ops.packAllForSchema(p, 's1');
    expect(p.cards).toHaveLength(0);
  });
});

describe('isCardStale / regenerateCard', () => {
  it('a freshly packed card is not stale', () => {
    const p = ops.packAllForSchema(proj('1top-1bot', 3), 's1');
    expect(ops.isCardStale(p.cards[0], p)).toBe(false);
  });
  it('editing a source record makes its card stale; regenerate clears it', () => {
    let p = ops.packAllForSchema(proj('1top-1bot', 3), 's1');
    const card0 = p.cards.find((c) => c.recordId === 'r0')!;
    const cardId = card0.id;
    // edit r0's field
    p = { ...p, records: p.records.map((r) => r.id === 'r0' ? { ...r, fields: { ...r.fields, title: { en: 'CHANGED', vi: '' } } } : r) };
    expect(ops.isCardStale(p.cards.find((c) => c.id === cardId)!, p)).toBe(true);
    p = ops.regenerateCard(p, cardId);
    expect(ops.isCardStale(p.cards.find((c) => c.id === cardId)!, p)).toBe(false);
    expect(p.cards.find((c) => c.id === cardId)!.sections[0].content).toBe('D0'); // rebuilt content (2nd text field)
  });
  it('deleting a source record makes the card stale', () => {
    let p = ops.packAllForSchema(proj('1top-1bot', 3), 's1');
    const card0 = p.cards.find((c) => c.recordId === 'r0')!;
    p = { ...p, records: p.records.filter((r) => r.id !== 'r0') };
    expect(ops.isCardStale(p.cards.find((c) => c.id === card0.id)!, p)).toBe(true);
  });
});

describe('deleteCard / schemaForCard', () => {
  it('deleteCard removes the card', () => {
    const p = ops.packAllForSchema(proj('1top-1bot', 3), 's1');
    const p2 = ops.deleteCard(p, p.cards[0].id);
    expect(p2.cards).toHaveLength(2);
  });
  it('schemaForCard resolves via the card\'s source record', () => {
    const p = ops.packAllForSchema(proj('1top-1bot', 3), 's1');
    expect(ops.schemaForCard(p, p.cards[0])?.id).toBe('s1');
  });
  it('schemaForCard returns null when the source record was deleted', () => {
    let p = ops.packAllForSchema(proj('1top-1bot', 3), 's1');
    const card0 = p.cards.find((c) => c.recordId === 'r0')!;
    p = { ...p, records: p.records.filter((r) => r.id !== 'r0') };
    expect(ops.schemaForCard(p, card0)).toBeNull();
    expect(ops.isCardStale(card0, p)).toBe(true);
  });
});

describe('setCardCell / applyCardToRecords', () => {
  it('setCardCell edits a cell and marks the card edited', () => {
    let p = ops.packAllForSchema(proj('1top-1bot', 3), 's1');
    const id = p.cards[0].id;
    p = ops.setCardCell(p, id, 0, { content: 'NEWBODY', image: 'http://x/z.png' });
    const c = p.cards.find((x) => x.id === id)!;
    expect(c.sections[0].content).toBe('NEWBODY');
    expect(c.images.find((im) => im.slot === 0)?.url).toBe('http://x/z.png');
    expect(c.edited).toBe(true);
  });
  it('setCardCell with empty image removes that cell image', () => {
    let p = ops.packAllForSchema(proj('1top-1bot', 3), 's1');
    const id = p.cards[0].id;
    p = ops.setCardCell(p, id, 0, { image: 'http://x/z.png' });
    p = ops.setCardCell(p, id, 0, { image: '' });
    expect(p.cards.find((x) => x.id === id)!.images.find((im) => im.slot === 0)).toBeUndefined();
  });
  it('applyCardToRecords writes the section content back to its schema field, and the image back to the image field', () => {
    let p = proj('1top-1bot', 3);
    p.schemas[0].fields.push({ id: 'f3', key: 'pic', label: 'Pic', type: 'image' });
    p.records.forEach((r) => { r.fields.pic = ''; });
    p = ops.packAllForSchema(p, 's1');
    const card0 = p.cards.find((c) => c.recordId === 'r0')!;
    const id = card0.id;
    p = ops.setCardCell(p, id, 0, { content: 'a bird', image: 'http://x/o.png' });
    p = ops.applyCardToRecords(p, id);
    const r0 = p.records.find((r) => r.id === 'r0')!;
    expect((r0.fields.def as Record<string, string>).en).toBe('a bird'); // 1st (only) section field
    expect(r0.fields.pic).toBe('http://x/o.png');                        // image field (plain string)
    const rebuilt = p.cards.find((c) => c.id === id)!;
    expect(rebuilt.edited).toBe(false);                                  // cleared
    expect(ops.isCardStale(rebuilt, p)).toBe(false);                     // restamped → synced
  });
  it('applyCardToRecords is a no-op when the source record was deleted', () => {
    let p = ops.packAllForSchema(proj('1top-1bot', 3), 's1');
    const card0 = p.cards.find((c) => c.recordId === 'r0')!;
    const id = card0.id;
    p = ops.setCardCell(p, id, 0, { content: 'X' });
    p = { ...p, records: p.records.filter((r) => r.id !== 'r0') }; // delete the source record
    expect(() => ops.applyCardToRecords(p, id)).not.toThrow();
    expect(p.records.find((r) => r.id === 'r0')).toBeUndefined();
  });
  it('regenerateCard clears the edited flag', () => {
    let p = ops.packAllForSchema(proj('1top-1bot', 3), 's1');
    const id = p.cards[0].id;
    p = ops.setCardCell(p, id, 0, { content: 'X' });
    expect(p.cards.find((c) => c.id === id)!.edited).toBe(true);
    p = ops.regenerateCard(p, id);
    expect(p.cards.find((c) => c.id === id)!.edited).toBeFalsy();
  });
});

describe('serializeProject / parseProject round-trip', () => {
  it('preserves a packed card\'s edited flag + edited section content', () => {
    let p = ops.packAllForSchema(proj('1top-1bot', 3), 's1');
    const id = p.cards[0].id;
    p = ops.setCardCell(p, id, 0, { content: 'a bird' });
    expect(p.cards.find((c) => c.id === id)!.edited).toBe(true);

    const roundTripped = parseProject(serializeProject(p));

    const card = roundTripped.cards.find((c) => c.id === id)!;
    expect(card.edited).toBe(true);
    expect(card.sections[0].content).toBe('a bird');
    expect(card.recordId).toBe(p.cards.find((c) => c.id === id)!.recordId);
  });
});
