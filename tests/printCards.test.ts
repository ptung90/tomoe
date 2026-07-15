import { describe, it, expect } from 'vitest';
import { newProject, DEFAULT_SETTINGS, type Project, type Schema, type CardTemplate, type Card } from '../src/lib/modules/flashcards/model';
import * as cardOps from '../src/lib/modules/flashcards/cardOps';
import { collectPrintCards, collectPrintSheets, mergeLeftoverSheets, type Sheet } from '../src/lib/modules/flashcards/lib/printCards';
import { sheetLayout } from '../src/lib/modules/flashcards/lib/card-render';

function proj(layout: string, n: number, templatePatch: Partial<CardTemplate> = {}): Project {
  const p = newProject();
  const schema: Schema = { id: 's1', name: 'W', cardTemplates: [
    { id: 't1', templateType: 'single', layout, size: null, orientation: undefined, hideTitle: false, hideSectionLabels: false, mapping: {}, ...templatePatch },
  ], fields: [{ id: 'f1', key: 'title', label: 'T', type: 'text', multilingual: true }] };
  p.schemas.push(schema);
  for (let i = 0; i < n; i++) p.records.push({ id: 'r' + i, schemaId: 's1', fieldsHash: '', fields: { title: { en: 'W' + i, vi: '' } } });
  return p;
}

describe('collectPrintCards', () => {
  it('single layout → one card per record', () => {
    expect(collectPrintCards(proj('1top-1bot', 3))).toHaveLength(3);
  });
  it('packed cards + auto for unpacked (pack all → all packed, all auto-derived otherwise)', () => {
    const packed = cardOps.packAllForSchema(proj('1top-1bot', 4), 's1');
    const cards = collectPrintCards(packed);
    expect(cards).toHaveLength(4);
    expect(cards.every((c) => c.recordId)).toBe(true); // all packed snapshots
  });
  it('empty project → []', () => {
    expect(collectPrintCards(newProject())).toEqual([]);
  });
});

describe('collectPrintSheets', () => {
  it('fixed grid: 7 records, cardsPerPage 6 → 2 sheets (6 + 1)', () => {
    const sheets = collectPrintSheets(proj('1top-1bot', 7, { cardsPerPage: 6 }));
    expect(sheets).toHaveLength(2);
    expect(sheets[0].cards).toHaveLength(6);
    expect(sheets[1].cards).toHaveLength(1);
    expect(sheets[0].lay.perPage).toBe(6);
    expect(sheets[0].lay.fillCell).toBe(true);
  });
  it('auto-fit: sheet count = ceil(records/perPage)', () => {
    const p = proj('1top-1bot', 7, { autoFit: true, cardSize: 'A7' });
    const sheets = collectPrintSheets(p);
    const perPage = sheets[0].lay.perPage;
    expect(sheets).toHaveLength(Math.ceil(7 / perPage));
    const total = sheets.reduce((n, s) => n + s.cards.length, 0);
    expect(total).toBe(7);
    expect(sheets[0].lay.fillCell).toBe(false);
  });
  it('empty project → []', () => {
    expect(collectPrintSheets(newProject())).toEqual([]);
  });
  it('template.style.orientation drives the sheet layout + resolved settings (single source of truth)', () => {
    const p = proj('1top-1bot', 2, { style: { orientation: 'landscape' } });
    const sheets = collectPrintSheets(p);
    expect(sheets[0].lay.orient).toBe('landscape');
    expect(sheets[0].settings.orientation).toBe('landscape');
  });
});

function projViews(views: Array<Partial<CardTemplate> & { layout: string }>, n: number): Project {
  const p = newProject();
  const schema: Schema = {
    id: 's1', name: 'W',
    cardTemplates: views.map((v, i) => ({ id: 't' + i, templateType: 'single', size: null, orientation: undefined,
      hideTitle: false, hideSectionLabels: false, mapping: {}, ...v })),
    fields: [{ id: 'f1', key: 'title', label: 'T', type: 'text', multilingual: true }],
  };
  p.schemas.push(schema);
  for (let i = 0; i < n; i++) p.records.push({ id: 'r' + i, schemaId: 's1', fieldsHash: '', fields: { title: { en: 'W' + i, vi: '' } } });
  return p;
}

function schemaWithCardsPerPage(id: string, cardsPerPage: number): Schema {
  return {
    id, name: id,
    cardTemplates: [{ id: id + '-t', templateType: 'single', layout: 'fulltext', size: null, cardsPerPage, mapping: {} }],
    fields: [{ id: 'f1', key: 'title', label: 'T', type: 'text', multilingual: true }],
  };
}

describe('collectPrintCards — multi-view', () => {
  it('one card per (record x view), grouped by view then record', () => {
    const p = projViews([{ layout: 'fulltext' }, { layout: 'fullimage' }], 3);
    const cards = collectPrintCards(p);
    expect(cards).toHaveLength(6);
    expect(cards.slice(0, 3).every((c) => c.layout === 'fulltext')).toBe(true);
    expect(cards.slice(3, 6).every((c) => c.layout === 'fullimage')).toBe(true);
  });
});

describe('collectPrintSheets — grouped by view', () => {
  it('emits all of view 1\'s sheets before any of view 2\'s (no leftover merge needed — both evenly divide)', () => {
    const p = projViews([
      { layout: 'fulltext', cardsPerPage: 2 },
      { layout: 'fullimage', cardsPerPage: 2 },
    ], 4); // each view: 4 records / 2 per page = 2 full sheets, no partials
    const sheets = collectPrintSheets(p);
    expect(sheets).toHaveLength(4);
    expect(sheets[0].cards.every((c) => c.layout === 'fulltext')).toBe(true);
    expect(sheets[1].cards.every((c) => c.layout === 'fulltext')).toBe(true);
    expect(sheets[2].cards.every((c) => c.layout === 'fullimage')).toBe(true);
    expect(sheets[3].cards.every((c) => c.layout === 'fullimage')).toBe(true);
  });

  it('merges same-layout trailing partials from two views into fewer combined pages', () => {
    const p = newProject();
    p.schemas.push(schemaWithCardsPerPage('sA', 4), schemaWithCardsPerPage('sB', 4));
    for (let i = 0; i < 5; i++) p.records.push({ id: 'a' + i, schemaId: 'sA', fieldsHash: '', fields: { title: { en: 'A' + i, vi: '' } } });
    for (let i = 0; i < 3; i++) p.records.push({ id: 'b' + i, schemaId: 'sB', fieldsHash: '', fields: { title: { en: 'B' + i, vi: '' } } });
    const sheets = collectPrintSheets(p);
    // sA: 5/4 -> 1 full(4) + 1 partial(1). sB: 3/4 -> 1 partial(3). Same layout key (fulltext/A5/portrait/4-up).
    expect(sheets).toHaveLength(2);
    expect(sheets[0].cards).toHaveLength(4); // sA's own full sheet — untouched, unreshuffled
    expect(sheets[1].cards).toHaveLength(4); // merged partial page: 1 (sA leftover) + 3 (sB)
  });

  it('does not merge partials with a different layout (different cardsPerPage)', () => {
    const p = newProject();
    p.schemas.push(schemaWithCardsPerPage('sA', 4), schemaWithCardsPerPage('sB', 6));
    for (let i = 0; i < 3; i++) p.records.push({ id: 'a' + i, schemaId: 'sA', fieldsHash: '', fields: { title: { en: 'A' + i, vi: '' } } });
    for (let i = 0; i < 3; i++) p.records.push({ id: 'b' + i, schemaId: 'sB', fieldsHash: '', fields: { title: { en: 'B' + i, vi: '' } } });
    const sheets = collectPrintSheets(p);
    expect(sheets).toHaveLength(2); // lone partials, different layout keys — kept separate
    expect(sheets.some((s) => s.cards.length === 3 && s.lay.perPage === 4)).toBe(true);
    expect(sheets.some((s) => s.cards.length === 3 && s.lay.perPage === 6)).toBe(true);
  });
});

function fakeCard(id: string): Card { return { id, layout: 'fulltext', imageHeightPercent: 50, images: [], title: id, sections: [] }; }
function fakeSheet(cards: Card[], perPage: number): Sheet {
  const lay = sheetLayout({ cardsPerPage: perPage }, 'A5', 'portrait');
  return { cards, lay, settings: DEFAULT_SETTINGS };
}

describe('mergeLeftoverSheets (pure)', () => {
  it('leaves a full sheet untouched and in place', () => {
    const full = fakeSheet([fakeCard('c1'), fakeCard('c2')], 2);
    expect(mergeLeftoverSheets([full])).toEqual([full]);
  });
  it('re-tiles two same-layout partials into one combined page', () => {
    const p1 = fakeSheet([fakeCard('c1')], 4);
    const p2 = fakeSheet([fakeCard('c2'), fakeCard('c3'), fakeCard('c4')], 4);
    const out = mergeLeftoverSheets([p1, p2]);
    expect(out).toHaveLength(1);
    expect(out[0].cards.map((c) => c.id)).toEqual(['c1', 'c2', 'c3', 'c4']);
  });
  it('a lone partial with a unique layout keeps its own page, after the full sheets', () => {
    const full = fakeSheet([fakeCard('c1'), fakeCard('c2')], 2);
    const p1 = fakeSheet([fakeCard('c3')], 4);
    const out = mergeLeftoverSheets([full, p1]);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual(full);
    expect(out[1].cards.map((c) => c.id)).toEqual(['c3']);
  });
  it('is pure — does not mutate its input', () => {
    const p1 = fakeSheet([fakeCard('c1')], 4);
    const p2 = fakeSheet([fakeCard('c2'), fakeCard('c3'), fakeCard('c4')], 4);
    const input = [p1, p2];
    mergeLeftoverSheets(input);
    expect(input).toEqual([p1, p2]);
  });
});
