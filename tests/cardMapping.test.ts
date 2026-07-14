import { describe, it, expect } from 'vitest';
import { newProject, DEFAULT_SETTINGS, type Schema, type RecordItem } from '../src/lib/modules/flashcards/model';
import { deriveAutoTemplate, recordToCard, applySettings, applyTemplatePatch } from '../src/lib/modules/flashcards/cardMapping';

function schema(): Schema {
  return { id: 's1', name: 'Words', cardTemplates: [], fields: [
    { id: 'f1', key: 'title', label: 'Title', type: 'text', multilingual: true },
    { id: 'f2', key: 'def', label: 'Definition', type: 'text-long', multilingual: true },
    { id: 'f3', key: 'pic', label: 'Pic', type: 'image' },
  ] };
}

describe('deriveAutoTemplate', () => {
  it('picks an image layout when the schema has an image field', () => {
    const t = deriveAutoTemplate(schema());
    expect(t.layout).toBe('1top-1bot');
    expect(t.templateType).toBe('single');
  });
  it('picks fulltext when there is no image field', () => {
    const s = schema(); s.fields = s.fields.filter(f => f.type !== 'image');
    expect(deriveAutoTemplate(s).layout).toBe('fulltext');
  });
});

describe('recordToCard', () => {
  const rec: RecordItem = { id: 'r1', schemaId: 's1', fieldsHash: '', fields: {
    title: { en: 'Owl', vi: 'Cú' }, def: { en: 'a bird', vi: 'con chim' }, pic: 'http://x/o.png',
  } };
  it('maps first text field to title, rest to sections, image field to a slot', () => {
    const t = deriveAutoTemplate(schema());
    const c = recordToCard(rec, schema(), t, DEFAULT_SETTINGS, 'en');
    expect(c.title).toBe('Owl');
    expect(c.sections).toHaveLength(1);
    expect(c.sections[0].label).toBe('Definition');
    expect(c.sections[0].content).toBe('a bird');
    expect(c.images[0]).toMatchObject({ slot: 0, url: 'http://x/o.png' });
    expect(c.layout).toBe('1top-1bot');
  });
  it('resolves the requested locale', () => {
    const c = recordToCard(rec, schema(), deriveAutoTemplate(schema()), DEFAULT_SETTINGS, 'vi');
    expect(c.title).toBe('Cú');
    expect(c.sections[0].content).toBe('con chim');
  });
  it('tolerates a record with missing fields (no image, empty section)', () => {
    const bare: RecordItem = { id: 'r2', schemaId: 's1', fieldsHash: '', fields: {} };
    const c = recordToCard(bare, schema(), deriveAutoTemplate(schema()), DEFAULT_SETTINGS, 'en');
    expect(c.images).toHaveLength(0);
    expect(c.title).toBe('');
    expect(c.sections[0].content).toBe('');
  });
  it('falls through to the live settings.orientation when the template has no explicit orientation (auto-derived template)', () => {
    const t = deriveAutoTemplate(schema());
    const settings = { ...DEFAULT_SETTINGS, orientation: 'landscape' as const };
    const c = recordToCard(rec, schema(), t, settings, 'en');
    expect(c.orientation).toBe('landscape');
  });
});

describe('applySettings / applyTemplatePatch', () => {
  it('applySettings deep-merges border + fonts without mutating input', () => {
    const p = newProject();
    const p2 = applySettings(p, { border: { width: 8 } as any, paperSize: 'A4' });
    expect(p2.settings.border.width).toBe(8);
    expect(p2.settings.border.color).toBe(p.settings.border.color); // preserved
    expect(p2.settings.paperSize).toBe('A4');
    expect(p.settings.border.width).not.toBe(8); // unmutated
  });
  it('applyTemplatePatch creates the schema template then patches it', () => {
    const p = newProject(); p.schemas.push(schema());
    const p2 = applyTemplatePatch(p, 's1', { layout: '2x2' });
    expect(p2.schemas[0].cardTemplates[0].layout).toBe('2x2');
    const p3 = applyTemplatePatch(p2, 's1', { orientation: 'landscape' });
    expect(p3.schemas[0].cardTemplates[0].layout).toBe('2x2'); // preserved
    expect(p3.schemas[0].cardTemplates[0].orientation).toBe('landscape');
  });
});
