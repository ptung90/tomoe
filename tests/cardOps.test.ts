import { describe, it, expect } from 'vitest';
import { newProject, serializeProject, parseProject, type Project, type Schema } from '../src/lib/modules/flashcards/model';
import * as ops from '../src/lib/modules/flashcards/cardOps';
import * as cardMapping from '../src/lib/modules/flashcards/cardMapping';

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
  it('re-packing preserves a card\'s per-card style override (was reset to global)', () => {
    const once = ops.packAllForSchema(proj('1top-1bot', 1), 's1');
    // user sets a "This card" style override (like setCardStyle)
    const styled = { ...once, cards: once.cards.map((c) => ({ ...c, style: { border: { color: '#E00000' } } })) };
    const again = ops.packAllForSchema(styled, 's1');   // e.g. "Pack all" in card view
    expect(again.cards).toHaveLength(1);
    expect(again.cards[0].style).toEqual({ border: { color: '#E00000' } });
  });
  it('regenerateCard keeps the per-card style override (only content is regenerated)', () => {
    const once = ops.packAllForSchema(proj('1top-1bot', 1), 's1');
    const styled = { ...once, cards: once.cards.map((c) => ({ ...c, style: { border: { color: '#E00000' } } })) };
    const regen = ops.regenerateCard(styled, styled.cards[0].id);
    expect(regen.cards[0].style).toEqual({ border: { color: '#E00000' } });
  });
});

function projMultiView(): Project {
  const p = newProject();
  const schema: Schema = { id: 's1', name: 'Words', cardTemplates: [
    { id: 'tText', templateType: 'single', layout: 'fulltext', size: null, hideTitle: false, hideSectionLabels: false, mapping: {} },
    { id: 'tImg', templateType: 'single', layout: 'fullimage', size: null, hideTitle: false, hideSectionLabels: false, mapping: {}, fields: ['pic'] },
  ], fields: [
    { id: 'f1', key: 'title', label: 'Title', type: 'text', multilingual: true },
    { id: 'f2', key: 'pic', label: 'Pic', type: 'image' },
  ] };
  p.schemas.push(schema);
  for (let i = 0; i < 3; i++) p.records.push({ id: 'r' + i, schemaId: 's1', fieldsHash: '', fields: { title: { en: 'W' + i, vi: '' }, pic: 'http://x/' + i + '.png' } });
  return p;
}

describe('packAllForSchema — multi-view', () => {
  it('packs one card per (record x view)', () => {
    const p = ops.packAllForSchema(projMultiView(), 's1');
    expect(p.cards).toHaveLength(6); // 3 records x 2 views
    expect(p.cards.filter((c) => c.templateId === 'tText')).toHaveLength(3);
    expect(p.cards.filter((c) => c.templateId === 'tImg')).toHaveLength(3);
  });
  it('the "tImg" view\'s cards only include the image (field-selection honored)', () => {
    const p = ops.packAllForSchema(projMultiView(), 's1');
    const imgCard = p.cards.find((c) => c.templateId === 'tImg' && c.recordId === 'r0')!;
    expect(imgCard.layout).toBe('fullimage');
    expect(imgCard.title).toBe('');
    expect(imgCard.images[0]?.url).toBe('http://x/0.png');
  });
  it('re-packing replaces each (record, view) pair without duplicating or touching other views', () => {
    const once = ops.packAllForSchema(projMultiView(), 's1');
    const twice = ops.packAllForSchema(once, 's1');
    expect(twice.cards).toHaveLength(6);
  });
});

describe('regenerateCard — resolves the card\'s OWN view via templateId', () => {
  it('regenerating a "tImg" card rebuilds it through the image view, not the schema\'s first view', () => {
    let p = ops.packAllForSchema(projMultiView(), 's1');
    const imgCard = p.cards.find((c) => c.templateId === 'tImg' && c.recordId === 'r0')!;
    p = { ...p, records: p.records.map((r) => r.id === 'r0' ? { ...r, fields: { ...r.fields, pic: 'http://x/CHANGED.png' } } : r) };
    p = ops.regenerateCard(p, imgCard.id);
    const rebuilt = p.cards.find((c) => c.id === imgCard.id)!;
    expect(rebuilt.layout).toBe('fullimage'); // still the image view's layout
    expect(rebuilt.title).toBe('');           // still field-filtered (no title)
    expect(rebuilt.images[0]?.url).toBe('http://x/CHANGED.png');
  });
});

describe('isCardStale — independent per (record, view) card', () => {
  it('editing a record marks BOTH its views\' cards stale independently; regenerating one leaves the other stale', () => {
    let p = ops.packAllForSchema(projMultiView(), 's1');
    const textCard = p.cards.find((c) => c.templateId === 'tText' && c.recordId === 'r0')!;
    const imgCard = p.cards.find((c) => c.templateId === 'tImg' && c.recordId === 'r0')!;
    p = { ...p, records: p.records.map((r) => r.id === 'r0' ? { ...r, fields: { ...r.fields, title: { en: 'CHANGED', vi: '' } } } : r) };
    expect(ops.isCardStale(p.cards.find((c) => c.id === textCard.id)!, p)).toBe(true);
    expect(ops.isCardStale(p.cards.find((c) => c.id === imgCard.id)!, p)).toBe(true);
    p = ops.regenerateCard(p, textCard.id);
    expect(ops.isCardStale(p.cards.find((c) => c.id === textCard.id)!, p)).toBe(false); // regenerated
    expect(ops.isCardStale(p.cards.find((c) => c.id === imgCard.id)!, p)).toBe(true);   // still stale — untouched
  });
});

describe('templateForCard', () => {
  it('resolves via the card\'s own templateId', () => {
    const p = ops.packAllForSchema(projMultiView(), 's1');
    const imgCard = p.cards.find((c) => c.templateId === 'tImg')!;
    expect(ops.templateForCard(p, imgCard)?.id).toBe('tImg');
  });
  it('falls back to the schema\'s first view when the card\'s templateId no longer exists', () => {
    let p = ops.packAllForSchema(projMultiView(), 's1');
    const card = p.cards.find((c) => c.templateId === 'tImg')!;
    p = { ...p, cards: p.cards.map((c) => (c.id === card.id ? { ...c, templateId: 'gone' } : c)) };
    expect(ops.templateForCard(p, p.cards.find((c) => c.id === card.id)!)?.id).toBe('tText');
  });
  it('returns null when the card\'s source record was deleted', () => {
    let p = ops.packAllForSchema(projMultiView(), 's1');
    const card = p.cards.find((c) => c.recordId === 'r0')!;
    p = { ...p, records: p.records.filter((r) => r.id !== 'r0') };
    expect(ops.templateForCard(p, card)).toBeNull();
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

describe('isCardStale — depends on the packing view too (fields/layout), not just record fields', () => {
  it('a freshly packed card is not stale', () => {
    const p = ops.packAllForSchema(proj('1top-1bot', 3), 's1');
    const card = p.cards.find((c) => c.recordId === 'r0')!;
    expect(ops.isCardStale(card, p)).toBe(false);
  });
  it('changing the view\'s field selection (setViewFields) marks its packed cards stale', () => {
    let p = ops.packAllForSchema(proj('1top-1bot', 3), 's1');
    const card = p.cards.find((c) => c.recordId === 'r0')!;
    p = cardMapping.setViewFields(p, 's1', 't1', ['def']); // was all fields -> now just "def"
    expect(ops.isCardStale(p.cards.find((c) => c.id === card.id)!, p)).toBe(true);
  });
  it('changing the view\'s layout marks its packed cards stale', () => {
    let p = ops.packAllForSchema(proj('1top-1bot', 3), 's1');
    const card = p.cards.find((c) => c.recordId === 'r0')!;
    p = { ...p, schemas: p.schemas.map((s) => s.id === 's1'
      ? { ...s, cardTemplates: s.cardTemplates.map((t) => t.id === 't1' ? { ...t, layout: 'fulltext' } : t) }
      : s) };
    expect(ops.isCardStale(p.cards.find((c) => c.id === card.id)!, p)).toBe(true);
  });
  it('a record-field edit still marks the card stale (existing behavior preserved)', () => {
    let p = ops.packAllForSchema(proj('1top-1bot', 3), 's1');
    const card = p.cards.find((c) => c.recordId === 'r0')!;
    p = { ...p, records: p.records.map((r) => r.id === 'r0' ? { ...r, fields: { ...r.fields, title: { en: 'CHANGED', vi: '' } } } : r) };
    expect(ops.isCardStale(p.cards.find((c) => c.id === card.id)!, p)).toBe(true);
  });
  it('regenerating after a view-fields change re-syncs the card', () => {
    let p = ops.packAllForSchema(proj('1top-1bot', 3), 's1');
    const card = p.cards.find((c) => c.recordId === 'r0')!;
    p = cardMapping.setViewFields(p, 's1', 't1', ['def']);
    expect(ops.isCardStale(p.cards.find((c) => c.id === card.id)!, p)).toBe(true);
    p = ops.regenerateCard(p, card.id);
    expect(ops.isCardStale(p.cards.find((c) => c.id === card.id)!, p)).toBe(false);
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
  it('applyCardToRecords does not wipe image fields beyond the layout\'s captured slot count', () => {
    let p = proj('fullimage', 3); // fullimage layout has 1 image slot
    p.schemas[0].fields.push({ id: 'f3', key: 'pic1', label: 'Pic1', type: 'image' });
    p.schemas[0].fields.push({ id: 'f4', key: 'pic2', label: 'Pic2', type: 'image' });
    p.records.forEach((r) => { r.fields.pic1 = 'http://x/orig1.png'; r.fields.pic2 = 'http://x/orig2.png'; });
    p = ops.packAllForSchema(p, 's1');
    const card0 = p.cards.find((c) => c.recordId === 'r0')!;
    const id = card0.id;
    // Card only captured pic1 (the 1 slot 'fullimage' allows); edit it via setCardCell.
    p = ops.setCardCell(p, id, 0, { image: 'http://x/new1.png' });
    p = ops.applyCardToRecords(p, id);
    const r0 = p.records.find((r) => r.id === 'r0')!;
    expect(r0.fields.pic1).toBe('http://x/new1.png'); // 1st image field reflects the card
    expect(r0.fields.pic2).toBe('http://x/orig2.png'); // 2nd image field (uncaptured slot) untouched, not wiped
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

describe('applyCardToRecords — honors the view\'s field selection (Fix: previously derived the reverse ' +
  'mapping from the FULL schema.fields instead of the card\'s own view, causing data loss on Apply)', () => {
  function projDefOnlyView(): Project {
    const p = newProject();
    const schema: Schema = { id: 's1', name: 'Words', cardTemplates: [
      { id: 'tDef', templateType: 'single', layout: 'fulltext', size: null, hideTitle: false, hideSectionLabels: false, mapping: {}, fields: ['def'] },
    ], fields: [
      { id: 'f1', key: 'title', label: 'Title', type: 'text', multilingual: true },
      { id: 'f2', key: 'def', label: 'Def', type: 'text', multilingual: true },
      { id: 'f3', key: 'pic', label: 'Pic', type: 'image' },
    ] };
    p.schemas.push(schema);
    p.records.push({ id: 'r0', schemaId: 's1', fieldsHash: '', fields: {
      title: { en: 'OrigTitle', vi: '' }, def: { en: 'OrigDef', vi: '' }, pic: 'http://x/orig.png',
    } });
    return p;
  }

  it('a "def"-only view (title field NOT selected) packs def as a SECTION; editing + applying writes back ' +
    'to "def" and leaves "title" UNCHANGED', () => {
    let p = projDefOnlyView();
    p = ops.packAllForSchema(p, 's1');
    const card = p.cards[0];
    expect(card.title).toBe('');            // 'title' (the schema's title field) isn't in this view → no title
    expect(card.sections).toHaveLength(1);  // def renders as a section, never dropped
    expect(card.sections[0].content).toBe('OrigDef');
    // Escape-hatch edit of the card's section (the sole field this view captured).
    p = ops.setCardCell(p, card.id, 0, { content: 'EDITED' });
    p = ops.applyCardToRecords(p, card.id);
    const r0 = p.records.find((r) => r.id === 'r0')!;
    expect((r0.fields.def as Record<string, string>).en).toBe('EDITED');      // written to the view's ACTUAL field
    expect((r0.fields.title as Record<string, string>).en).toBe('OrigTitle'); // NOT touched
  });

  it('an image-only view (fields:["pic"]) does not wipe the record\'s text fields on apply', () => {
    const p0 = newProject();
    const schema: Schema = { id: 's1', name: 'Words', cardTemplates: [
      { id: 'tImg', templateType: 'single', layout: 'fullimage', size: null, hideTitle: false, hideSectionLabels: false, mapping: {}, fields: ['pic'] },
    ], fields: [
      { id: 'f1', key: 'title', label: 'Title', type: 'text', multilingual: true },
      { id: 'f2', key: 'def', label: 'Def', type: 'text', multilingual: true },
      { id: 'f3', key: 'pic', label: 'Pic', type: 'image' },
    ] };
    p0.schemas.push(schema);
    p0.records.push({ id: 'r0', schemaId: 's1', fieldsHash: '', fields: {
      title: { en: 'OrigTitle', vi: '' }, def: { en: 'OrigDef', vi: '' }, pic: 'http://x/orig.png',
    } });
    let p = ops.packAllForSchema(p0, 's1');
    const card = p.cards[0];
    expect(card.title).toBe('');
    expect(card.sections).toHaveLength(0);
    p = ops.setCardCell(p, card.id, 0, { image: 'http://x/new.png' });
    p = ops.applyCardToRecords(p, card.id);
    const r0 = p.records.find((r) => r.id === 'r0')!;
    expect(r0.fields.pic).toBe('http://x/new.png');
    expect((r0.fields.title as Record<string, string>).en).toBe('OrigTitle'); // NOT wiped (pre-fix: cleared to '')
    expect((r0.fields.def as Record<string, string>).en).toBe('OrigDef');     // NOT wiped (pre-fix: cleared to '')
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
