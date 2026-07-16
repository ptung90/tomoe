import { describe, it, expect } from 'vitest';
import { newProject, DEFAULT_SETTINGS, type Schema, type RecordItem, type CardTemplate, type Settings } from '../src/lib/modules/flashcards/model';
import { deriveAutoTemplate, recordToCard, applySettings, applyTemplatePatch, applyTemplateStyle, chunkRecords, viewLabel, addView, renameView, deleteView, setViewFields } from '../src/lib/modules/flashcards/cardMapping';
import * as ops from '../src/lib/modules/flashcards/cardOps';

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
  it('is deterministic per schema — every call for the SAME schema agrees on the same id, so callers ' +
     '(packRecords, collectPrintCards/Sheets, CardGallery) match a virgin schema\'s packed cards by templateId', () => {
    const s = schema();
    const a = deriveAutoTemplate(s);
    const b = deriveAutoTemplate(s);
    expect(a.id).toBe(b.id);
    expect(a.id).toBe(`${s.id}::auto`);
  });
  it('different schemas derive different (non-colliding) auto-template ids', () => {
    const s1 = schema();
    const s2 = { ...schema(), id: 's2' };
    expect(deriveAutoTemplate(s1).id).not.toBe(deriveAutoTemplate(s2).id);
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
  it('resolves an {en,vi} field label to the active locale in a section label', () => {
    const s = schema();
    s.fields = s.fields.map((f) => (f.key === 'def' ? { ...f, label: { en: 'Definition', vi: 'Nghĩa' } } : f));
    const c = recordToCard(rec, s, deriveAutoTemplate(s), DEFAULT_SETTINGS, 'vi');
    expect(c.sections[0].label).toBe('Nghĩa');
  });
  it('falls back to another locale when the active one\'s label is blank', () => {
    const s = schema();
    s.fields = s.fields.map((f) => (f.key === 'def' ? { ...f, label: { en: 'Definition', vi: '' } } : f));
    const c = recordToCard(rec, s, deriveAutoTemplate(s), DEFAULT_SETTINGS, 'vi');
    expect(c.sections[0].label).toBe('Definition');
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
  it('applyTemplatePatch(templateId=null) creates the schema\'s first template then patches it', () => {
    const p = newProject(); p.schemas.push(schema());
    const p2 = applyTemplatePatch(p, 's1', null, { layout: '2x2' });
    expect(p2.schemas[0].cardTemplates[0].layout).toBe('2x2');
    const p3 = applyTemplatePatch(p2, 's1', null, { orientation: 'landscape' });
    expect(p3.schemas[0].cardTemplates[0].layout).toBe('2x2'); // preserved
    expect(p3.schemas[0].cardTemplates[0].orientation).toBe('landscape');
  });
  it('applyTemplatePatch targets a specific templateId, leaving other views untouched', () => {
    const p = newProject();
    const s = schema();
    s.cardTemplates = [
      { id: 't1', templateType: 'single', layout: 'fulltext', mapping: {} },
      { id: 't2', templateType: 'single', layout: 'fullimage', mapping: {} },
    ];
    p.schemas.push(s);
    const p2 = applyTemplatePatch(p, 's1', 't2', { hideTitle: true });
    expect(p2.schemas[0].cardTemplates[0]).toMatchObject({ layout: 'fulltext' }); // t1 untouched
    expect(p2.schemas[0].cardTemplates[1]).toMatchObject({ layout: 'fullimage', hideTitle: true });
  });
  it('applyTemplatePatch with a stale/unknown templateId falls back to the first view (no duplicate created)', () => {
    const p = newProject(); const s = schema();
    s.cardTemplates = [{ id: 't1', templateType: 'single', layout: 'fulltext', mapping: {} }];
    p.schemas.push(s);
    const p2 = applyTemplatePatch(p, 's1', 'not-a-real-id', { hideTitle: true });
    expect(p2.schemas[0].cardTemplates).toHaveLength(1);
    expect(p2.schemas[0].cardTemplates[0]).toMatchObject({ layout: 'fulltext', hideTitle: true });
  });

  describe('applyTemplateStyle (templateId)', () => {
    it('targets a specific templateId', () => {
      const p = newProject();
      const s = schema();
      s.cardTemplates = [
        { id: 't1', templateType: 'single', layout: 'fulltext', mapping: {} },
        { id: 't2', templateType: 'single', layout: 'fullimage', mapping: {} },
      ];
      p.schemas.push(s);
      const p2 = applyTemplateStyle(p, 's1', 't2', { border: { width: 9 } });
      expect(p2.schemas[0].cardTemplates[0].style).toBeUndefined();
      expect(p2.schemas[0].cardTemplates[1].style?.border?.width).toBe(9);
    });
  });

  describe('views (addView/renameView/deleteView/setViewFields)', () => {
    it('addView on a virgin schema (no persisted templates) materializes the implicit view 1, then appends view 2', () => {
      const p = newProject(); p.schemas.push(schema()); // schema().cardTemplates === []
      const { project: p2, id } = addView(p, 's1');
      expect(id).toBeTruthy();
      expect(p2.schemas[0].cardTemplates).toHaveLength(2); // baseline (materialized) + the new one
      expect(p2.schemas[0].cardTemplates[1].id).toBe(id);  // the new view is the 2nd
    });
    it('addView on a schema that already has views just appends one more', () => {
      const p = newProject();
      const s = schema();
      s.cardTemplates = [{ id: 't1', templateType: 'single', layout: 'fulltext', mapping: {} }];
      p.schemas.push(s);
      const { project: p2, id } = addView(p, 's1');
      expect(p2.schemas[0].cardTemplates).toHaveLength(2);
      expect(p2.schemas[0].cardTemplates[0].id).toBe('t1'); // untouched
      expect(p2.schemas[0].cardTemplates[1].id).toBe(id);
    });
    it('addView on a missing schema is a no-op', () => {
      const p = newProject();
      const { project: p2, id } = addView(p, 'missing');
      expect(id).toBeNull();
      expect(p2).toBe(p);
    });
    it('renameView sets an explicit name on the addressed template only', () => {
      const p = newProject();
      const s = schema();
      s.cardTemplates = [
        { id: 't1', templateType: 'single', layout: 'fulltext', mapping: {} },
        { id: 't2', templateType: 'single', layout: 'fullimage', mapping: {} },
      ];
      p.schemas.push(s);
      const p2 = renameView(p, 's1', 't2', 'Cover');
      expect(p2.schemas[0].cardTemplates[0].name).toBeUndefined();
      expect(p2.schemas[0].cardTemplates[1].name).toBe('Cover');
    });
    it('deleteView removes the addressed template when more than one view exists', () => {
      const p = newProject();
      const s = schema();
      s.cardTemplates = [
        { id: 't1', templateType: 'single', layout: 'fulltext', mapping: {} },
        { id: 't2', templateType: 'single', layout: 'fullimage', mapping: {} },
      ];
      p.schemas.push(s);
      const p2 = deleteView(p, 's1', 't1');
      expect(p2.schemas[0].cardTemplates).toHaveLength(1);
      expect(p2.schemas[0].cardTemplates[0].id).toBe('t2');
    });
    it('deleteView drops cards packed against the deleted view, leaving the survivor\'s cards intact ' +
      '(otherwise they linger in project.cards forever, invisible bloat)', () => {
      const p0 = newProject();
      const s: Schema = { id: 's1', name: 'Words', cardTemplates: [
        { id: 't1', templateType: 'single', layout: 'fulltext', mapping: {} },
        { id: 't2', templateType: 'single', layout: 'fullimage', mapping: {}, fields: ['pic'] },
      ], fields: [
        { id: 'f1', key: 'title', label: 'Title', type: 'text', multilingual: true },
        { id: 'f2', key: 'pic', label: 'Pic', type: 'image' },
      ] };
      p0.schemas.push(s);
      for (let i = 0; i < 3; i++) {
        p0.records.push({ id: 'r' + i, schemaId: 's1', fieldsHash: '', fields: { title: { en: 'W' + i, vi: '' }, pic: 'http://x/' + i + '.png' } });
      }
      let p = ops.packAllForSchema(p0, 's1');
      expect(p.cards).toHaveLength(6); // 3 records x 2 views
      p = deleteView(p, 's1', 't2');
      expect(p.schemas[0].cardTemplates).toHaveLength(1);
      expect(p.cards).toHaveLength(3);
      expect(p.cards.every((c) => c.templateId !== 't2')).toBe(true);
    });
    it('deleteView refuses to delete the last remaining view', () => {
      const p = newProject();
      const s = schema();
      s.cardTemplates = [{ id: 't1', templateType: 'single', layout: 'fulltext', mapping: {} }];
      p.schemas.push(s);
      const p2 = deleteView(p, 's1', 't1');
      expect(p2.schemas[0].cardTemplates).toHaveLength(1);
      expect(p2).toBe(p); // unchanged reference — refused
    });
    it('setViewFields sets the selected field keys on the addressed template', () => {
      const p = newProject();
      const s = schema();
      s.cardTemplates = [{ id: 't1', templateType: 'single', layout: 'fulltext', mapping: {} }];
      p.schemas.push(s);
      const p2 = setViewFields(p, 's1', 't1', ['def']);
      expect(p2.schemas[0].cardTemplates[0].fields).toEqual(['def']);
    });
  });
});

describe('chunkRecords', () => {
  it('splits into consecutive chunks', () => {
    expect(chunkRecords([1, 2, 3, 4], 3)).toEqual([[1, 2, 3], [4]]);
    expect(chunkRecords([1, 2], 1)).toEqual([[1], [2]]);
    expect(chunkRecords([], 3)).toEqual([]);
    expect(chunkRecords([1, 2], 0)).toEqual([[1], [2]]); // size<1 → 1
  });
});

describe('recordToCard — field selection (views)', () => {
  const rec: RecordItem = { id: 'r1', schemaId: 's1', fieldsHash: '', fields: {
    title: { en: 'Owl', vi: 'Cú' }, def: { en: 'a bird', vi: 'con chim' }, pic: 'http://x/o.png',
  } };
  it('template.fields=["pic"] with a fullimage layout includes only the image, no title/sections', () => {
    const t = { ...deriveAutoTemplate(schema()), layout: 'fullimage', fields: ['pic'] };
    const c = recordToCard(rec, schema(), t, DEFAULT_SETTINGS, 'en');
    expect(c.images[0]).toMatchObject({ slot: 0, url: 'http://x/o.png' });
    expect(c.title).toBe('');
    expect(c.sections).toHaveLength(0);
  });
  it('template.fields=["def"] (title field NOT selected) renders def as a SECTION, not the title (never dropped)', () => {
    // 'title' is the schema's designated title field; a view that omits it has no title, and its
    // selected fields all render as sections — so a content-only view is never an empty card.
    const t = { ...deriveAutoTemplate(schema()), layout: 'fulltext', fields: ['def'] };
    const c = recordToCard(rec, schema(), t, DEFAULT_SETTINGS, 'en');
    expect(c.title).toBe('');
    expect(c.sections).toHaveLength(1);
    expect(c.sections[0].label).toBe('Definition');
    expect(c.sections[0].content).toBe('a bird');
    expect(c.images).toHaveLength(0);
  });
  it('the title is the schema\'s title field (regardless of the view\'s field order); the rest are sections', () => {
    const t = { ...deriveAutoTemplate(schema()), layout: 'fulltext', fields: ['def', 'title'] };
    const c = recordToCard(rec, schema(), t, DEFAULT_SETTINGS, 'en');
    expect(c.title).toBe('Owl');            // 'title' is the schema's designated title field
    expect(c.sections).toHaveLength(1);
    expect(c.sections[0].label).toBe('Definition');
    expect(c.sections[0].content).toBe('a bird');
  });
  it('an empty fields array behaves like undefined — all fields, unchanged', () => {
    const t = { ...deriveAutoTemplate(schema()), fields: [] };
    const c = recordToCard(rec, schema(), t, DEFAULT_SETTINGS, 'en');
    expect(c.title).toBe('Owl');
    expect(c.sections).toHaveLength(1);
    expect(c.images).toHaveLength(1);
  });
});

function countrySchema(): Schema {
  return {
    id: 'sch_c', name: 'Country',
    fields: [
      { id: 'f1', key: 'name', label: 'Name', type: 'text' },
      { id: 'f2', key: 'capital', label: 'Capital', type: 'text' },
      { id: 'f3', key: 'language', label: 'Language', type: 'text' },
      { id: 'f4', key: 'imageFlag', label: 'Flag', type: 'image' },
      { id: 'f5', key: 'contentLandscape', label: 'Landscape', type: 'text-long' },
      { id: 'f6', key: 'imageLandscape', label: 'Landscape image', type: 'image' },
      { id: 'f7', key: 'contentFood', label: 'Food', type: 'text-long' },
      { id: 'f8', key: 'imageFood', label: 'Food image', type: 'image' },
    ],
    cardTemplates: [],
  };
}
function countryRecord(): RecordItem {
  return { id: 'rec_c', schemaId: 'sch_c', fieldsHash: '', fields: {
    name: 'Vietnam', capital: 'Hanoi', language: 'Vietnamese',
    imageFlag: 'flag.png', contentLandscape: '- Coastline\n- Ha Long Bay', imageLandscape: 'halong.png',
    contentFood: '- Pho\n- Banh Mi', imageFood: 'pho.png',
  } };
}
const S: Settings = DEFAULT_SETTINGS;

describe('recordToCard — flow layout', () => {
  it('page mode: title + meta lines + sections with paired images + header image', () => {
    const schema = countrySchema();
    const tpl: CardTemplate = { id: 't1', templateType: 'single', layout: 'country-page', mapping: {},
      fields: ['name', 'capital', 'language', 'imageFlag', 'contentLandscape', 'imageLandscape', 'contentFood', 'imageFood'] };
    const card = recordToCard(countryRecord(), schema, tpl, S, 'en');
    expect(card.title).toContain('Vietnam');
    expect(card.meta?.map((m) => m.value)).toEqual(['Hanoi', 'Vietnamese']);
    expect(card.headerImage?.url).toBe('flag.png');
    expect(card.sections.map((s) => s.label)).toEqual(['Landscape', 'Food']);
    expect(card.sections[0].image?.url).toBe('halong.png');
    expect(card.sections[1].image?.url).toBe('pho.png');
  });
  it('collage mode: no long-text fields → all images become tiles, title kept', () => {
    const schema = countrySchema();
    const tpl: CardTemplate = { id: 't0', templateType: 'single', layout: 'country-cover', mapping: {},
      fields: ['name', 'imageFlag', 'imageLandscape', 'imageFood'] };
    const card = recordToCard(countryRecord(), schema, tpl, S, 'en');
    expect(card.title).toContain('Vietnam');
    expect(card.images.map((i) => i.url)).toEqual(['flag.png', 'halong.png', 'pho.png']);
    expect(card.sections).toHaveLength(0);
  });
});

describe('viewLabel', () => {
  const sch = schema();
  it('uses the explicit name when set', () => {
    const t = { ...deriveAutoTemplate(sch), name: 'Cover' };
    expect(viewLabel(t, sch, 0, 'en')).toBe('Cover');
  });
  it('derives from a single selected field\'s label', () => {
    const t = { ...deriveAutoTemplate(sch), fields: ['pic'] };
    expect(viewLabel(t, sch, 0, 'en')).toBe('Pic');
  });
  it('joins several selected fields\' labels with " + "', () => {
    const t = { ...deriveAutoTemplate(sch), fields: ['title', 'def'] };
    expect(viewLabel(t, sch, 0, 'en')).toBe('Title + Definition');
  });
  it('truncates a long joined label to <=24 chars with a trailing ellipsis', () => {
    const longSchema: Schema = { id: 's2', name: 'Long', cardTemplates: [], fields: [
      { id: 'f1', key: 'a', label: 'A Very Long Field Label', type: 'text' },
      { id: 'f2', key: 'b', label: 'Another Long Field Label', type: 'text' },
    ] };
    const t = { ...deriveAutoTemplate(longSchema), fields: ['a', 'b'] };
    const label = viewLabel(t, longSchema, 0, 'en');
    expect(label.length).toBeLessThanOrEqual(24);
    expect(label.endsWith('…')).toBe(true);
  });
  it('falls back to "View {n}" (1-based) when no fields are selected and no name is set', () => {
    const t = deriveAutoTemplate(sch); // no fields, no name
    expect(viewLabel(t, sch, 0, 'en')).toBe('View 1');
    expect(viewLabel(t, sch, 2, 'en')).toBe('View 3');
  });
  it('resolves a single selected field\'s {en,vi} label to the requested locale', () => {
    const mlSchema: Schema = { id: 's3', name: 'ML', cardTemplates: [], fields: [
      { id: 'f1', key: 'def', label: { en: 'Definition', vi: 'Nghĩa' }, type: 'text' },
    ] };
    const t = { ...deriveAutoTemplate(mlSchema), fields: ['def'] };
    expect(viewLabel(t, mlSchema, 0, 'vi')).toBe('Nghĩa');
    expect(viewLabel(t, mlSchema, 0, 'en')).toBe('Definition');
  });
  it('falls back to another locale when the requested one is blank, in a joined label', () => {
    const mlSchema: Schema = { id: 's4', name: 'ML2', cardTemplates: [], fields: [
      { id: 'f1', key: 'a', label: { en: 'Word', vi: '' }, type: 'text' },
      { id: 'f2', key: 'b', label: 'Note', type: 'text' },
    ] };
    const t = { ...deriveAutoTemplate(mlSchema), fields: ['a', 'b'] };
    expect(viewLabel(t, mlSchema, 0, 'vi')).toBe('Word + Note');
  });
});
