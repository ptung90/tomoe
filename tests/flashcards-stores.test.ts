import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import * as S from '../src/lib/modules/flashcards/stores';

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
});
