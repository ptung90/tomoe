// tests/flow-render.test.ts
import { describe, it, expect } from 'vitest';
import { buildFlowCardHTML, fitFlowScale } from '../src/lib/modules/flashcards/lib/flow-render';
import { getFlowLayout } from '../src/lib/modules/flashcards/lib/flow-layouts';
import { DEFAULT_SETTINGS, type Card } from '../src/lib/modules/flashcards/model';

const page: Card = { id: 'c1', layout: 'country-page', imageHeightPercent: 50,
  images: [], title: '<h1>Vietnam</h1>',
  meta: [{ label: 'Capital', value: 'Hanoi' }, { label: 'Language', value: 'Vietnamese' }],
  headerImage: { slot: 0, url: 'flag.png' },
  sections: [
    { id: 's1', label: 'Landscape', content: '- Coastline\n- Ha Long Bay', image: { slot: 1, url: 'halong.png' } },
    { id: 's2', label: 'Food', content: '- Pho', image: { slot: 2, url: 'pho.png' } },
  ] };
const cover: Card = { id: 'c0', layout: 'country-cover', imageHeightPercent: 50,
  images: [{ slot: 0, url: 'flag.png' }, { slot: 1, url: 'halong.png' }, { slot: 2, url: 'pho.png' }],
  title: '<h1>Vietnam</h1>', meta: [], sections: [] };

describe('buildFlowCardHTML — page', () => {
  const html = buildFlowCardHTML(page, DEFAULT_SETTINGS, 'en', getFlowLayout('country-page')!);
  it('renders a header with title, meta lines and floated flag', () => {
    expect(html).toContain('Vietnam');
    expect(html).toContain('Hanoi');
    expect(html).toContain('flag.png');
    expect(html).toContain('fc-flow-header');
  });
  it('renders section headings and markdown bullets as <ul>', () => {
    expect(html).toContain('Landscape');
    expect(html).toContain('<ul>');
    expect(html).toContain('halong.png');
  });
  it('alternates float side by section index (right then left)', () => {
    const first = html.indexOf('float:right');
    const second = html.indexOf('float:left');
    expect(first).toBeGreaterThan(-1);
    expect(second).toBeGreaterThan(-1);
  });
});
describe('buildFlowCardHTML — collage', () => {
  const html = buildFlowCardHTML(cover, DEFAULT_SETTINGS, 'en', getFlowLayout('country-cover')!);
  it('renders a grid of image tiles and an outline title', () => {
    expect(html).toContain('fc-flow-collage');
    expect((html.match(/flag\.png|halong\.png|pho\.png/g) || []).length).toBe(3);
    expect(html).toContain('-webkit-text-stroke');
  });
});
describe('fitFlowScale', () => {
  it('returns 1 when content fits', () => { expect(fitFlowScale(500, 800)).toBe(1); });
  it('shrinks proportionally when content overflows', () => { expect(fitFlowScale(1600, 800)).toBeCloseTo(0.5); });
  it('never shrinks below 0.5', () => { expect(fitFlowScale(4000, 800)).toBe(0.5); });
});
