import { describe, it, expect } from 'vitest';
import { getPaperPx, mmToPx, esc, resolveLocale, LAYOUTS, LAYOUT_SLOTS } from '../src/lib/modules/flashcards/lib/card-render';
import { buildCardHTML } from '../src/lib/modules/flashcards/lib/card-render';
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
  it('registries expose the 7 in-scope layouts', () => {
    expect(LAYOUTS).toEqual(['fulltext','fullimage','2x2','1top-1bot','1top-2bot','2top-1bot','3card']);
    expect(LAYOUT_SLOTS['2x2']).toBe(4);
    expect(LAYOUT_SLOTS['fulltext']).toBe(0);
  });
});

function card(partial: Partial<Card>): Card {
  return { id: 'c1', layout: '1top-1bot', imageHeightPercent: 50, images: [], title: '', sections: [], ...partial };
}

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

describe('buildCardHTML 3card', () => {
  it('renders a 3-column card with per-column titles, content, and images', () => {
    const html = buildCardHTML(card({
      layout: '3card',
      images: [{ slot: 0, url: 'http://x/0.png' }, { slot: 1, url: 'http://x/1.png' }],
      sections: [
        { id: 's0', label: 'One', content: 'first' },
        { id: 's1', label: 'Two', content: 'second' },
        { id: 's2', label: 'Three', content: 'third' },
      ],
    }), DEFAULT_SETTINGS, 'en');
    expect(html).toContain('data-layout="3card"');
    expect(html).toContain('fc-image-slot-0');
    expect(html).toContain('fc-image-slot-2');
    expect(html).toContain('http://x/0.png');
    expect(html).toContain('first');
    expect(html).toContain('third');
    // Guard the compound path: the default grid/fulltext/fullimage branches
    // always emit a `<div class="fc-text-area">`; build_3card (via
    // renderCompoundShell) does NOT, and lays out a 3-column grid.
    expect(html).not.toContain('fc-text-area');
    expect(html).toContain('repeat(3');
  });
});
