import { describe, it, expect } from 'vitest';
import { newProject, serializeProject, parseProject, DEFAULT_SETTINGS } from '../src/lib/modules/flashcards/model';
import { LAYOUTS, LAYOUT_SLOTS, HIDE_TITLE_LAYOUTS } from '../src/lib/modules/flashcards/lib/layouts';

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
  it('serialize -> parse round-trips a schema with multilingual and legacy string field labels', () => {
    const p = newProject();
    p.schemas.push({
      id: 's1', name: 'Words', cardTemplates: [],
      fields: [
        { id: 'f1', key: 'def', label: { en: 'Definition', vi: 'Nghĩa' }, type: 'text', multilingual: true },
        { id: 'f2', key: 'note', label: 'Note', type: 'text', multilingual: false },
      ],
    });
    expect(parseProject(serializeProject(p))).toEqual(p);
  });
  it('serialize ends with newline', () => { expect(serializeProject(newProject()).endsWith('\n')).toBe(true); });
  it('pools a duplicated base64 image once in the file and round-trips it (shared reference)', () => {
    const IMG = 'data:image/png;base64,ZZZZ9999';
    const p = newProject();
    p.schemas.push({ id: 's1', name: 'Words', cardTemplates: [],
      fields: [{ id: 'f1', key: 'pic', label: 'Pic', type: 'image' }] });
    p.records.push({ id: 'r1', schemaId: 's1', fieldsHash: '', fields: { pic: IMG } });
    // same blob duplicated into two packed cards (as Pack All would, once per view)
    p.cards.push({ id: 'c1', layout: 'title-img-text', images: [{ slot: 0, url: IMG }], title: '', sections: [], orientation: 'portrait', recordId: 'r1', templateId: 't1' } as never);
    p.cards.push({ id: 'c2', layout: 'title-img-text', images: [{ slot: 0, url: IMG }], title: '', sections: [], orientation: 'portrait', recordId: 'r1', templateId: 't2' } as never);

    const text = serializeProject(p);
    expect(text.split('data:image/png;base64,ZZZZ9999').length - 1).toBe(1); // blob written exactly once
    expect(text).toContain('"_assets"');

    const back = parseProject(text);
    expect(back.records[0].fields.pic).toBe(IMG);        // content preserved
    expect(back.cards[0].images[0].url).toBe(IMG);
    expect(back.cards[0].images[0].url).toBe(back.cards[1].images[0].url); // shared string reference
    expect(back).toEqual(p);
  });
  it('still reads an old file with base64 stored inline (no _assets)', () => {
    const IMG = 'data:image/png;base64,OLDINLINE';
    const legacy = JSON.stringify({ version: 1, projectName: 'X', schemas: [], records: [{ id: 'r1', schemaId: 's', fieldsHash: '', fields: { pic: IMG } }], cards: [], locales: ['en'], activeLocale: 'en' });
    expect(parseProject(legacy).records[0].fields.pic).toBe(IMG);
  });
  it('DEFAULT_SETTINGS.image has borderRadius 0 and transparent backgroundColor', () => {
    expect(DEFAULT_SETTINGS.image.borderRadius).toBe(0);
    expect(DEFAULT_SETTINGS.image.backgroundColor).toBe('transparent');
  });
  it('parseProject fills image.borderRadius/backgroundColor defaults for files missing them', () => {
    const legacy = JSON.stringify({ projectName: 'Old', schemas: [], records: [], cards: [],
      settings: { image: { backgroundSize: 'contain', backgroundPosition: 'top' } } });
    const p = parseProject(legacy);
    expect(p.settings.image.backgroundSize).toBe('contain');
    expect(p.settings.image.borderRadius).toBe(0);
    expect(p.settings.image.backgroundColor).toBe('transparent');
  });
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
  it('parseProject folds legacy card.titleFont/contentFont into card.style and drops the top-level fields', () => {
    const legacy = JSON.stringify({
      projectName: 'Fonts', schemas: [], records: [],
      cards: [
        { id: 'c1', layout: 'fulltext', imageHeightPercent: 50, images: [], title: '', sections: [],
          titleFont: { family: 'serif', size: 20, color: '#000', lineHeight: 1.2 },
          contentFont: { family: 'monospace', size: 11, color: '#111', lineHeight: 1.1 } },
      ],
    });
    const p = parseProject(legacy);
    expect(p.cards).toHaveLength(1);
    const c = p.cards[0] as any;
    expect(c.style.titleFont).toEqual({ family: 'serif', size: 20, color: '#000', lineHeight: 1.2 });
    expect(c.style.contentFont).toEqual({ family: 'monospace', size: 11, color: '#111', lineHeight: 1.1 });
    expect(c.titleFont).toBeUndefined();
    expect(c.contentFont).toBeUndefined();
  });
  it('parseProject leaves a card with no legacy fonts and no style untouched (no style key added)', () => {
    const legacy = JSON.stringify({
      projectName: 'Plain', schemas: [], records: [],
      cards: [{ id: 'c1', layout: 'fulltext', imageHeightPercent: 50, images: [], title: '', sections: [] }],
    });
    const p = parseProject(legacy);
    expect((p.cards[0] as any).style).toBeUndefined();
  });
  it('parseProject migrates a legacy compound (3card) template + drops packed card snapshots', () => {
    const legacy = JSON.stringify({
      projectName: 'Legacy', schemas: [
        { id: 'sch1', name: 'Words',
          fields: [{ id: 'f1', key: 'w', label: 'Word', type: 'text' }],
          cardTemplates: [{ id: 't1', templateType: 'compound', layout: '3card', size: null, mapping: {} }] },
      ],
      records: [{ id: 'r1', schemaId: 'sch1', fields: { w: 'go' } }],
      cards: [
        { id: 'c1', layout: '3card', imageHeightPercent: 50, images: [], title: '', sections: [], packedRecordIds: ['r1', 'r2', 'r3'] },
      ],
    });
    const p = parseProject(legacy);
    expect(p.schemas[0].cardTemplates[0].layout).toBe('title-img-text');
    expect(p.schemas[0].cardTemplates[0].templateType).toBe('single');
    expect((p.schemas[0].cardTemplates[0] as any).cardsPerPage).toBe(3);
    expect(p.cards.every((c) => !(c as any).packedRecordIds?.length)).toBe(true);
    expect(p.cards).toHaveLength(0); // the only card was a compound snapshot — dropped
  });
  it('parseProject folds a legacy top-level template.orientation into style.orientation and drops the top-level field', () => {
    const legacy = JSON.stringify({
      projectName: 'Orient', schemas: [
        { id: 'sch1', name: 'Words',
          fields: [{ id: 'f1', key: 'w', label: 'Word', type: 'text' }],
          cardTemplates: [{ id: 't1', templateType: 'single', layout: 'fulltext', size: null, orientation: 'landscape', mapping: {} }] },
      ],
      records: [], cards: [],
    });
    const p = parseProject(legacy);
    const t = p.schemas[0].cardTemplates[0] as any;
    expect(t.style.orientation).toBe('landscape');
    expect(t.orientation).toBeUndefined();
  });
  it('parseProject migrates legacy hideTitle:true → drops the schema title field from the view + clears the flag', () => {
    const legacy = JSON.stringify({
      projectName: 'HT', schemas: [
        { id: 'sch1', name: 'Words',
          fields: [
            { id: 'f1', key: 'name', label: 'Name', type: 'text' },
            { id: 'f2', key: 'def', label: 'Def', type: 'text' },
          ],
          cardTemplates: [{ id: 't1', templateType: 'single', layout: 'fulltext', size: null, hideTitle: true, mapping: {} }] },
      ],
      records: [], cards: [],
    });
    const t = parseProject(legacy).schemas[0].cardTemplates[0] as any;
    expect(t.hideTitle).toBeUndefined();                 // flag gone
    expect(t.fields).toEqual(['def']);                   // title field ('name', schema's first text) dropped; rest kept
  });
});

describe('layout registry', () => {
  it('exposes 12 unique layout ids', () => {
    expect(LAYOUTS).toHaveLength(12);
    expect(new Set(LAYOUTS.map((l) => l.id)).size).toBe(12);
  });
  it('1big-2small has 3 slots', () => {
    expect(LAYOUT_SLOTS['1big-2small']).toBe(3);
  });
  it('HIDE_TITLE_LAYOUTS is exactly fulltext + fullimage', () => {
    expect(HIDE_TITLE_LAYOUTS).toEqual(new Set(['fulltext', 'fullimage']));
  });
});
