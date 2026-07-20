// tests/flow-render.test.ts
import { describe, it, expect } from 'vitest';
import { buildFlowCardHTML, fitFlowScale } from '../src/lib/modules/flashcards/lib/flow-render';
import { getFlowLayout } from '../src/lib/modules/flashcards/lib/flow-layouts';
import { buildCardHTML } from '../src/lib/modules/flashcards/lib/card-render';
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

describe('buildFlowCardHTML — image frame (border-radius + background fill)', () => {
  const framed = { ...DEFAULT_SETTINGS, image: { ...DEFAULT_SETTINGS.image, borderRadius: 10, backgroundColor: '#f5f5f5' } };

  it('applies border-radius + background-color to the header flag and section images', () => {
    const html = buildFlowCardHTML(page, framed, 'en', getFlowLayout('country-page')!);
    // every rendered image inner-div carries the frame styles
    const imgDivs = html.match(/background-image:url\('[^']*'\);[^"]*/g) ?? [];
    expect(imgDivs.length).toBeGreaterThan(0);
    for (const d of imgDivs) {
      expect(d).toContain('border-radius:10px');
      expect(d).toContain('background-color:#f5f5f5');
    }
  });

  it('applies border-radius + background-color to collage tiles', () => {
    const html = buildFlowCardHTML(cover, framed, 'en', getFlowLayout('country-cover')!);
    const tiles = html.match(/fc-flow-tile[^>]*/g) ?? [];
    expect(tiles.length).toBeGreaterThan(0);
    for (const t of tiles) {
      expect(t).toContain('border-radius:10px');
      expect(t).toContain('background-color:#f5f5f5');
    }
  });

  it('omits the frame styles by default (radius 0, transparent)', () => {
    const html = buildFlowCardHTML(page, DEFAULT_SETTINGS, 'en', getFlowLayout('country-page')!);
    expect(html).not.toContain('border-radius:0px;background-color');
    expect(html).not.toContain('background-color:transparent');
  });
});

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
describe('buildFlowCardHTML — page header edge cases', () => {
  // A page view can start with an image but no title/meta (e.g. a continuation page whose first
  // field is an image). recordToFlowCard still collects that leading image as headerImage, so the
  // renderer must render the header block and NOT drop the image.
  const headerImageOnly: Card = { id: 'c2', layout: 'country-page', imageHeightPercent: 50,
    images: [], title: '', meta: [],
    headerImage: { slot: 0, url: 'flag-only.png' },
    sections: [{ id: 's1', label: 'Food', content: '- Pho' }] };
  const html = buildFlowCardHTML(headerImageOnly, DEFAULT_SETTINGS, 'en', getFlowLayout('country-page')!);
  it('renders the header block and keeps headerImage when there is no title/meta', () => {
    expect(html).toContain('fc-flow-header');
    expect(html).toContain('flag-only.png');
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
describe('buildCardHTML dispatch', () => {
  it('routes a flow layout to the flow renderer', () => {
    const html = buildCardHTML(cover, DEFAULT_SETTINGS, 'en');
    expect(html).toContain('fc-flow-collage');
  });
  it('still renders a grid layout the old way', () => {
    const grid: Card = { id: 'g', layout: 'fulltext', imageHeightPercent: 50, images: [], title: 'T',
      sections: [{ id: 's', label: 'L', content: 'body' }] };
    const html = buildCardHTML(grid, DEFAULT_SETTINGS, 'en');
    expect(html).toContain('fc-card');
    expect(html).not.toContain('fc-flow');
  });
});
