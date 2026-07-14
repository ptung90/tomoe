import { describe, it, expect } from 'vitest';
import { newProject, type Project, type Schema, type RecordItem } from '../src/lib/modules/flashcards/model';
import type { SchemaField } from '../src/lib/modules/flashcards/model';
import * as ops from '../src/lib/modules/flashcards/recordOps';

function withSchema(): { p: Project; schema: Schema } {
  const p = newProject(); // locales ['en','vi']
  const schema: Schema = { id: 's1', name: 'Words', cardTemplates: [], fields: [
    { id: 'f1', key: 'title', label: 'Title', type: 'text', multilingual: true },
    { id: 'f2', key: 'note', label: 'Note', type: 'text-long', multilingual: true },
    { id: 'f3', key: 'pic', label: 'Pic', type: 'image' },
  ] };
  p.schemas.push(schema);
  return { p, schema };
}

describe('recordOps record CRUD', () => {
  it('addRecord seeds multilingual objects and a string image', () => {
    const { p } = withSchema();
    const { project, id } = ops.addRecord(p, 's1');
    expect(project.records).toHaveLength(1);
    const r = project.records[0];
    expect(r.id).toBe(id);
    expect(r.schemaId).toBe('s1');
    expect(r.fields.title).toEqual({ en: '', vi: '' });
    expect(r.fields.pic).toBe('');
    expect(p.records).toHaveLength(0); // input not mutated
  });

  it('setField updates one locale of a multilingual field', () => {
    const { p } = withSchema();
    const { project, id } = ops.addRecord(p, 's1');
    const p2 = ops.setField(project, id, 'title', 'Owl', 'en');
    expect(p2.records[0].fields.title).toEqual({ en: 'Owl', vi: '' });
    expect(project.records[0].fields.title).toEqual({ en: '', vi: '' }); // unmutated
  });

  it('setField sets a plain string for an image field (no locale)', () => {
    const { p } = withSchema();
    const { project, id } = ops.addRecord(p, 's1');
    const p2 = ops.setField(project, id, 'pic', 'data:img');
    expect(p2.records[0].fields.pic).toBe('data:img');
  });

  it('duplicateRecord inserts a clone right after the original with a new id', () => {
    const { p } = withSchema();
    const a = ops.addRecord(p, 's1');
    const withVal = ops.setField(a.project, a.id, 'title', 'Owl', 'en');
    const { project, id } = ops.duplicateRecord(withVal, a.id);
    expect(project.records).toHaveLength(2);
    expect(project.records[1].id).toBe(id);
    expect(id).not.toBe(a.id);
    expect(project.records[1].fields.title).toEqual({ en: 'Owl', vi: '' });
  });

  it('deleteRecord removes the record', () => {
    const { p } = withSchema();
    const { project, id } = ops.addRecord(p, 's1');
    const p2 = ops.deleteRecord(project, id);
    expect(p2.records).toHaveLength(0);
  });
});

describe('recordOps schema ops', () => {
  it('addSchema appends an empty schema and returns its id', () => {
    const p = newProject();
    const { project, id } = ops.addSchema(p, 'Phrases');
    expect(project.schemas).toHaveLength(1);
    expect(project.schemas[0]).toMatchObject({ id, name: 'Phrases', fields: [], cardTemplates: [] });
  });

  it('migrateRecordFields adds new fields empty and drops removed fields', () => {
    const { p } = withSchema();
    const added = ops.addRecord(p, 's1');
    const filled = ops.setField(added.project, added.id, 'title', 'Owl', 'en');
    // Remove 'note', add 'extra'
    const newFields: SchemaField[] = [
      { id: 'f1', key: 'title', label: 'Title', type: 'text', multilingual: true },
      { id: 'f4', key: 'extra', label: 'Extra', type: 'text', multilingual: true },
      { id: 'f3', key: 'pic', label: 'Pic', type: 'image' },
    ];
    const p2 = ops.updateSchema(filled, 's1', { fields: newFields });
    const r = p2.records[0];
    expect(r.fields.title).toEqual({ en: 'Owl', vi: '' }); // preserved
    expect(r.fields.extra).toEqual({ en: '', vi: '' });     // new
    expect('note' in r.fields).toBe(false);                 // dropped
  });

  it('migrateRecordFields converts a string into a multilingual object', () => {
    const p = newProject();
    p.schemas.push({ id: 's1', name: 'X', cardTemplates: [],
      fields: [{ id: 'f1', key: 'title', label: 'T', type: 'text', multilingual: true }] });
    p.records.push({ id: 'r1', schemaId: 's1', fieldsHash: '', fields: { title: 'hi' } });
    const p2 = ops.migrateRecordFields(p);
    expect(p2.records[0].fields.title).toEqual({ en: 'hi', vi: 'hi' });
  });

  it('updateSchema can rename', () => {
    const { p } = withSchema();
    const p2 = ops.updateSchema(p, 's1', { name: 'Renamed' });
    expect(p2.schemas[0].name).toBe('Renamed');
  });

  it('deleteSchema removes the schema and its records', () => {
    const { p } = withSchema();
    const added = ops.addRecord(p, 's1');
    const p2 = ops.deleteSchema(added.project, 's1');
    expect(p2.schemas).toHaveLength(0);
    expect(p2.records).toHaveLength(0);
  });
});

describe('recordOps locale + import', () => {
  it('addLocale extends locales and seeds the key in multilingual fields', () => {
    const { p } = withSchema();
    const added = ops.addRecord(p, 's1');
    const p2 = ops.addLocale(added.project, 'ja');
    expect(p2.locales).toContain('ja');
    expect(p2.records[0].fields.title).toEqual({ en: '', vi: '', ja: '' });
  });
  it('addLocale ignores duplicates and blanks', () => {
    const p = newProject();
    expect(ops.addLocale(p, 'en')).toBe(p);
    expect(ops.addLocale(p, '')).toBe(p);
  });
  it('removeLocale strips the key and fixes activeLocale', () => {
    const { p } = withSchema();
    const added = ops.addRecord(p, 's1');
    const p2 = ops.setActiveLocale(added.project, 'vi');
    const p3 = ops.removeLocale(p2, 'vi');
    expect(p3.locales).toEqual(['en']);
    expect(p3.activeLocale).toBe('en');
    expect(p3.records[0].fields.title).toEqual({ en: '' });
  });
  it('removeLocale refuses to remove the last locale', () => {
    const p = newProject();
    const one = ops.removeLocale(p, 'vi'); // now ['en']
    expect(ops.removeLocale(one, 'en')).toBe(one);
  });
  it('setActiveLocale only accepts known locales', () => {
    const p = newProject();
    expect(ops.setActiveLocale(p, 'zz')).toBe(p);
    expect(ops.setActiveLocale(p, 'vi').activeLocale).toBe('vi');
  });
  it('importRecords overwrite replaces that schema records only', () => {
    const { p } = withSchema();
    const seeded = ops.addRecord(p, 's1').project;
    const incoming: RecordItem[] = [{ id: '', schemaId: 'ignored', fieldsHash: '', fields: { title: { en: 'A', vi: '' } } }];
    const p2 = ops.importRecords(seeded, 's1', incoming, 'overwrite');
    expect(p2.records).toHaveLength(1);
    expect(p2.records[0].schemaId).toBe('s1'); // forced
    expect(p2.records[0].id).not.toBe('');      // id assigned
    expect(p2.records[0].fields.title).toEqual({ en: 'A', vi: '' });
  });
  it('importRecords append keeps existing', () => {
    const { p } = withSchema();
    const seeded = ops.addRecord(p, 's1').project;
    const p2 = ops.importRecords(seeded, 's1', [{ id: 'x', schemaId: 's1', fieldsHash: '', fields: {} }], 'append');
    expect(p2.records).toHaveLength(2);
  });
});
