import { describe, it, expect } from 'vitest';
import { packAll, type PackRect, type PackedPage } from '../src/lib/modules/flashcards/lib/binPack';

const P = { w: 100, h: 140 };   // "portrait" page
const L = { w: 140, h: 100 };   // "landscape" page

// Every input rect lands on exactly one page, exactly once.
function allPlaced(sizes: PackRect[], pages: PackedPage[]): number[] {
  return pages.flatMap((pg) => pg.place.map((p) => p.i)).sort((a, b) => a - b);
}
// No two placements on the same page overlap.
function anyOverlap(sizes: PackRect[], pages: PackedPage[]): boolean {
  for (const pg of pages) {
    for (let a = 0; a < pg.place.length; a++) {
      for (let b = a + 1; b < pg.place.length; b++) {
        const A = pg.place[a], B = pg.place[b];
        const ra = sizes[A.i], rb = sizes[B.i];
        const sep = A.x + ra.w <= B.x + 0.5 || B.x + rb.w <= A.x + 0.5 || A.y + ra.h <= B.y + 0.5 || B.y + rb.h <= A.y + 0.5;
        if (!sep) return true;
      }
    }
  }
  return false;
}
// No placement spills past its page bounds.
function withinBounds(sizes: PackRect[], pages: PackedPage[]): boolean {
  return pages.every((pg) => pg.place.every((p) => p.x + sizes[p.i].w <= pg.w + 0.5 && p.y + sizes[p.i].h <= pg.h + 0.5)
    || pg.place.length === 1); // a lone oversized rect is allowed to clip
}

describe('packAll', () => {
  it('packs four half×half cells onto a single page', () => {
    const sizes: PackRect[] = Array.from({ length: 4 }, () => ({ w: 50, h: 70 })); // 2×2 of the portrait page
    const pages = packAll(sizes, P, L);
    expect(pages).toHaveLength(1);
    expect(pages[0].place).toHaveLength(4);
    expect(anyOverlap(sizes, pages)).toBe(false);
    expect(withinBounds(sizes, pages)).toBe(true);
  });

  it('spills to a second page when they do not all fit', () => {
    const sizes: PackRect[] = Array.from({ length: 5 }, () => ({ w: 50, h: 70 })); // 4/page → 2 pages
    const pages = packAll(sizes, P, L);
    expect(pages).toHaveLength(2);
    expect(allPlaced(sizes, pages)).toEqual([0, 1, 2, 3, 4]);
  });

  it('places every rect exactly once and never overlaps (mixed sizes)', () => {
    const sizes: PackRect[] = [
      { w: 100, h: 40 }, { w: 60, h: 60 }, { w: 40, h: 40 }, { w: 90, h: 30 },
      { w: 50, h: 70 }, { w: 30, h: 30 }, { w: 70, h: 50 }, { w: 45, h: 45 },
    ];
    const pages = packAll(sizes, P, L);
    expect(allPlaced(sizes, pages)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(anyOverlap(sizes, pages)).toBe(false);
    expect(withinBounds(sizes, pages)).toBe(true);
  });

  it('prefers the orientation that fits more area', () => {
    // Wide rects (130×40): only 1 fits across portrait (100) but nothing wider; landscape (140) fits them.
    const sizes: PackRect[] = Array.from({ length: 2 }, () => ({ w: 130, h: 40 }));
    const pages = packAll(sizes, P, L);
    expect(pages).toHaveLength(1);
    expect(pages[0].orient).toBe('landscape'); // both wide rects fit stacked on a landscape page
  });

  it('is deterministic', () => {
    const sizes: PackRect[] = [{ w: 50, h: 70 }, { w: 70, h: 50 }, { w: 40, h: 40 }, { w: 90, h: 90 }];
    expect(JSON.stringify(packAll(sizes, P, L))).toBe(JSON.stringify(packAll(sizes, P, L)));
  });

  it('empty input → no pages', () => {
    expect(packAll([], P, L)).toEqual([]);
  });
});
