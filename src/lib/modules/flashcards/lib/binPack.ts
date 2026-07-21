/** Paper-saving 2D bin-packing for print/PDF: pack a set of fixed-size card rectangles (exact px,
 *  no snapping — sizes come straight from each view's sheetLayout) into as few pages as possible.
 *  Each page independently picks the paper orientation (portrait/landscape) that fits more, so the
 *  output can mix both. Greedy First-Fit-Decreasing-Height (shelf) packing — deterministic, no
 *  rotation of cards (aspect is preserved). Pure. */

export interface PackRect { w: number; h: number }
export interface Placement { i: number; x: number; y: number }
export interface PackedPage { orient: 'portrait' | 'landscape'; w: number; h: number; place: Placement[] }

const EPS = 0.5; // px slack so exact floor-divided cells (e.g. 3×(w/3)) still count as fitting

/** FFDH onto ONE page: walk `order` (indices into `sizes`, pre-sorted tallest-first), placing each on
 *  the first shelf with room (else a new shelf below, if it fits the page height). Returns what landed
 *  plus the indices that didn't fit this page. Pure. */
function packOnePage(order: number[], sizes: PackRect[], pageW: number, pageH: number): { placed: Placement[]; rest: number[] } {
  const shelves: { y: number; h: number; x: number }[] = [];
  const placed: Placement[] = [];
  const rest: number[] = [];
  for (const i of order) {
    const r = sizes[i];
    if (r.w > pageW + EPS || r.h > pageH + EPS) { rest.push(i); continue; } // too big for this page size
    let done = false;
    for (const sh of shelves) {
      if (sh.x + r.w <= pageW + EPS && r.h <= sh.h + EPS) {
        placed.push({ i, x: sh.x, y: sh.y }); sh.x += r.w; done = true; break;
      }
    }
    if (done) continue;
    const y = shelves.length ? shelves[shelves.length - 1].y + shelves[shelves.length - 1].h : 0;
    if (y + r.h <= pageH + EPS) {
      shelves.push({ y, h: r.h, x: r.w });
      placed.push({ i, x: 0, y });
    } else {
      rest.push(i);
    }
  }
  return { placed, rest };
}

function placedArea(placed: Placement[], sizes: PackRect[]): number {
  return placed.reduce((s, p) => s + sizes[p.i].w * sizes[p.i].h, 0);
}

/** Pack all `sizes` into pages, each page in whichever of `portrait`/`landscape` fits more area.
 *  Every rect is placed on exactly one page (a rect bigger than both page sizes gets its own page,
 *  clipped). Deterministic. Pure. */
export function packAll(sizes: PackRect[], portrait: PackRect, landscape: PackRect): PackedPage[] {
  let remaining = sizes.map((_, i) => i).sort((a, b) => (sizes[b].h - sizes[a].h) || (sizes[b].w - sizes[a].w));
  const pages: PackedPage[] = [];
  let guard = 0;
  while (remaining.length && guard++ < 100000) {
    const p = packOnePage(remaining, sizes, portrait.w, portrait.h);
    const l = packOnePage(remaining, sizes, landscape.w, landscape.h);
    const useL = placedArea(l.placed, sizes) > placedArea(p.placed, sizes);
    const chosen = useL ? l : p;
    if (chosen.placed.length === 0) {
      // Bigger than both page orientations — give it its own (larger) page; clipping is the user's call.
      const i = remaining[0];
      pages.push({ orient: 'landscape', w: landscape.w, h: landscape.h, place: [{ i, x: 0, y: 0 }] });
      remaining = remaining.slice(1);
      continue;
    }
    pages.push({
      orient: useL ? 'landscape' : 'portrait',
      w: useL ? landscape.w : portrait.w,
      h: useL ? landscape.h : portrait.h,
      place: chosen.placed,
    });
    const done = new Set(chosen.placed.map((pl) => pl.i));
    remaining = remaining.filter((i) => !done.has(i));
  }
  return pages;
}
