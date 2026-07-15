import { describe, it, expect } from 'vitest';
import { pdfFileName, pdfStamp } from '../src/lib/modules/flashcards/lib/pdfExport';
import { newProject, type Project, type Schema } from '../src/lib/modules/flashcards/model';
import { collectPrintSheets } from '../src/lib/modules/flashcards/lib/printCards';
import { buildSheetHTML } from '../src/lib/modules/flashcards/lib/card-render';

describe('pdfFileName', () => {
  it('slugs + strips Vietnamese diacritics and đ', () => {
    expect(pdfFileName('Vòng tuần hoàn', '20260715-1042')).toBe('vong-tuan-hoan-20260715-1042.pdf');
    expect(pdfFileName('Đường phố', '20260715-1042')).toBe('duong-pho-20260715-1042.pdf');
  });
  it('collapses non-alphanumerics and trims dashes', () => {
    expect(pdfFileName('  My Cards!! (v2) ', '20260101-0000')).toBe('my-cards-v2-20260101-0000.pdf');
  });
  it('falls back to "cards" when the name is empty after slugging', () => {
    expect(pdfFileName('', '20260715-1042')).toBe('cards-20260715-1042.pdf');
    expect(pdfFileName('★★★', '20260715-1042')).toBe('cards-20260715-1042.pdf');
  });
});

describe('pdfStamp', () => {
  it('formats YYYYMMDD-HHmm with zero-padding', () => {
    expect(pdfStamp(new Date(2026, 6, 15, 10, 42))).toBe('20260715-1042');
    expect(pdfStamp(new Date(2026, 0, 5, 9, 3))).toBe('20260105-0903');
  });
});

// Investigation for the "Export failed: undefined" regression (#3): reproduces the pure/DOM-buildable
// part of exportCardsPdf (collectPrintSheets + buildSheetHTML) headlessly, for a MULTI-VIEW schema
// with text + image fields, sized so a trailing partial page fires mergeLeftoverSheets. If this pure
// path threw or produced undefined `settings`/`lay.orient`, THAT would be the root cause of the PDF
// export crash. It doesn't — every sheet builds fine — so the crash is isolated to the webview-only
// bit (html-to-image / jsPDF), which cannot run under jsdom; see the hardened error surfacing in
// Workspace.svelte's exportPdf() catch instead.
function multiViewProject(): Project {
  const p = newProject();
  const schema: Schema = {
    id: 's1', name: 'Words',
    cardTemplates: [
      { id: 'tText', templateType: 'single', layout: 'fulltext', size: null, hideTitle: false,
        hideSectionLabels: false, mapping: {}, cardsPerPage: 4 },
      { id: 'tImg', templateType: 'single', layout: 'fullimage', size: null, hideTitle: false,
        hideSectionLabels: false, mapping: {}, cardsPerPage: 4, fields: ['pic'] },
    ],
    fields: [
      { id: 'f1', key: 'title', label: 'Title', type: 'text', multilingual: true },
      { id: 'f2', key: 'def', label: 'Def', type: 'text-long', multilingual: true },
      { id: 'f3', key: 'pic', label: 'Pic', type: 'image' },
    ],
  };
  p.schemas.push(schema);
  // 5 records / 4 per page = 1 full sheet + 1 trailing partial(1), PER view → mergeLeftoverSheets
  // combines the two views' same-geometry partials into one merged page (mixed layouts on one sheet).
  for (let i = 0; i < 5; i++) {
    p.records.push({
      id: 'r' + i, schemaId: 's1', fieldsHash: '',
      fields: { title: { en: 'Word ' + i, vi: '' }, def: { en: 'Definition ' + i, vi: '' }, pic: 'http://x/' + i + '.png' },
    });
  }
  return p;
}

describe('exportCardsPdf pure path (collectPrintSheets + buildSheetHTML) — regression repro for #3', () => {
  it('produces sheets with settings + lay.orient defined, and every sheet builds non-empty fc-sheet HTML without throwing', () => {
    const project = multiViewProject();
    const sheets = collectPrintSheets(project);
    expect(sheets.length).toBeGreaterThan(1); // full sheet(s) + a merged leftover page

    for (const sheet of sheets) {
      expect(sheet.settings).toBeDefined();
      expect(sheet.lay.orient).toBeDefined();
      let html = '';
      expect(() => {
        html = buildSheetHTML(sheet.cards, sheet.lay, sheet.settings, project.activeLocale, true,
          { w: sheet.lay.sheetW, h: sheet.lay.sheetH });
      }).not.toThrow();
      expect(html.length).toBeGreaterThan(0);
      expect(html).toContain('fc-sheet');
    }
  });
});
