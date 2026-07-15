import { describe, it, expect } from 'vitest';
import { serializeSchemaExport, parseSchemaExport, looksLikeSchemaFile } from '../src/lib/modules/flashcards/io/schemaIO';
import { DEFAULT_SETTINGS, type Schema, type Settings } from '../src/lib/modules/flashcards/model';

function sampleSchema(): Schema {
  return {
    id: 'sch_1', name: 'Words',
    fields: [{ id: 'f1', key: 'w', label: 'Word', type: 'text', multilingual: true }],
    cardTemplates: [{
      id: 'tpl_1', templateType: 'single', layout: 'fulltext', size: null, mapping: {},
      fields: ['w'], gridCols: 2, gridRows: 3,
      style: { border: { width: 6 } },
    }],
  };
}
function sampleSettings(): Settings {
  return { ...DEFAULT_SETTINGS, paperSize: 'A6', border: { ...DEFAULT_SETTINGS.border, color: '#111111' } };
}

describe('serializeSchemaExport', () => {
  it('emits the tomoeSchema marker + name/fields/cardTemplates + settings, ending with a newline', () => {
    const text = serializeSchemaExport(sampleSchema(), sampleSettings());
    expect(text.endsWith('\n')).toBe(true);
    const parsed = JSON.parse(text);
    expect(parsed.tomoeSchema).toBe(1);
    expect(parsed.schema.name).toBe('Words');
    expect(parsed.schema.fields).toEqual(sampleSchema().fields);
    expect(parsed.schema.cardTemplates).toEqual(sampleSchema().cardTemplates);
    expect(parsed.settings.paperSize).toBe('A6');
    expect(parsed.schema.id).toBeUndefined(); // no id — a fresh one is assigned on insert
  });
  it('never includes records or cards even if present on the input object', () => {
    const withExtra = { ...sampleSchema(), records: [{ id: 'r1' }], cards: [{ id: 'c1' }] } as any;
    const text = serializeSchemaExport(withExtra, sampleSettings());
    const parsed = JSON.parse(text);
    expect(parsed.records).toBeUndefined();
    expect(parsed.cards).toBeUndefined();
    expect(parsed.schema.records).toBeUndefined();
  });
  it('deep-clones — mutating the source after serializing does not change the emitted text', () => {
    const schema = sampleSchema();
    const settings = sampleSettings();
    const text = serializeSchemaExport(schema, settings);
    schema.fields[0].label = 'MUTATED';
    settings.paperSize = 'Letter';
    expect(text).not.toContain('MUTATED');
    expect(JSON.parse(text).settings.paperSize).toBe('A6');
  });
});

describe('parseSchemaExport', () => {
  it('round-trips a serialized schema (fields + cardTemplates incl. style/fields/gridCols) + settings', () => {
    const schema = sampleSchema();
    const settings = sampleSettings();
    const text = serializeSchemaExport(schema, settings);
    const { schema: outSchema, settings: outSettings } = parseSchemaExport(text);
    expect(outSchema.name).toBe('Words');
    expect(outSchema.fields).toEqual(schema.fields);
    expect(outSchema.cardTemplates).toEqual(schema.cardTemplates);
    expect(outSettings.paperSize).toBe('A6');
    expect(outSettings.border.color).toBe('#111111');
  });
  it('merges settings over DEFAULT_SETTINGS for forward-safety (missing keys backfilled)', () => {
    const text = JSON.stringify({ tomoeSchema: 1, schema: { name: 'X', fields: [], cardTemplates: [] }, settings: { paperSize: 'A6' } }) + '\n';
    const { settings } = parseSchemaExport(text);
    expect(settings.paperSize).toBe('A6');
    expect(settings.titleFont.family).toBe(DEFAULT_SETTINGS.titleFont.family); // backfilled
    expect(settings.border).toEqual(DEFAULT_SETTINGS.border); // backfilled
  });
  it('throws "Not a valid Tomoe schema file" when the tomoeSchema marker is missing', () => {
    const text = JSON.stringify({ schema: { name: 'X', fields: [], cardTemplates: [] }, settings: {} });
    expect(() => parseSchemaExport(text)).toThrow('Not a valid Tomoe schema file');
  });
  it('throws when schema.fields or schema.cardTemplates is not an array', () => {
    const text = JSON.stringify({ tomoeSchema: 1, schema: { name: 'X' }, settings: {} });
    expect(() => parseSchemaExport(text)).toThrow('Not a valid Tomoe schema file');
  });
  it('throws on unparseable JSON', () => {
    expect(() => parseSchemaExport('not json')).toThrow('Not a valid Tomoe schema file');
  });
});

describe('looksLikeSchemaFile', () => {
  it('true for a marked schema export', () => {
    expect(looksLikeSchemaFile(serializeSchemaExport(sampleSchema(), sampleSettings()))).toBe(true);
  });
  it('false for a normal .tomoe.json project (no marker)', () => {
    expect(looksLikeSchemaFile(JSON.stringify({ projectName: 'P', schemas: [], records: [], cards: [] }))).toBe(false);
  });
  it('false for junk text, never throws', () => {
    expect(looksLikeSchemaFile('not json')).toBe(false);
    expect(looksLikeSchemaFile('')).toBe(false);
  });
});
