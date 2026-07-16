import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import * as S from '../src/lib/modules/flashcards/stores';
import { newProject, type Schema } from '../src/lib/modules/flashcards/model';

beforeEach(() => { S.initProject(); });

describe('flashcards store wrappers', () => {
  it('addSchema then addRecord updates project and selects the record', () => {
    S.addSchema('Words');
    const schemaId = get(S.project).schemas[0].id;
    S.addRecord(schemaId);
    expect(get(S.project).records).toHaveLength(1);
    expect(get(S.selectedRecordId)).toBe(get(S.project).records[0].id);
    expect(get(S.dirty)).toBe(true);
  });

  it('setField edits through history (undoable)', () => {
    S.addSchema('Words');
    const sid = get(S.project).schemas[0].id;
    S.updateSchema(sid, { fields: [{ id: 'f1', key: 'title', label: 'T', type: 'text', multilingual: true }] });
    S.addRecord(sid);
    const rid = get(S.project).records[0].id;
    S.setField(rid, 'title', 'Owl', 'en');
    expect(get(S.project).records[0].fields.title).toMatchObject({ en: 'Owl' });
    S.undo();
    expect(get(S.project).records[0].fields.title).toMatchObject({ en: '' });
  });

  it('deleteRecord clears selection when the deleted record was selected', () => {
    S.addSchema('Words');
    const sid = get(S.project).schemas[0].id;
    S.addRecord(sid);
    const rid = get(S.selectedRecordId)!;
    S.deleteRecord(rid);
    expect(get(S.selectedRecordId)).toBeNull();
  });

  it('initProject resets selection', () => {
    S.addSchema('Words');
    S.addRecord(get(S.project).schemas[0].id);
    S.initProject();
    expect(get(S.selectedRecordId)).toBeNull();
    expect(get(S.project).records).toHaveLength(0);
  });

  it('selectAdjacentRecord moves within siblings and clamps at both ends', () => {
    const sid = S.addSchema('W');
    S.updateSchema(sid, { fields: [{ id: 'f1', key: 't', label: 'T', type: 'text', multilingual: true }] });
    S.addRecord(sid); S.addRecord(sid); S.addRecord(sid);
    const ids = get(S.project).records.map((r) => r.id);
    S.selectRecord(ids[0]);
    S.selectAdjacentRecord(1); expect(get(S.selectedRecordId)).toBe(ids[1]);
    S.selectAdjacentRecord(1); expect(get(S.selectedRecordId)).toBe(ids[2]);
    S.selectAdjacentRecord(1); expect(get(S.selectedRecordId)).toBe(ids[2]); // clamped at end
    S.selectAdjacentRecord(-1); expect(get(S.selectedRecordId)).toBe(ids[1]);
    S.selectRecord(ids[0]); S.selectAdjacentRecord(-1); expect(get(S.selectedRecordId)).toBe(ids[0]); // clamped at start
  });
});

describe('style setters (cascade)', () => {
  it('setTemplateStyle sets a schema-level override, merging (not replacing) on a second call', () => {
    const sid = S.addSchema('Words');
    S.setTemplateStyle(sid, { border: { width: 6 } });
    let schema = get(S.project).schemas.find((s) => s.id === sid)!;
    expect(schema.cardTemplates[0].style?.border?.width).toBe(6);

    S.setTemplateStyle(sid, { border: { color: '#111' } });
    schema = get(S.project).schemas.find((s) => s.id === sid)!;
    expect(schema.cardTemplates[0].style?.border?.width).toBe(6);
    expect(schema.cardTemplates[0].style?.border?.color).toBe('#111');
  });

  it('setCardStyle sets a card-level override, merging on a second call', () => {
    const sid = S.addSchema('Words');
    S.updateSchema(sid, { fields: [{ id: 'f1', key: 'title', label: 'T', type: 'text', multilingual: true }] });
    S.addRecord(sid);
    S.packAllForSchema(sid);
    const cid = get(S.project).cards[0].id;

    S.setCardStyle(cid, { titleFont: { size: 22 } });
    let card = get(S.project).cards.find((c) => c.id === cid)!;
    expect(card.style?.titleFont?.size).toBe(22);

    S.setCardStyle(cid, { titleFont: { weight: 700 } });
    card = get(S.project).cards.find((c) => c.id === cid)!;
    expect(card.style?.titleFont?.size).toBe(22);
    expect(card.style?.titleFont?.weight).toBe(700);
  });

  it('clearStyleOverride removes a schema-level key, falling back to inherit; clearing the last key leaves style undefined', () => {
    const sid = S.addSchema('Words');
    S.setTemplateStyle(sid, { border: { width: 6 } });
    S.setTemplateStyle(sid, { margin: 20 });

    S.clearStyleOverride('schema', sid, 'border');
    let schema = get(S.project).schemas.find((s) => s.id === sid)!;
    expect(schema.cardTemplates[0].style?.border).toBeUndefined();
    expect(schema.cardTemplates[0].style?.margin).toBe(20);

    S.clearStyleOverride('schema', sid, 'margin');
    schema = get(S.project).schemas.find((s) => s.id === sid)!;
    expect(schema.cardTemplates[0].style).toBeUndefined();
  });

  it('clearStyleOverride removes a card-level key, falling back to inherit', () => {
    const sid = S.addSchema('Words');
    S.updateSchema(sid, { fields: [{ id: 'f1', key: 'title', label: 'T', type: 'text', multilingual: true }] });
    S.addRecord(sid);
    S.packAllForSchema(sid);
    const cid = get(S.project).cards[0].id;

    S.setCardStyle(cid, { titleFont: { size: 22 } });
    S.clearStyleOverride('card', cid, 'titleFont');
    const card = get(S.project).cards.find((c) => c.id === cid)!;
    expect(card.style).toBeUndefined();
  });

  it('resetScopeStyle drops ALL schema overrides in one undoable step', () => {
    const sid = S.addSchema('Words');
    S.setTemplateStyle(sid, { border: { width: 6 } });
    S.setTemplateStyle(sid, { margin: 20 });
    expect(get(S.project).schemas[0].cardTemplates[0].style).toBeDefined();

    S.resetScopeStyle('schema', sid);
    expect(get(S.project).schemas[0].cardTemplates[0].style).toBeUndefined();

    // single history entry — one undo restores both overrides
    S.undo();
    const style = get(S.project).schemas[0].cardTemplates[0].style;
    expect(style?.border?.width).toBe(6);
    expect(style?.margin).toBe(20);
  });

  it('resetScopeStyle drops ALL card overrides in one step', () => {
    const sid = S.addSchema('Words');
    S.updateSchema(sid, { fields: [{ id: 'f1', key: 'title', label: 'T', type: 'text', multilingual: true }] });
    S.addRecord(sid);
    S.packAllForSchema(sid);
    const cid = get(S.project).cards[0].id;

    S.setCardStyle(cid, { titleFont: { size: 22 }, margin: 8 });
    S.resetScopeStyle('card', cid);
    expect(get(S.project).cards.find((c) => c.id === cid)!.style).toBeUndefined();
  });
});

describe('applyImageAutofill', () => {
  it('commits image updates as one undo step, and no-ops on empty', () => {
    const p = newProject();
    const schema: Schema = { id: 's1', name: 'W', cardTemplates: [], fields: [
      { id: 'f1', key: 'title', label: 'T', type: 'text', multilingual: true },
      { id: 'f2', key: 'pic', label: 'P', type: 'image' },
    ] };
    p.schemas.push(schema);
    p.records.push({ id: 'r1', schemaId: 's1', fieldsHash: '', fields: { title: { en: 'Owl', vi: '' }, pic: '' } });
    S.loadProject(p, null);

    S.applyImageAutofill([]); // empty → no commit, stays clean
    expect(get(S.dirty)).toBe(false);

    S.applyImageAutofill([{ recordId: 'r1', key: 'pic', url: 'https://x/a.jpg' }]);
    expect(get(S.project).records[0].fields.pic).toBe('https://x/a.jpg');
    expect(get(S.dirty)).toBe(true);

    S.undo();
    expect(get(S.project).records[0].fields.pic).toBe('');
  });
});
