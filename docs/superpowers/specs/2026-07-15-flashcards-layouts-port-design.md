# Tomoe Spec #9 — Flashcards: single-card layouts + N-up tiling (design)

Date: 2026-07-15. Module: `src/lib/modules/flashcards/`.
Reference: flashcard-creator `src/js/render.js`, `core/state.js`.
Decisions (from the user):
- Port **all the single-card (grid) layouts** for full parity.
- **Optimize** via a data-driven layout registry + visual tuning.
- **Compound = N-up tiling**, dropping the old bespoke compound builders **and** the current
  `3card` compound. A page can hold N single-cards, tiled in a grid.

## Goal

1. Reach full parity on **single-card** layouts (add the 5 missing grid layouts).
2. Replace the compound subsystem with a single generic **N-up tiler**: one Card = one record;
   a `cardsPerPage` setting tiles N records' single-cards into a grid on one printed/exported sheet.
3. Refactor the engine to a **declarative layout registry** and tune each layout visually.

This is simpler than the old approach: no per-layout compound builders, no compound `Card`
objects, and "how many cards per sheet" becomes a print/preview concern separate from card design.

## Layouts

Single-card layouts (11) — the 7 Tomoe has minus `3card`, plus the 5 missing:
`fulltext, fullimage, 2x2, 1top-1bot, 1top-2bot, 2top-1bot, 1big-2small, 1full, 1left-2right, 1left-3right, 1top-3bot`.

**Removed:** `3card` and every bespoke compound id (`2img-2txt, 3img-3txt, img3-txt3, 6cell, 8img-8txt, txtgrid`) — subsumed by tiling.

## Data-driven registry (the "optimize")

One table in `lib/card-render.ts` replaces the scattered `LAYOUTS`/`LAYOUT_SLOTS`/`LAYOUT_SPLIT_DEFAULTS`
constants:

```ts
export interface LayoutDef {
  id: string; label: string; slots: number;
  split: { row: number; col: number; inner: number };
  hideTitle?: boolean;
}
export const LAYOUTS: LayoutDef[] = [ /* 11 single-card defs, values verbatim from the reference */ ];
```

`LAYOUT_IDS`, `LAYOUT_SLOTS`, `LAYOUT_SPLIT_DEFAULTS`, `HIDE_TITLE_LAYOUTS`, and the preview
dropdown labels all derive from it. Simple layouts render via `GRID_STRATEGIES[id]` (track-css
generator) — the 5 new ones are just new entries. No `kind`/compound branching remains.

## N-up tiling

- **New template field** `cardsPerPage: number` (default 1). Presets 1/2/3/4/6/8/9 in the UI.
- **Grid heuristic** (`sheetGrid(n, orientation)`): columns chosen for a near-square fit, wider in
  landscape — e.g. portrait 2→1×2, 3→1×3, 4→2×2, 6→2×3, 8→2×4, 9→3×3; landscape swaps rows/cols.
- **`buildSheetHTML(records, schema, template, settings, locale, forPrint)`**: a page-sized div
  (full paper px) containing a CSS grid of `cols×rows` cells; each cell renders
  `buildCardHTML(recordToCard(record, …), settings, locale, forPrint, cellPx)` where `cellPx` is
  the cell's pixel box. Reuses the existing single-card renderer at cell size (via its `overridePx`
  param) — the tiler itself is ~30 lines.
- **`collectPrintSheets(project)`**: for each schema, `chunkRecords(records, cardsPerPage)` → one
  sheet per chunk (replaces `collectPrintCards`'s packed+auto compound logic).

## Card model simplification

- **One `Card` = one record.** Drop compound entirely:
  - `card-render.ts`: remove `build_3card`, `buildCompound`, `renderCompoundShell`, compound ctx.
  - `cardMapping.ts`: remove `COMPOUND_LAYOUTS`, the compound branch of `recordsToCard`; `recordsToCard`
    becomes single-only (or rename to `recordToCard`); `cardsPerPage(layout)` is gone — sheets use
    `template.cardsPerPage`.
  - `cardOps.ts`: `packRecords`/`packAllForSchema` create one card per record (no `packedRecordIds`
    grouping); `schemaForCard` uses `card.recordId`; `isCardStale`/`applyCardToRecords` stay per-record.
- The pack/persist + synced/stale/edited status system is **kept** (it's per-record, orthogonal to compound).

## Preview / print / gallery

- **CardPreview** defaults to the single card for the selected record, with a **Card ↔ Sheet toggle**
  in the preview toolbar: "Sheet" renders the full tiled page (`buildSheetHTML` for the chunk the
  record belongs to) so the user sees exactly what prints. A **Cards/page** control (bound to
  `template.cardsPerPage`) sits next to it (or in StyleControls' Card area).
- **PrintView / pdfExport** iterate `collectPrintSheets` → one page per sheet, rendered by `buildSheetHTML`.
- **CardGallery** shows single cards (one per record); no compound thumbnails.

## Visual tuning ("tối ưu")

- Uniform sheet `gap` between tiled cells; each cell keeps the card's own border/margin.
- `forPrint`: empty cells render blank (no box), matching the reference.
- Image-area height via the existing **Image %** control for image-bearing single layouts.
- Card interior = fixed print colors; chrome = Calm Paper tokens.

## Out of scope (deferred)

- Interactive split drag-handles (reference `buildHandles`) — use default splits + Image %.
- Grouped "images-then-text" arrangements (old `2img-2txt`/`img3-txt3`) — intentionally dropped.
- Per-sheet mixed layouts, page headers/footers, `txtgrid`-style per-card text grids.

## Architecture / files

```
src/lib/modules/flashcards/
  lib/card-render.ts    # MODIFY: LayoutDef/LAYOUTS registry + derived maps; GRID_STRATEGIES (+5);
                        #   remove compound (build_3card/buildCompound); add buildSheetHTML + sheetGrid
  lib/printCards.ts     # MODIFY: collectPrintSheets(project) → Sheet[] (chunks of records)
  cardMapping.ts        # MODIFY: single-only recordToCard; drop COMPOUND_LAYOUTS/cardsPerPage compound
  cardOps.ts            # MODIFY: one card per record (drop packedRecordIds grouping)
  model.ts              # MODIFY: CardTemplate.cardsPerPage?: number
  components/PrintView.svelte      # MODIFY: render sheets via buildSheetHTML
  components/CardPreview.svelte     # MODIFY: registry labels; Cards/page control
  components/StyleControls.svelte   # MODIFY (opt): Cards/page in Card/Image tab
  components/CardGallery.svelte     # MODIFY: single cards only
  lib/pdfExport.ts      # MODIFY: iterate sheets
```

## Testing

- Registry: `LAYOUTS` = 11 unique single-card ids; derived maps match reference values.
- `buildCardHTML` per new simple layout → expected `grid-template` tracks + N `fc-image-slot`.
- `sheetGrid(n, orientation)` → correct cols/rows per preset (pure, tested).
- `collectPrintSheets` → chunks records by `cardsPerPage` per schema; sheet count correct; empty project → [].
- `recordToCard` single mapping unchanged; compound tests removed.
- `cardOps` one-card-per-record; stale/apply still pass.
- Gates: `npm run check` 0 · `npm test` green · `npm run build` OK.
- **Manual (human):** all 11 layouts in preview (portrait/landscape); tile 6-up & 9-up → print/PDF.

## Plan shape (→ writing-plans → subagent-driven)

1. **Registry + drop compound** — `LayoutDef`/`LAYOUTS`; remove `3card`/compound from render, cardMapping, cardOps, printCards; trim compound tests; keep single-card pack system. Regression-gate the remaining 7→(6) single layouts.
2. **Simple layouts (+5)** — grid strategies, splits, slots, labels + tests.
3. **N-up tiling core** — `model.CardTemplate.cardsPerPage`; `sheetGrid`; `buildSheetHTML`; `collectPrintSheets` + tests.
4. **Wire tiling** — PrintView + pdfExport render sheets; CardPreview/StyleControls Cards/page control; gallery single-cards. Manual verify.
5. **Visual pass** — spacing/borders/fit across 11 layouts + tiled sheets, both orientations. Manual.
