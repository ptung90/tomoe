import { describe, it, expect } from 'vitest';
import { getPaperPx, mmToPx, esc, resolveLocale, resolveLabel, labelLocaleValue, setLabelLocale, mutedHex } from '../src/lib/modules/flashcards/lib/card-render';
import { buildCardHTML, sheetGrid, sheetLayout, buildSheetHTML } from '../src/lib/modules/flashcards/lib/card-render';
import { LAYOUT_SLOTS } from '../src/lib/modules/flashcards/lib/layouts';
import { DEFAULT_SETTINGS, type Card } from '../src/lib/modules/flashcards/model';

describe('card-render helpers', () => {
  it('getPaperPx A5 portrait ~ 559x794 px', () => {
    const { w, h } = getPaperPx('A5', 'portrait');
    expect(w).toBe(Math.round((148 / 25.4) * 96));
    expect(h).toBe(Math.round((210 / 25.4) * 96));
    expect(h).toBeGreaterThan(w);
  });
  it('getPaperPx landscape swaps w/h', () => {
    const p = getPaperPx('A5', 'landscape');
    expect(p.w).toBeGreaterThan(p.h);
  });
  it('mmToPx converts mm to px at 96dpi', () => { expect(mmToPx(25.4)).toBe(96); });
  it('esc escapes html', () => { expect(esc('<a>&"')).toBe('&lt;a&gt;&amp;&quot;'); });
  it('resolveLocale reads a localized object and passes strings through', () => {
    expect(resolveLocale({ en: 'Owl', vi: 'Cú' }, 'vi')).toBe('Cú');
    expect(resolveLocale('plain', 'en')).toBe('plain');
    expect(resolveLocale(undefined, 'en')).toBe('');
  });
  it('registries expose slot counts for the single-card layouts', () => {
    expect(LAYOUT_SLOTS['2x2']).toBe(4);
    expect(LAYOUT_SLOTS['fulltext']).toBe(0);
  });
});

describe('resolveLabel', () => {
  it('returns the active locale\'s text when present', () => {
    expect(resolveLabel({ en: 'Definition', vi: 'Nghĩa' }, 'vi', 'def')).toBe('Nghĩa');
  });
  it('falls back to another non-empty locale when the active one is blank', () => {
    expect(resolveLabel({ en: 'Definition', vi: '' }, 'vi', 'def')).toBe('Definition');
  });
  it('falls back to the field key when every locale is blank', () => {
    expect(resolveLabel({ en: '', vi: '  ' }, 'vi', 'def')).toBe('def');
  });
  it('passes a plain string label through unchanged (trimmed)', () => {
    expect(resolveLabel('  Definition  ', 'vi', 'def')).toBe('Definition');
  });
  it('falls back to the key for an empty or whitespace-only string label', () => {
    expect(resolveLabel('', 'en', 'def')).toBe('def');
    expect(resolveLabel('   ', 'en', 'def')).toBe('def');
  });
  it('is null-safe (legacy/hand-edited field with no label) — falls back to key', () => {
    expect(resolveLabel(null as never, 'en', 'def')).toBe('def');
    expect(resolveLabel(undefined as never, 'en', 'def')).toBe('def');
  });
});

describe('labelLocaleValue / setLabelLocale', () => {
  it('labelLocaleValue reads the requested locale slot of an object label', () => {
    expect(labelLocaleValue({ en: 'Definition', vi: 'Nghĩa' }, 'vi', 'en')).toBe('Nghĩa');
    expect(labelLocaleValue({ en: 'Definition' }, 'vi', 'en')).toBe('');
  });
  it('labelLocaleValue shows a legacy string label only under the first locale', () => {
    expect(labelLocaleValue('Definition', 'en', 'en')).toBe('Definition');
    expect(labelLocaleValue('Definition', 'vi', 'en')).toBe('');
  });
  it('labelLocaleValue is null-safe (missing label) → empty string', () => {
    expect(labelLocaleValue(null as never, 'en', 'en')).toBe('');
  });
  it('setLabelLocale writes into an object label, preserving the other locales', () => {
    expect(setLabelLocale({ en: 'Definition', vi: '' }, 'vi', 'Nghĩa', 'en')).toEqual({ en: 'Definition', vi: 'Nghĩa' });
  });
  it('setLabelLocale converts a legacy string label to an object, keeping it under the first locale', () => {
    expect(setLabelLocale('Definition', 'vi', 'Nghĩa', 'en')).toEqual({ en: 'Definition', vi: 'Nghĩa' });
  });
  it('setLabelLocale converts a blank label to an object with only the new locale set', () => {
    expect(setLabelLocale('', 'en', 'Definition', 'en')).toEqual({ en: 'Definition' });
  });
});

function card(partial: Partial<Card>): Card {
  return { id: 'c1', layout: '1top-1bot', imageHeightPercent: 50, images: [], title: '', sections: [], ...partial };
}

// Style of the inner `.img-bg` div (isolates the image element from the card border).
function imgBgStyle(html: string): string {
  return /img-bg" style="([^"]*)"/.exec(html)?.[1] ?? '';
}

describe('buildCardHTML — image frame (border-radius + background fill)', () => {
  const withImg = () => card({ layout: '1top-1bot', images: [{ slot: 0, url: 'a.png' }], sections: [{ id: 's1', label: '', content: 'hi' }] });

  it('applies image border-radius and background-color to the image div when set', () => {
    const html = buildCardHTML(withImg(), {
      ...DEFAULT_SETTINGS,
      image: { ...DEFAULT_SETTINGS.image, borderRadius: 14, backgroundColor: '#eef' },
    }, 'en');
    const style = imgBgStyle(html);
    expect(style).toContain('border-radius:14px');
    expect(style).toContain('background-color:#eef');
  });

  it('omits border-radius (0) and background-color (transparent) by default', () => {
    const html = buildCardHTML(withImg(), DEFAULT_SETTINGS, 'en');
    const style = imgBgStyle(html);
    expect(style).not.toContain('border-radius');
    expect(style).not.toContain('background-color');
  });
});

describe('mutedHex', () => {
  it('blends a colour toward white at the given alpha (default 0.7)', () => {
    expect(mutedHex('#000000')).toBe('#4d4d4d');   // round(0*.7 + 255*.3) = 77 = 0x4d
    expect(mutedHex('#1a1a1a')).toBe('#5f5f5f');    // round(26*.7 + 255*.3) = 95 = 0x5f
    expect(mutedHex('#ffffff')).toBe('#ffffff');    // white stays white
  });
  it('expands 3-digit hex', () => {
    expect(mutedHex('#000')).toBe('#4d4d4d');
  });
  it('falls back to a neutral muted grey for a non-hex/empty colour', () => {
    expect(mutedHex('')).toBe('#6b7280');
    expect(mutedHex('rebeccapurple')).toBe('#6b7280');
  });
});

describe('h5/h6 subtitle colour is a solid hex (print-safe), not opacity', () => {
  it('emits a solid color: on h5/h6 rules and no opacity (html2canvas renders opacity wrong)', () => {
    const html = buildCardHTML(card({
      layout: 'fulltext', title: 'T',
      sections: [{ id: 's1', label: '', content: '##### sub' }],
    }), DEFAULT_SETTINGS, 'en');
    const h5 = /\.fc-section__content h5\{([^}]*)\}/.exec(html)?.[1] ?? '';
    const h6 = /\.fc-section__content h6\{([^}]*)\}/.exec(html)?.[1] ?? '';
    const titleH6 = /\.fc-title h6\{([^}]*)\}/.exec(html)?.[1] ?? '';
    for (const rule of [h5, h6, titleH6]) {
      expect(rule).toMatch(/color:#[0-9a-f]{6}/i);
      expect(rule).not.toContain('opacity');
    }
  });
});

describe('buildCardHTML grid/fulltext/fullimage', () => {
  it('renders a fulltext card with title + section content (markdown)', () => {
    const html = buildCardHTML(card({
      layout: 'fulltext', title: 'Owl',
      sections: [{ id: 's1', label: 'Def', content: 'a **bird**' }],
    }), DEFAULT_SETTINGS, 'en');
    expect(html).toContain('data-layout="fulltext"');
    expect(html).toContain('data-id="c1"');
    expect(html).toContain('Owl');
    expect(html).toContain('<strong>bird</strong>');
    expect(html).toContain('fc-sections');
  });
  it('renders a 1top-1bot card with 2 image slots and image url', () => {
    const html = buildCardHTML(card({
      layout: '1top-1bot',
      images: [{ slot: 0, url: 'http://x/a.png' }],
      sections: [{ id: 's1', label: '', content: 'hi' }],
    }), DEFAULT_SETTINGS, 'en');
    expect(html).toContain('fc-layout-1top-1bot');
    expect(html).toContain('fc-image-slot-0');
    expect(html).toContain('http://x/a.png');
  });
  it('title-img-text renders title BEFORE the image area, then the content, with 1 image slot', () => {
    const html = buildCardHTML(card({
      layout: 'title-img-text', title: 'Owl',
      images: [{ slot: 0, url: 'http://x/o.png' }],
      sections: [{ id: 's1', label: '', content: 'a bird' }],
    }), DEFAULT_SETTINGS, 'en');
    expect(html).toContain('fc-layout-title-img-text');
    const titleIdx = html.indexOf('fc-title');
    const imgIdx = html.indexOf('fc-image-area');
    const secIdx = html.indexOf('fc-sections');
    expect(titleIdx).toBeGreaterThan(-1);
    expect(titleIdx).toBeLessThan(imgIdx);   // title above image
    expect(imgIdx).toBeLessThan(secIdx);      // image above content
    expect((html.match(/fc-image-slot-\d/g) || []).length).toBe(1);
    expect(html).toContain('http://x/o.png');
  });
  it('title-img-text: image area grows to fill (flex) with height% as a min-height, not a fixed height', () => {
    const html = buildCardHTML(card({
      layout: 'title-img-text', title: 'Owl', imageHeightPercent: 40,
      images: [{ slot: 0, url: 'http://x/o.png' }],
      sections: [{ id: 's1', label: '', content: 'a bird' }],
    }), DEFAULT_SETTINGS, 'en');
    const area = html.match(/fc-image-area" style="([^"]*)"/);
    expect(area).toBeTruthy();
    expect(area![1]).toContain('flex:1 1 auto');
    expect(area![1]).toMatch(/min-height:\d+px/);
    // no fixed `height:NNpx` on the image area (min-height only)
    expect(area![1]).not.toMatch(/[^-]height:\d+px/);
  });
  it('resolves the requested locale for title/sections', () => {
    const html = buildCardHTML(card({
      layout: 'fulltext',
      title: { en: 'Owl', vi: 'Cú' },
      sections: [{ id: 's1', label: { en: 'Def', vi: 'Nghĩa' }, content: { en: 'bird', vi: 'chim' } }],
    }), DEFAULT_SETTINGS, 'vi');
    expect(html).toContain('Cú');
    expect(html).toContain('chim');
    expect(html).not.toContain('Owl');
  });
  it('sizes the card from the paper size (A6 smaller than A5)', () => {
    const a5 = buildCardHTML(card({}), { ...DEFAULT_SETTINGS, paperSize: 'A5' }, 'en');
    const a6 = buildCardHTML(card({}), { ...DEFAULT_SETTINGS, paperSize: 'A6' }, 'en');
    const w = (s: string) => Number(/width:(\d+)px/.exec(s)![1]);
    expect(w(a5)).toBeGreaterThan(w(a6));
  });
  it('forPrint renders empty image slots without the placeholder glyph', () => {
    const html = buildCardHTML(card({ layout: '2x2' }), DEFAULT_SETTINGS, 'en', true);
    expect(html).not.toContain('📷');
  });
});

describe('buildCardHTML new 5 layouts', () => {
  it('1big-2small renders a 2-col grid with columns 67% 33% and 3 image slots', () => {
    const html = buildCardHTML(card({
      layout: '1big-2small',
      sections: [{ id: 's1', label: '', content: 'hi' }],
    }), DEFAULT_SETTINGS, 'en');
    expect(html).toContain('grid-template-columns:67% 33%');
    expect(html).toContain('fc-image-slot-0');
    expect(html).toContain('fc-image-slot-1');
    expect(html).toContain('fc-image-slot-2');
  });
  it('1left-2right renders a 2-col grid with columns 33% 67% and 3 image slots', () => {
    const html = buildCardHTML(card({
      layout: '1left-2right',
      sections: [{ id: 's1', label: '', content: 'hi' }],
    }), DEFAULT_SETTINGS, 'en');
    expect(html).toContain('grid-template-columns:33% 67%');
    expect(html).toContain('fc-image-slot-0');
    expect(html).toContain('fc-image-slot-1');
    expect(html).toContain('fc-image-slot-2');
  });
  it('1left-3right renders a 2-col / 3-row grid with columns 33% 67% and 4 image slots', () => {
    const html = buildCardHTML(card({
      layout: '1left-3right',
      sections: [{ id: 's1', label: '', content: 'hi' }],
    }), DEFAULT_SETTINGS, 'en');
    expect(html).toContain('grid-template-columns:33% 67%');
    expect(html).toContain('grid-template-rows:1fr 1fr 1fr');
    expect(html).toContain('fc-image-slot-0');
    expect(html).toContain('fc-image-slot-1');
    expect(html).toContain('fc-image-slot-2');
    expect(html).toContain('fc-image-slot-3');
  });
  it('1top-3bot renders a 3-col / 2-row grid with rows 67% 33% and 4 image slots', () => {
    const html = buildCardHTML(card({
      layout: '1top-3bot',
      sections: [{ id: 's1', label: '', content: 'hi' }],
    }), DEFAULT_SETTINGS, 'en');
    expect(html).toContain('grid-template-rows:67% 33%');
    expect(html).toContain('grid-template-columns:1fr 1fr 1fr');
    expect(html).toContain('fc-image-slot-0');
    expect(html).toContain('fc-image-slot-1');
    expect(html).toContain('fc-image-slot-2');
    expect(html).toContain('fc-image-slot-3');
  });
  it('1full renders with image-area present and 1 image slot', () => {
    const html = buildCardHTML(card({
      layout: '1full',
      sections: [{ id: 's1', label: '', content: 'hi' }],
    }), DEFAULT_SETTINGS, 'en');
    expect(html).toContain('fc-image-area');
    expect(html).toContain('fc-image-slot-0');
    expect(html).not.toContain('fc-image-slot-1');
  });
  it('imgPadding insets the image-area in the default (grid/1full) layout', () => {
    const pad = mmToPx(5);
    const html = buildCardHTML(card({
      layout: '1full',
      sections: [{ id: 's1', label: '', content: 'hi' }],
    }), { ...DEFAULT_SETTINGS, imgPadding: 5 }, 'en');
    const area = html.match(/fc-image-area" style="([^"]*)"/);
    expect(area).toBeTruthy();
    expect(area![1]).toContain('box-sizing:border-box');
    expect(area![1]).toContain(`padding:${pad}px`);
  });
  it('imgPadding insets the image-area in title-img-text', () => {
    const pad = mmToPx(5);
    const html = buildCardHTML(card({
      layout: 'title-img-text', title: 'Owl',
      images: [{ slot: 0, url: 'http://x/o.png' }],
      sections: [{ id: 's1', label: '', content: 'a bird' }],
    }), { ...DEFAULT_SETTINGS, imgPadding: 5 }, 'en');
    const area = html.match(/fc-image-area" style="([^"]*)"/);
    expect(area).toBeTruthy();
    expect(area![1]).toContain(`padding:${pad}px`);
  });
  it('imgPadding of 0 adds no padding to the image-area', () => {
    const html = buildCardHTML(card({
      layout: '1full',
      sections: [{ id: 's1', label: '', content: 'hi' }],
    }), { ...DEFAULT_SETTINGS, imgPadding: 0 }, 'en');
    const area = html.match(/fc-image-area" style="([^"]*)"/);
    expect(area![1]).not.toContain('padding:');
  });
  it('paraGap sets the paragraph margin-bottom and zeroes the last paragraph', () => {
    const html = buildCardHTML(card({
      layout: 'fulltext',
      sections: [{ id: 's1', label: '', content: 'one\n\ntwo' }],
    }), { ...DEFAULT_SETTINGS, paraGap: 7 }, 'en');
    expect(html).toContain('.fc-section__content > p{margin-bottom:7px}');
    expect(html).toContain('.fc-section__content > p:last-child{margin-bottom:0}');
  });
});

describe('sheetGrid', () => {
  it('presets for common cardsPerPage values (portrait)', () => {
    expect(sheetGrid(1, 'portrait')).toEqual({ cols: 1, rows: 1 });
    expect(sheetGrid(2, 'portrait')).toEqual({ cols: 1, rows: 2 });
    expect(sheetGrid(3, 'portrait')).toEqual({ cols: 1, rows: 3 });
    expect(sheetGrid(4, 'portrait')).toEqual({ cols: 2, rows: 2 });
    expect(sheetGrid(6, 'portrait')).toEqual({ cols: 2, rows: 3 });
    expect(sheetGrid(8, 'portrait')).toEqual({ cols: 2, rows: 4 });
    expect(sheetGrid(9, 'portrait')).toEqual({ cols: 3, rows: 3 });
  });
  it('landscape swaps cols/rows', () => {
    expect(sheetGrid(6, 'landscape')).toEqual({ cols: 3, rows: 2 });
    expect(sheetGrid(4, 'landscape')).toEqual({ cols: 2, rows: 2 });
  });
  it('unknown n falls back to a 1-col grid', () => {
    expect(sheetGrid(1, 'landscape')).toEqual({ cols: 1, rows: 1 });
    expect(sheetGrid(5, 'portrait')).toEqual({ cols: 1, rows: 5 });
  });
});

describe('sheetLayout — fixed grid', () => {
  it('cardsPerPage 6 on an A4 sheet → 2x3 grid, perPage 6, fillCell true, cells fill the sheet', () => {
    const lay = sheetLayout({ cardsPerPage: 6 }, 'A4', 'portrait');
    expect(lay.cols).toBe(2);
    expect(lay.rows).toBe(3);
    expect(lay.perPage).toBe(6);
    expect(lay.fillCell).toBe(true);
    const sheet = getPaperPx('A4', 'portrait');
    expect(lay.cellW).toBe(Math.floor(sheet.w / 2));
    expect(lay.cellH).toBe(Math.floor(sheet.h / 3));
  });
  it('defaults cardsPerPage to 1 when omitted', () => {
    const lay = sheetLayout({}, 'A4', 'portrait');
    expect(lay.perPage).toBe(1);
    expect(lay.cols).toBe(1);
    expect(lay.rows).toBe(1);
  });
  it('explicit gridCols/gridRows overrides cardsPerPage — arbitrary 2x5 grid, no landscape swap', () => {
    const lay = sheetLayout({ gridCols: 2, gridRows: 5, cardsPerPage: 6 }, 'A4', 'portrait');
    expect(lay.cols).toBe(2);
    expect(lay.rows).toBe(5);
    expect(lay.perPage).toBe(10);
    expect(lay.fillCell).toBe(true);
    const sheet = getPaperPx('A4', 'portrait');
    expect(lay.cellW).toBe(Math.floor(sheet.w / 2));
    expect(lay.cellH).toBe(Math.floor(sheet.h / 5));
  });
  it('explicit gridCols/gridRows does NOT swap on landscape (explicit user choice)', () => {
    const lay = sheetLayout({ gridCols: 2, gridRows: 5 }, 'A4', 'landscape');
    expect(lay.cols).toBe(2);
    expect(lay.rows).toBe(5);
    const sheet = getPaperPx('A4', 'landscape');
    expect(lay.cellW).toBe(Math.floor(sheet.w / 2));
    expect(lay.cellH).toBe(Math.floor(sheet.h / 5));
  });
  it('falls back to sheetGrid(cardsPerPage) unchanged when gridCols/gridRows are absent (back-compat)', () => {
    const lay = sheetLayout({ cardsPerPage: 6 }, 'A4', 'portrait');
    expect(lay.cols).toBe(2);
    expect(lay.rows).toBe(3);
    expect(lay.perPage).toBe(6);
  });
  it('ignores gridCols/gridRows if either is missing or < 1 — falls back to cardsPerPage', () => {
    const lay1 = sheetLayout({ gridCols: 2, cardsPerPage: 6 }, 'A4', 'portrait');
    expect(lay1.cols).toBe(2); expect(lay1.rows).toBe(3); // gridRows missing → fallback
    const lay2 = sheetLayout({ gridCols: 0, gridRows: 5, cardsPerPage: 6 }, 'A4', 'portrait');
    expect(lay2.cols).toBe(2); expect(lay2.rows).toBe(3); // gridCols < 1 → fallback
  });
});

describe('sheetLayout — auto-fit', () => {
  it('packs real-size A7 cards onto an A4 sheet (portrait), fillCell false', () => {
    const lay = sheetLayout({ autoFit: true, cardSize: 'A7' }, 'A4', 'portrait');
    expect(lay.perPage).toBe(lay.cols * lay.rows);
    expect(lay.cols).toBeGreaterThanOrEqual(1);
    expect(lay.rows).toBeGreaterThanOrEqual(1);
    expect(lay.fillCell).toBe(false);
    const cardPx = getPaperPx('A7', 'portrait');
    expect(lay.cellW).toBe(cardPx.w);
    expect(lay.cellH).toBe(cardPx.h);
  });
  it('defaults cardSize to A7 when omitted', () => {
    const lay = sheetLayout({ autoFit: true }, 'A4', 'portrait');
    const cardPx = getPaperPx('A7', 'portrait');
    expect(lay.cellW).toBe(cardPx.w);
    expect(lay.cellH).toBe(cardPx.h);
  });
});

describe('buildSheetHTML', () => {
  it('fixed grid: uses 1fr tracks sized to cols x rows, and reuses buildCardHTML per cell', () => {
    const lay = sheetLayout({ cardsPerPage: 4 }, 'A4', 'portrait');
    const cards: Card[] = [
      card({ id: 'c1', title: 'One' }),
      card({ id: 'c2', title: 'Two' }),
    ];
    const html = buildSheetHTML(cards, lay, DEFAULT_SETTINGS, 'en');
    expect(html).toContain('fc-sheet');
    expect(html).toContain('grid-template-columns:repeat(2,1fr)');
    expect(html).toContain('grid-template-rows:repeat(2,1fr)');
    expect(html).toContain('One');
    expect(html).toContain('Two');
    expect(html.match(/fc-sheet-cell/g) || []).toHaveLength(4);
  });
  it('auto-fit: uses fixed-px tracks and justify/align-content:start', () => {
    const lay = sheetLayout({ autoFit: true, cardSize: 'A7' }, 'A4', 'portrait');
    const cards: Card[] = [card({ id: 'c1', title: 'One' })];
    const html = buildSheetHTML(cards, lay, DEFAULT_SETTINGS, 'en');
    expect(html).toContain(`grid-template-columns:repeat(${lay.cols},${lay.cellW}px)`);
    expect(html).toContain(`grid-template-rows:repeat(${lay.rows},${lay.cellH}px)`);
    expect(html).toContain('justify-content:start;align-content:start;');
  });
});
