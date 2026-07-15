import { describe, it, expect } from 'vitest';
import { getPaperPx, mmToPx, esc, resolveLocale } from '../src/lib/modules/flashcards/lib/card-render';
import { buildCardHTML } from '../src/lib/modules/flashcards/lib/card-render';
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
