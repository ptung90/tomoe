import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import * as S from '../src/lib/modules/flashcards/stores';

beforeEach(() => { S.initProject(); });

describe('card stores', () => {
  it('setSettings commits a deep-merged, undoable settings change', () => {
    S.setSettings({ paperSize: 'A4' });
    expect(get(S.project).settings.paperSize).toBe('A4');
    expect(get(S.dirty)).toBe(true);
    S.undo();
    expect(get(S.project).settings.paperSize).not.toBe('A4');
  });
  it('setTemplateLayout creates and patches the schema template', () => {
    const sid = S.addSchema('Words');
    S.setTemplateLayout(sid, { layout: '2x2' });
    expect(get(S.project).schemas[0].cardTemplates[0].layout).toBe('2x2');
  });
});

describe('card pack stores', () => {
  function seedRecords() {
    S.initProject();
    const sid = S.addSchema('Words');
    S.updateSchema(sid, { fields: [
      { id: 'f1', key: 'title', label: 'Title', type: 'text', multilingual: true },
      { id: 'f2', key: 'def', label: 'Def', type: 'text', multilingual: true },
    ] });
    S.setTemplateLayout(sid, { layout: '1top-1bot' });
    S.addRecord(sid); S.addRecord(sid); S.addRecord(sid);
    return sid;
  }
  it('packAllForSchema persists one card per record and is undoable', () => {
    const sid = seedRecords();
    S.packAllForSchema(sid);
    expect(get(S.project).cards.length).toBe(3);
    expect(get(S.dirty)).toBe(true);
    S.undo();
    expect(get(S.project).cards.length).toBe(0);
  });
  it('deleteCard removes a packed card', () => {
    const sid = seedRecords();
    S.packAllForSchema(sid);
    S.deleteCard(get(S.project).cards[0].id);
    expect(get(S.project).cards.length).toBe(2);
  });
});

describe('card edit stores', () => {
  function seedRecordsImg() {
    S.initProject();
    const sid = S.addSchema('Words');
    S.updateSchema(sid, { fields: [
      { id: 'f1', key: 'title', label: 'Title', type: 'text', multilingual: true },
      { id: 'f2', key: 'def', label: 'Def', type: 'text', multilingual: true },
    ] });
    S.setTemplateLayout(sid, { layout: '1top-1bot' });
    S.addRecord(sid); S.addRecord(sid); S.addRecord(sid);
    return sid;
  }
  it('setCardCell edits + marks edited (undoable); applyCardToRecords writes back', () => {
    const sid = seedRecordsImg();
    S.packAllForSchema(sid);
    const cardId = get(S.project).cards[0].id;
    const r0 = get(S.project).cards[0].recordId!;
    S.setCardCell(cardId, 0, { content: 'a bird' });
    expect(get(S.project).cards[0].edited).toBe(true);
    S.applyCardToRecords(cardId);
    const rec = get(S.project).records.find((r) => r.id === r0)!;
    expect((rec.fields.def as Record<string, string>).en).toBe('a bird');
    expect(get(S.project).cards[0].edited).toBe(false);
    S.undo(); // undo the apply
    expect(get(S.project).cards[0].edited).toBe(true);
  });
  it('cardEditorOpen toggles', () => {
    S.cardEditorOpen.set('abc');
    expect(get(S.cardEditorOpen)).toBe('abc');
    S.cardEditorOpen.set(null);
    expect(get(S.cardEditorOpen)).toBeNull();
  });
});
