import { describe, it, expect } from 'vitest';
import { newProject, type Project, type Schema } from '../src/lib/modules/flashcards/model';
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
