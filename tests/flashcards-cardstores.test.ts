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
  function seed3card() {
    S.initProject();
    const sid = S.addSchema('Words');
    S.updateSchema(sid, { fields: [
      { id: 'f1', key: 'title', label: 'Title', type: 'text', multilingual: true },
      { id: 'f2', key: 'def', label: 'Def', type: 'text', multilingual: true },
    ] });
    S.setTemplateLayout(sid, { layout: '3card' });
    S.addRecord(sid); S.addRecord(sid); S.addRecord(sid);
    return sid;
  }
  it('packAllForSchema persists cards and is undoable', () => {
    const sid = seed3card();
    S.packAllForSchema(sid);
    expect(get(S.project).cards.length).toBe(1); // 3 records / 3 = 1 card
    expect(get(S.dirty)).toBe(true);
    S.undo();
    expect(get(S.project).cards.length).toBe(0);
  });
  it('deleteCard removes a packed card', () => {
    const sid = seed3card();
    S.packAllForSchema(sid);
    S.deleteCard(get(S.project).cards[0].id);
    expect(get(S.project).cards.length).toBe(0);
  });
});
