import { describe, it, expect } from 'vitest';
import { newProject, DEFAULT_SETTINGS, type Project, type Schema, type CardTemplate, type Card } from '../src/lib/modules/flashcards/model';
import * as cardOps from '../src/lib/modules/flashcards/cardOps';
import { collectPrintCards, collectPrintSheets, collectPackedSheets, mergeLeftoverSheets, packLeftovers, type Sheet, type PackItem } from '../src/lib/modules/flashcards/lib/printCards';
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

describe('collectPrintSheets — selection filter', () => {
  const p = proj('fulltext', 3); // one view (t1), 3 records, 1 card per page

  it('no selection → every sheet', () => {
    expect(collectPrintSheets(p)).toHaveLength(3);
  });
  it('filters by record ids', () => {
    expect(collectPrintSheets(p, { records: new Set(['r0', 'r1']) })).toHaveLength(2);
  });
  it('filters by view ids', () => {
    expect(collectPrintSheets(p, { views: new Set(['t1']) })).toHaveLength(3);
    expect(collectPrintSheets(p, { views: new Set(['nope']) })).toHaveLength(0);
  });
  it('an empty selection set means none', () => {
    expect(collectPrintSheets(p, { records: new Set() })).toHaveLength(0);
    expect(collectPrintSheets(p, { views: new Set() })).toHaveLength(0);
  });
});

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

  it('virgin schema (cardTemplates: []): a packed + EDITED card is returned, not a re-derived unedited one', () => {
    const p = newProject();
    const schema: Schema = { id: 'sVirgin', name: 'Virgin', cardTemplates: [], fields: [
      { id: 'f1', key: 'title', label: 'Title', type: 'text', multilingual: true },
    ] };
    p.schemas.push(schema);
    p.records.push({ id: 'r0', schemaId: 'sVirgin', fieldsHash: '', fields: { title: { en: 'Original', vi: '' } } });

    let packed = cardOps.packAllForSchema(p, 'sVirgin');
    const cardId = packed.cards[0].id;
    // Edit the packed card's title directly (title is the card's title field, not a section).
    packed = { ...packed, cards: packed.cards.map((c) => (c.id === cardId ? { ...c, title: 'EDITED', edited: true } : c)) };

    const cards = collectPrintCards(packed);
    expect(cards).toHaveLength(1);
    expect(cards[0].title).toBe('EDITED');
    expect(cards[0].edited).toBe(true);
  });

  it('collectPrintSheets on a virgin schema also returns the packed+edited card (not a fresh auto one)', () => {
    const p = newProject();
    const schema: Schema = { id: 'sVirgin2', name: 'Virgin2', cardTemplates: [], fields: [
      { id: 'f1', key: 'title', label: 'Title', type: 'text', multilingual: true },
    ] };
    p.schemas.push(schema);
    p.records.push({ id: 'r0', schemaId: 'sVirgin2', fieldsHash: '', fields: { title: { en: 'Original', vi: '' } } });

    let packed = cardOps.packAllForSchema(p, 'sVirgin2');
    const cardId = packed.cards[0].id;
    packed = { ...packed, cards: packed.cards.map((c) => (c.id === cardId ? { ...c, title: 'EDITED', edited: true } : c)) };

    const sheets = collectPrintSheets(packed);
    expect(sheets).toHaveLength(1);
    expect(sheets[0].cards[0].title).toBe('EDITED');
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

  it('flow-packs different-grid trailing partials (same paper+style), keeping every card at its native size', () => {
    const p = newProject();
    p.schemas.push(schemaWithCardsPerPage('sA', 4), schemaWithCardsPerPage('sB', 6));
    for (let i = 0; i < 3; i++) p.records.push({ id: 'a' + i, schemaId: 'sA', fieldsHash: '', fields: { title: { en: 'A' + i, vi: '' } } });
    for (let i = 0; i < 3; i++) p.records.push({ id: 'b' + i, schemaId: 'sB', fieldsHash: '', fields: { title: { en: 'B' + i, vi: '' } } });
    const sheets = collectPrintSheets(p);
    const packed = sheets.filter((s) => s.pack);
    expect(packed.length).toBeGreaterThanOrEqual(1);
    // every leftover card appears exactly once across the packed page(s)
    const ids = packed.flatMap((s) => s.pack!.map((it) => it.card.recordId)).sort();
    expect(ids).toEqual(['a0', 'a1', 'a2', 'b0', 'b1', 'b2']);
    // native sizes preserved (not resized to one grid): sA (4-up=2×2) cells are taller than sB (6-up=2×3)
    const byRec = new Map(packed.flatMap((s) => s.pack!).map((it) => [it.card.recordId, it]));
    expect(byRec.get('a0')!.cellH).toBeGreaterThan(byRec.get('b0')!.cellH);
  });

  it('does not merge same-geometry partials whose views have DIFFERENT resolved style (e.g. border width)', () => {
    const p = projViews([
      { layout: 'fulltext', cardsPerPage: 4, style: { border: { width: 2 } } },
      { layout: 'fulltext', cardsPerPage: 4, style: { border: { width: 9 } } },
    ], 3); // each view: 3 records / 4 per page = 1 partial(3); same geometry, different border width
    const sheets = collectPrintSheets(p);
    expect(sheets).toHaveLength(2); // kept apart — merging would render one view's cards with the other's border
    expect(sheets.every((s) => s.cards.length === 3)).toBe(true);
  });

  it('merges same-geometry partials whose views share the SAME resolved style', () => {
    const p = projViews([
      { layout: 'fulltext', cardsPerPage: 8, style: { border: { width: 5 } } },
      { layout: 'fulltext', cardsPerPage: 8, style: { border: { width: 5 } } },
    ], 3); // each view: 3 records / 8 per page = 1 partial(3); combined 6 still fits one page → merge
    const sheets = collectPrintSheets(p);
    expect(sheets).toHaveLength(1);
    expect(sheets[0].cards).toHaveLength(6);
  });
});

describe('collectPackedSheets (compact bin-pack)', () => {
  it('packs every (record × view) card within page bounds, no overlap, mixed orientation allowed', () => {
    const p = projViews([{ layout: 'fulltext', cardsPerPage: 4 }, { layout: '1full', cardsPerPage: 2 }], 3);
    const sheets = collectPackedSheets(p);
    const items = sheets.flatMap((s) => s.abs ?? []);
    expect(items).toHaveLength(6); // 3 records × 2 views
    for (const s of sheets) {
      expect(s.abs).toBeTruthy();
      expect(['portrait', 'landscape']).toContain(s.lay.orient);
      for (const it of s.abs!) {
        expect(it.x + it.w).toBeLessThanOrEqual(s.lay.sheetW + 1);
        expect(it.y + it.h).toBeLessThanOrEqual(s.lay.sheetH + 1);
      }
      // no two cards on a page overlap
      for (let a = 0; a < s.abs!.length; a++) for (let b = a + 1; b < s.abs!.length; b++) {
        const A = s.abs![a], B = s.abs![b];
        const sep = A.x + A.w <= B.x + 1 || B.x + B.w <= A.x + 1 || A.y + A.h <= B.y + 1 || B.y + B.h <= A.y + 1;
        expect(sep).toBe(true);
      }
    }
  });
  it('respects the selection filter (only the chosen view)', () => {
    const p = projViews([{ layout: 'fulltext', cardsPerPage: 4 }, { layout: '1full', cardsPerPage: 2 }], 3);
    const t0 = p.schemas[0].cardTemplates[0].id;
    const items = collectPackedSheets(p, { views: new Set([t0]) }).flatMap((s) => s.abs ?? []);
    expect(items).toHaveLength(3);
  });
  it('empty project → no sheets', () => {
    expect(collectPackedSheets(newProject())).toEqual([]);
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
  it('flow-packs partials of different grids, keeping each card native size (not resized to one grid)', () => {
    const small = fakeSheet([fakeCard('c1')], 4);            // 2×2 = 4-up (bigger cells)
    const dense = fakeSheet([fakeCard('c2')], 12);           // 3×4 = 12-up (smaller cells)
    const out = mergeLeftoverSheets([small, dense]);
    const packed = out.filter((s) => s.pack);
    expect(packed).toHaveLength(1);                          // 2 small cards fit one page
    const items = packed[0].pack!;
    expect(items.map((it) => it.card.id).sort()).toEqual(['c1', 'c2']);
    const c1 = items.find((it) => it.card.id === 'c1')!, c2 = items.find((it) => it.card.id === 'c2')!;
    expect(c1.cellW).toBeGreaterThan(c2.cellW);              // c1 keeps the roomy 4-up cell, c2 the tight 12-up cell
    expect(c1.cellH).toBeGreaterThan(c2.cellH);
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

describe('packLeftovers (pure shelf-pack)', () => {
  const item = (id: string, w: number, h: number): PackItem => ({ card: fakeCard(id), cellW: w, cellH: h, settings: DEFAULT_SETTINGS });

  it('packs multiple items per row when they fit the width', () => {
    const pages = packLeftovers([item('a', 40, 40), item('b', 40, 40)], 100, 100);
    expect(pages).toHaveLength(1);
    expect(pages[0].map((it) => it.card.id)).toEqual(['a', 'b']);
  });
  it('wraps to a new row past the width, and a new page past the height', () => {
    // 60-wide items → one per row (two would be 120 > 100); 60-tall → one row per page (two rows = 120 > 100)
    const pages = packLeftovers([item('a', 60, 60), item('b', 60, 60)], 100, 100);
    expect(pages).toHaveLength(2);
    expect(pages[0].map((it) => it.card.id)).toEqual(['a']);
    expect(pages[1].map((it) => it.card.id)).toEqual(['b']);
  });
  it('keeps each item at its own size (never resizes)', () => {
    const pages = packLeftovers([item('big', 50, 60), item('small', 50, 20)], 100, 100);
    expect(pages).toHaveLength(1);
    expect(pages[0].find((it) => it.card.id === 'big')!.cellH).toBe(60);
    expect(pages[0].find((it) => it.card.id === 'small')!.cellH).toBe(20);
  });
});
