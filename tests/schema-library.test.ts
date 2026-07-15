import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import * as S from '../src/lib/modules/flashcards/stores';
import { insertSchema } from '../src/lib/modules/flashcards/cardMapping';
import { serializeSchemaExport } from '../src/lib/modules/flashcards/io/schemaIO';
import { DEFAULT_SETTINGS, newProject } from '../src/lib/modules/flashcards/model';
import type { SchemaLibraryEntry } from '../src/lib/modules/flashcards/io/schemaIO';

beforeEach(() => {
  localStorage.clear();
  S.initProject();
});

describe('schema library store', () => {
  it('addToLibrary prepends a new entry, stamps addedAt, and persists to localStorage', () => {
    const id = S.addToLibrary({ name: 'Words', schema: { name: 'Words', fields: [], cardTemplates: [] }, settings: DEFAULT_SETTINGS });
    const list = get(S.schemaLibrary);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(id);
    expect(list[0].name).toBe('Words');
    expect(typeof list[0].addedAt).toBe('number');
    const stored = JSON.parse(localStorage.getItem('tomoe.flashcards.schemaLibrary')!);
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe(id);
  });

  it('a second addToLibrary call prepends before the first (newest first)', () => {
    const id1 = S.addToLibrary({ name: 'A', schema: { name: 'A', fields: [], cardTemplates: [] }, settings: DEFAULT_SETTINGS });
    const id2 = S.addToLibrary({ name: 'B', schema: { name: 'B', fields: [], cardTemplates: [] }, settings: DEFAULT_SETTINGS });
    expect(get(S.schemaLibrary).map((e) => e.id)).toEqual([id2, id1]);
  });

  it('removeFromLibrary drops the entry and persists', () => {
    const id = S.addToLibrary({ name: 'Words', schema: { name: 'Words', fields: [], cardTemplates: [] }, settings: DEFAULT_SETTINGS });
    S.removeFromLibrary(id);
    expect(get(S.schemaLibrary)).toHaveLength(0);
    expect(JSON.parse(localStorage.getItem('tomoe.flashcards.schemaLibrary')!)).toHaveLength(0);
  });

  it('addSchemaToLibrary snapshots the current schema + the project global settings', () => {
    const sid = S.addSchema('Verbs');
    S.updateSchema(sid, { fields: [{ id: 'f1', key: 'w', label: 'Word', type: 'text', multilingual: true }] });
    S.setTemplateStyle(sid, { border: { width: 9 } });
    S.setSettings({ paperSize: 'A6' });
    S.addSchemaToLibrary(sid);
    const entry = get(S.schemaLibrary)[0];
    expect(entry.name).toBe('Verbs');
    expect(entry.schema.fields[0].key).toBe('w');
    expect(entry.schema.cardTemplates[0].style?.border?.width).toBe(9);
    expect(entry.settings.paperSize).toBe('A6');
  });

  it('addSchemaToLibrary is a no-op for an unknown schema id', () => {
    S.addSchemaToLibrary('does-not-exist');
    expect(get(S.schemaLibrary)).toHaveLength(0);
  });

  it('importSchemaFileText adds a valid export to the library and returns {ok:true, name}', () => {
    const text = serializeSchemaExport({ name: 'Imported', fields: [], cardTemplates: [] }, DEFAULT_SETTINGS);
    const res = S.importSchemaFileText(text);
    expect(res).toEqual({ ok: true, name: 'Imported' });
    expect(get(S.schemaLibrary)).toHaveLength(1);
  });

  it('importSchemaFileText never throws — returns {ok:false, error} on bad text', () => {
    const res = S.importSchemaFileText('not json');
    expect(res.ok).toBe(false);
    expect(res.error).toBe('Not a valid Tomoe schema file');
    expect(get(S.schemaLibrary)).toHaveLength(0);
  });

  it('insertLibrarySchema commits a fresh-id copy into the project and selects it', () => {
    const id = S.addToLibrary({
      name: 'Words',
      schema: { name: 'Words', fields: [{ id: 'f1', key: 'w', label: 'Word', type: 'text', multilingual: true }], cardTemplates: [] },
      settings: DEFAULT_SETTINGS,
    });
    S.insertLibrarySchema(id);
    const schemas = get(S.project).schemas;
    expect(schemas).toHaveLength(1);
    expect(schemas[0].name).toBe('Words');
    expect(get(S.activeSchemaId)).toBe(schemas[0].id);
  });

  it('insertLibrarySchema is a no-op for an unknown id', () => {
    S.insertLibrarySchema('missing');
    expect(get(S.project).schemas).toHaveLength(0);
  });
});

describe('insertSchema (pure)', () => {
  function entry(overrides: Partial<SchemaLibraryEntry> = {}): SchemaLibraryEntry {
    return {
      id: 'lib_1', name: 'Words', addedAt: 0,
      schema: {
        name: 'Words',
        fields: [{ id: 'f1', key: 'w', label: 'Word', type: 'text', multilingual: true }],
        cardTemplates: [{ id: 'tpl_src', templateType: 'single', layout: 'fulltext', size: null, mapping: {} }],
      },
      settings: { ...DEFAULT_SETTINGS, paperSize: 'A6' },
      ...overrides,
    };
  }

  it('appends a fresh-id copy: new schema.id, new cardTemplate id(s), source entry untouched', () => {
    const p = newProject();
    const e = entry();
    const before = JSON.parse(JSON.stringify(e));
    const next = insertSchema(p, e);
    expect(next.schemas).toHaveLength(1);
    expect(next.schemas[0].id).not.toBe('lib_1');
    expect(next.schemas[0].id).toMatch(/^sch_/);
    expect(next.schemas[0].cardTemplates[0].id).not.toBe('tpl_src');
    expect(next.schemas[0].cardTemplates[0].id).toMatch(/^tpl_/);
    expect(e).toEqual(before); // original entry untouched
  });

  it('adopts the entry settings (merged over DEFAULT_SETTINGS) only when the project had NO schemas', () => {
    const p = newProject(); // schemas: []
    const next = insertSchema(p, entry());
    expect(next.settings.paperSize).toBe('A6');
    expect(next.settings.titleFont.family).toBe(DEFAULT_SETTINGS.titleFont.family); // backfilled
  });

  it('leaves the project global settings untouched when it already has a schema', () => {
    let p = newProject();
    p = { ...p, schemas: [{ id: 'sch_existing', name: 'Existing', fields: [], cardTemplates: [] }] };
    const next = insertSchema(p, entry());
    expect(next.settings.paperSize).toBe(DEFAULT_SETTINGS.paperSize); // untouched
    expect(next.schemas).toHaveLength(2);
  });

  it('is immutable — does not mutate the input project', () => {
    const p = newProject();
    const before = JSON.parse(JSON.stringify(p));
    insertSchema(p, entry());
    expect(p).toEqual(before);
  });
});
