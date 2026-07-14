import { describe, it, expect } from 'vitest';
import { getPaperPx, mmToPx, esc, resolveLocale, LAYOUTS, LAYOUT_SLOTS } from '../src/lib/modules/flashcards/lib/card-render';

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
