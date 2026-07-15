import { describe, it, expect } from 'vitest';
import { newProject, serializeProject, parseProject, DEFAULT_SETTINGS } from '../src/lib/modules/flashcards/model';

describe('flashcards model', () => {
  it('newProject: empty arrays + default settings + version 1', () => {
    const p = newProject();
    expect(p.schemas).toEqual([]); expect(p.records).toEqual([]); expect(p.cards).toEqual([]);
    expect(p.locales).toContain('en'); expect(p.version).toBe(1);
    expect(p.settings.paperSize).toBe(DEFAULT_SETTINGS.paperSize);
  });
  it('default font is Lexend for title and content', () => {
    expect(DEFAULT_SETTINGS.titleFont.family).toBe('Lexend');
    expect(DEFAULT_SETTINGS.contentFont.family).toBe('Lexend');
  });
  it('parseProject migrates a legacy single-schema flashcard file (schema object → schemas[])', () => {
    const legacy = JSON.stringify({
      version: '1.0', project_name: 'Verbs', project_icon: '🐟',
      schema: { id: 'sch1', name: 'Words', fields: [{ id: 'f1', key: 'w', label: 'Word', type: 'text' }] },
      records: [{ fields: { w: 'go' } }, { id: 'r2', schemaId: 'sch1', fields: { w: 'run' } }],
      cards: [],
    });
    const p = parseProject(legacy);
    expect(p.projectName).toBe('Verbs');
    expect(p.projectIcon).toBe('🐟');
    expect(p.schemas).toHaveLength(1);
    expect(p.schemas[0].id).toBe('sch1');
    expect(p.schemas[0].cardTemplates).toEqual([]); // normalized
    expect(p.records).toHaveLength(2);
    expect(p.records.every((r) => r.schemaId === 'sch1')).toBe(true); // orphan record got the schema id
    expect(p.records[0].id).toMatch(/^rec_/); // missing id backfilled
  });
  it('serialize -> parse round-trips', () => {
    const p = newProject(); p.projectName = 'Birds';
    p.records.push({ id: 'rec_1', schemaId: 's1', fieldsHash: '', fields: { name: { en: 'Owl', vi: 'Cú' } } });
    expect(parseProject(serializeProject(p))).toEqual(p);
  });
  it('serialize ends with newline', () => { expect(serializeProject(newProject()).endsWith('\n')).toBe(true); });
  it('parseProject accepts legacy flashcard-creator JSON', () => {
    const legacy = JSON.stringify({ project_name:'Old', project_icon:'🐦',
      settings:{ paperSize:'A5' }, schemas:[], records:[],
      cards:[{ id:'c1', layout:'2x2', imageHeightPercent:80, images:[], title:'x', sections:[] }] });
    const p = parseProject(legacy);
    expect(p.projectName).toBe('Old'); expect(p.projectIcon).toBe('🐦');
    expect(p.settings.paperSize).toBe('A5'); expect(p.cards.length).toBe(1);
    expect(p.settings.border.color).toBe(DEFAULT_SETTINGS.border.color); // deep-merged default
    expect(p.locales).toContain('en');
  });
});
