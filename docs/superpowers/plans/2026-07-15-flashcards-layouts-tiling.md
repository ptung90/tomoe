# Flashcards: single-card layouts + N-up tiling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Full parity on single-card layouts (11), a declarative layout registry, and N-up tiling (N single-cards per printed sheet) — replacing the bespoke compound builders and `3card`.

**Architecture:** One `LAYOUTS: LayoutDef[]` registry drives slots/splits/labels. Simple layouts render via `GRID_STRATEGIES`. Compound is gone; `buildSheetHTML` tiles N single-cards (each via `buildCardHTML` at cell px) into a grid; `collectPrintSheets` chunks records by `template.cardsPerPage`.

**Tech Stack:** Svelte 5, TS, vitest. No new deps.

## Global Constraints

- Everything under `src/lib/modules/flashcards/`. Module isolation.
- **One `Card` = one record.** No compound `Card`s, no `packedRecordIds` grouping. The pack/persist + synced/stale/edited system stays, but per-record.
- Reference values (grid tracks, slots, splits) transcribed verbatim from flashcard-creator `src/js/render.js` (`GRID_STRATEGIES`) and `src/js/core/state.js` (`LAYOUT_SLOTS`/`LAYOUT_SPLIT_DEFAULTS`).
- `buildCardHTML` signature is unchanged and reused per tile via its `overridePx` param.
- Card interior = FIXED print colors (`#fff`/`#1a1a1a`/`#e5e7eb`/`#9ca3af`); chrome = Calm Paper tokens; lucide subpath imports.
- Pure logic (registry, `sheetGrid`, `collectPrintSheets`, `recordToCard`, migration) immutable + TDD.
- **The `LAYOUTS` registry lives in a new `lib/layouts.ts`** (no render/`marked` deps) so `card-render.ts`, `cardMapping.ts`, and `model.ts` can all import it without pulling `marked` into `model` (avoids a heavy/circular import). `card-render.ts` may re-export it for existing importers.
- **Backward compatibility:** `parseProject` migrates old files (persisted `.tomoe.json` and legacy flashcard-creator `.json`) that reference removed compound layouts — see Task 1 Step 6.
- Gates per task: `npm run check` 0 errors · `npm test` green, 0 unhandled (re-run once on EBUSY) · `npm run build` OK. Merge only on green.

## The 11 single-card layouts (registry source of truth)

| id | label | slots | split {row,col,inner} | hideTitle |
|---|---|---|---|---|
| `fulltext` | Text only | 0 | 0,50,50 | yes |
| `fullimage` | Image only | 1 | 100,100,50 | yes |
| `1full` | Image + text | 1 | 100,100,50 | no |
| `1top-1bot` | Image top / text bottom | 2 | 50,50,50 | no |
| `2x2` | 2×2 grid | 4 | 50,50,50 | no |
| `1top-2bot` | 1 top / 2 bottom | 3 | 50,50,50 | no |
| `2top-1bot` | 2 top / 1 bottom | 3 | 50,50,50 | no |
| `1top-3bot` | 1 top / 3 bottom | 4 | 67,50,50 | no |
| `1big-2small` | 1 big + 2 small | 3 | 50,67,50 | no |
| `1left-2right` | 1 left / 2 right | 3 | 50,33,50 | no |
| `1left-3right` | 1 left / 3 right | 4 | 50,33,50 | no |

`GRID_STRATEGIES` (args `(r,c,n)` = row,col,inner):
```
2x2:          grid-template-rows:${r}% ${100-r}%;grid-template-columns:${c}% ${100-c}%;
1top-1bot:    grid-template-rows:${r}% ${100-r}%;
2top-1bot:    grid-template-rows:${r}% ${100-r}%;grid-template-columns:${n}% ${100-n}%;
1top-2bot:    grid-template-rows:${r}% ${100-r}%;grid-template-columns:${n}% ${100-n}%;
1big-2small:  grid-template-columns:${c}% ${100-c}%;grid-template-rows:${n}% ${100-n}%;
1left-2right: grid-template-columns:${c}% ${100-c}%;grid-template-rows:${n}% ${100-n}%;
1left-3right: grid-template-columns:${c}% ${100-c}%;grid-template-rows:1fr 1fr 1fr;
1top-3bot:    grid-template-rows:${r}% ${100-r}%;grid-template-columns:1fr 1fr 1fr;
```
(`fulltext`/`fullimage`/`1full` have no `GRID_STRATEGIES` entry — they use the special/default path.)

---

## Task 1: Layout registry + remove compound

**Files:** Create `lib/layouts.ts` (registry); Modify `lib/card-render.ts`, `cardMapping.ts`, `cardOps.ts`, `lib/printCards.ts`, `model.ts` (migration), `components/CardPreview.svelte`; add/trim `tests/flashcards-model.test.ts` (migration), `tests/cardMapping.test.ts`, `tests/printCards.test.ts`, `tests/card-render.test.ts`, `tests/cardOps.test.ts`, `tests/CardPreview.test.ts` (remove 3card/compound assertions).

**Interfaces produced:** `LayoutDef`, `LAYOUTS: LayoutDef[]`, `LAYOUT_IDS: string[]`, derived `LAYOUT_SLOTS`, `LAYOUT_SPLIT_DEFAULTS`, `HIDE_TITLE_LAYOUTS`; `recordToCard(record, schema, template, settings, locale): Card` (single-only).

- [ ] **Step 1: Registry in a new `lib/layouts.ts`** (no `marked`/render deps). Create it and move the layout constants here (out of `card-render.ts`); `card-render.ts`, `cardMapping.ts`, and `model.ts` import from it. Contents:
```ts
export interface LayoutDef {
  id: string; label: string; slots: number;
  split: { row: number; col: number; inner: number };
  hideTitle?: boolean;
}
export const LAYOUTS: LayoutDef[] = [
  { id: 'fulltext',    label: 'Text only',                slots: 0, split: { row: 0,   col: 50, inner: 50 }, hideTitle: true },
  { id: 'fullimage',   label: 'Image only',               slots: 1, split: { row: 100, col: 100, inner: 50 }, hideTitle: true },
  { id: '1full',       label: 'Image + text',             slots: 1, split: { row: 100, col: 100, inner: 50 } },
  { id: '1top-1bot',   label: 'Image top / text bottom',  slots: 2, split: { row: 50,  col: 50, inner: 50 } },
  { id: '2x2',         label: '2×2 grid',                 slots: 4, split: { row: 50,  col: 50, inner: 50 } },
  { id: '1top-2bot',   label: '1 top / 2 bottom',         slots: 3, split: { row: 50,  col: 50, inner: 50 } },
  { id: '2top-1bot',   label: '2 top / 1 bottom',         slots: 3, split: { row: 50,  col: 50, inner: 50 } },
  { id: '1top-3bot',   label: '1 top / 3 bottom',         slots: 4, split: { row: 67,  col: 50, inner: 50 } },
  { id: '1big-2small', label: '1 big + 2 small',          slots: 3, split: { row: 50,  col: 67, inner: 50 } },
  { id: '1left-2right',label: '1 left / 2 right',         slots: 3, split: { row: 50,  col: 33, inner: 50 } },
  { id: '1left-3right',label: '1 left / 3 right',         slots: 4, split: { row: 50,  col: 33, inner: 50 } },
];
export const LAYOUT_IDS: string[] = LAYOUTS.map((l) => l.id);
export const LAYOUT_SLOTS: Record<string, number> = Object.fromEntries(LAYOUTS.map((l) => [l.id, l.slots]));
export const LAYOUT_SPLIT_DEFAULTS: Record<string, { row: number; col: number; inner: number }> =
  Object.fromEntries(LAYOUTS.map((l) => [l.id, l.split]));
export const HIDE_TITLE_LAYOUTS = new Set(LAYOUTS.filter((l) => l.hideTitle).map((l) => l.id));
```
Keep the existing `GRID_STRATEGIES` (4 entries) and `getGridTemplateStyle` unchanged for now.

- [ ] **Step 2: Delete compound from `card-render.ts`.** Remove `renderCompoundShell`, `CompoundShellArgs`, `CompoundCtx`, `build_3card`, `buildCompound`, and the `COMPOUND_LAYOUTS` usage. In `buildCardHTML`, delete the block:
```ts
  const compoundCtx: CompoundCtx = { ... };
  const compoundHtml = buildCompound(card, compoundCtx);
  if (compoundHtml !== null) return compoundHtml;
```
and the now-unused compound locals (`compoundWrapperStyle`, `borderCss` if only used there — keep `borderCss` if still referenced). Leave `fullimage`/`fulltext`/default paths intact.

- [ ] **Step 3: `cardMapping.ts` → single-only.** Remove `COMPOUND_LAYOUTS`, `cardsPerPage`, and the compound branch of `recordsToCard`. Rename/simplify to a single `recordToCard(record, schema, template, settings, locale): Card` (the current single branch — id `preview_<recordId>`, imageHeightPercent from `template.imageHeightPercent ?? DEFAULT_IMAGE_HEIGHT`, images from image fields, sections from text fields, no `packedRecordIds`). Keep `chunkRecords` (tiling uses it), `deriveAutoTemplate`, `applySettings`, `applyTemplatePatch`. Update the old `recordsToCard`/`recordToCard` export so existing callers compile (CardPreview, cardOps, printCards) — they will be rewired in this task and Task 3.

- [ ] **Step 4: `cardOps.ts` → one card per record.** `packRecords`/`packAllForSchema` build one card per record via `recordToCard` (drop the `cardsPerPage`/chunk grouping and `packedRecordIds`). `schemaForCard(project, card)` resolves via `card.recordId`. `isCardStale`/`regenerateCard`/`setCardCell`/`applyCardToRecords` operate on the single source record (drop the `packedRecordIds[0]` iteration). `deleteCard` unchanged.

- [ ] **Step 5: `printCards.ts` interim.** Keep `collectPrintCards` but simplify to one card per record (packed card if `project.cards.find(c => c.recordId === r.id)`, else `recordToCard`). (Task 3 adds `collectPrintSheets`; keeping `collectPrintCards` green here avoids breaking PrintView until Task 4.)

- [ ] **Step 6: Migration in `parseProject` (`model.ts`).** Import `LAYOUT_IDS` from `lib/layouts.ts`. Add and apply migration so old files open on the new model:
```ts
const COMPOUND_MIGRATION: Record<string, { layout: string; cardsPerPage: number }> = {
  '3card':     { layout: '1top-1bot', cardsPerPage: 3 },
  '2img-2txt': { layout: '1top-1bot', cardsPerPage: 2 },
  '3img-3txt': { layout: '1top-1bot', cardsPerPage: 3 },
  'img3-txt3': { layout: '1top-1bot', cardsPerPage: 3 },
  '6cell':     { layout: '1top-1bot', cardsPerPage: 6 },
  '8img-8txt': { layout: '1top-1bot', cardsPerPage: 8 },
  'txtgrid':   { layout: 'fulltext',  cardsPerPage: 12 },
};
function migrateTemplate(t: any, schemaHasImage: boolean): CardTemplate {
  const m = COMPOUND_MIGRATION[t?.layout];
  if (m) return { ...t, layout: m.layout, cardsPerPage: t.cardsPerPage ?? m.cardsPerPage };
  if (!LAYOUT_IDS.includes(t?.layout)) return { ...t, layout: schemaHasImage ? '1top-1bot' : 'fulltext' };
  return t;
}
```
In `parseProject`, after normalizing schemas, map each schema's `cardTemplates` through `migrateTemplate` (`schemaHasImage = schema.fields.some(f => f.type === 'image')`), and **drop compound card snapshots**: `cards: (Array.isArray(raw.cards) ? raw.cards : []).filter((c) => !(c.packedRecordIds?.length)).map((c) => COMPOUND_MIGRATION[c.layout] ? { ...c, layout: COMPOUND_MIGRATION[c.layout].layout } : c)`. Records/schemas/settings unchanged.

- [ ] **Step 7: `CardPreview.svelte`.** Import `LAYOUTS` (defs) from `lib/layouts.ts` instead of the string array; drop the local `LAYOUT_LABELS`; render options as `{#each LAYOUTS as l (l.id)}<option value={l.id}>{l.label}</option>{/each}`. `cardHtml` uses `recordToCard(record, schema, template, …)` (single). Remove the `chunkRecords(...cardsPerPage...)` 3card logic — preview is the single card.

- [ ] **Step 8: Trim compound tests + add migration test.** Add to `tests/flashcards-model.test.ts`: a legacy `3card` project (template `layout:'3card'`, a card with `packedRecordIds:['r1','r2','r3']`) → after `parseProject`: `schemas[0].cardTemplates[0].layout === '1top-1bot'`, `.cardsPerPage === 3`, and `cards.every(c => !c.packedRecordIds?.length)` (compound snapshot dropped). Then trim compound tests (below). In `cardMapping.test.ts` remove the `3card`/compound `recordsToCard` cases and `cardsPerPage` compound assertions (keep single-card mapping + `chunkRecords`). In `printCards.test.ts` update expectations to one-card-per-record. In `card-render.test.ts`/`cardOps.test.ts`/`CardPreview.test.ts` remove 3card/`packedRecordIds` assertions. Add: `LAYOUTS` has 11 unique ids; `LAYOUT_SLOTS['1big-2small']===3`; `HIDE_TITLE_LAYOUTS` has `fulltext`+`fullimage` only.

- [ ] **Step 9: RED→GREEN + gates.** `npm test` green (compound tests removed), `npm run check` 0, `npm run build` OK. Commit: `refactor(flashcards): layout registry + remove compound/3card (one card per record)`.

---

## Task 2: The 5 new simple layouts

**Files:** Modify `lib/card-render.ts` (`GRID_STRATEGIES`); Test `tests/card-render.test.ts`.

- [ ] **Step 1: Failing test** — add to `tests/card-render.test.ts` a case per new layout asserting the grid tracks + slot count. Example:
```ts
import { buildCardHTML, LAYOUT_SLOTS } from '../src/lib/modules/flashcards/lib/card-render';
// minimal card helper (single), then:
it('1big-2small renders a 2-col grid with 3 image slots', () => {
  const html = buildCardHTML(cardWith('1big-2small', 3), settings, 'en');
  expect(html).toContain('grid-template-columns:67% 33%');
  expect((html.match(/fc-image-slot/g) || []).length).toBe(3);
});
```
Cover `1big-2small`, `1left-2right`, `1left-3right`, `1top-3bot`, `1full` (image-area present, 1 slot, no grid template).

- [ ] **Step 2: RED** — `npm test -- card-render` fails (grid strings absent).

- [ ] **Step 3: Implement** — add to `GRID_STRATEGIES` in `card-render.ts`:
```ts
  '1big-2small': (r, c, n) => `grid-template-columns:${c}% ${100 - c}%;grid-template-rows:${n}% ${100 - n}%;`,
  '1left-2right': (r, c, n) => `grid-template-columns:${c}% ${100 - c}%;grid-template-rows:${n}% ${100 - n}%;`,
  '1left-3right': (_r, c) => `grid-template-columns:${c}% ${100 - c}%;grid-template-rows:1fr 1fr 1fr;`,
  '1top-3bot': (r) => `grid-template-rows:${r}% ${100 - r}%;grid-template-columns:1fr 1fr 1fr;`,
```
(`1full` needs no entry — the LAYOUTS registry from Task 1 already gives it slots:1; the default path renders it.)

- [ ] **Step 4: GREEN + gates.** Commit: `feat(flashcards): 5 more single-card layouts (1big-2small, 1full, 1left-2right, 1left-3right, 1top-3bot)`.

---

## Task 3: N-up tiling core (pure) — fixed grid **and** auto-fit

**Files:** Modify `model.ts` (`CardTemplate` fields), `lib/card-render.ts` (`sheetGrid`, `sheetLayout`, `buildSheetHTML`), `lib/printCards.ts` (`collectPrintSheets`); Tests `tests/card-render.test.ts`, `tests/printCards.test.ts`.

Two tiling modes (user chose both):
- **Fixed grid:** `cardsPerPage` ∈ 1/2/3/4/6/8/9 → sheet split into N equal cells; card scales to fill the cell.
- **Auto-fit:** `autoFit: true` + a `cardSize` (paper enum, e.g. `A7`) → pack real-size cards `floor(sheet/card)` per sheet, order-independent (the print-and-cut use case).

`settings.paperSize` = the **sheet** (what you print on); `cardSize` = the **card's** physical size (auto-fit only).

- [ ] **Step 1: `model.ts`** — add to `CardTemplate`: `cardsPerPage?: number;`, `autoFit?: boolean;`, `cardSize?: 'A4'|'A5'|'A6'|'A7'|'A8'|'Letter';`.

- [ ] **Step 2: Failing tests** — `sheetGrid` presets, `sheetLayout` (fixed + auto), `collectPrintSheets` chunking:
```ts
import { sheetGrid, sheetLayout } from '../src/lib/modules/flashcards/lib/card-render';
expect(sheetGrid(6, 'portrait')).toEqual({ cols: 2, rows: 3 });
expect(sheetGrid(6, 'landscape')).toEqual({ cols: 3, rows: 2 });
// auto-fit: A7 cards on an A4 sheet (portrait) → floor(A4/A7) grid, real-size cells
const a = sheetLayout({ autoFit: true, cardSize: 'A7' }, 'A4', 'portrait');
expect(a.perPage).toBe(a.cols * a.rows);
expect(a.cols).toBeGreaterThanOrEqual(1);
// collectPrintSheets: 7 records, cardsPerPage 6 → 2 sheets (6 + 1)
```

- [ ] **Step 3: Implement `sheetGrid` + `sheetLayout` + `buildSheetHTML` in `card-render.ts`:**
```ts
const SHEET_GRID: Record<number, [number, number]> = { 1:[1,1], 2:[1,2], 3:[1,3], 4:[2,2], 6:[2,3], 8:[2,4], 9:[3,3] };
/** Columns×rows for a fixed N-per-sheet; landscape swaps. Pure. */
export function sheetGrid(n: number, orientation: string): { cols: number; rows: number } {
  let [cols, rows] = SHEET_GRID[n] ?? [1, Math.max(1, n)];
  if (orientation === 'landscape') [cols, rows] = [rows, cols];
  return { cols, rows };
}
/** Resolve grid + cell px for a template's tiling on a sheet. Pure.
 *  fixed grid → cells fill the sheet (fillCell=true); auto-fit → real-size cards packed floor(sheet/card). */
export function sheetLayout(
  opts: { autoFit?: boolean; cardSize?: string; cardsPerPage?: number },
  sheetSize: string, orientation: string,
): { cols: number; rows: number; cellW: number; cellH: number; perPage: number; fillCell: boolean } {
  const sheet = getPaperPx(sheetSize, orientation);
  if (opts.autoFit) {
    const card = getPaperPx(opts.cardSize || 'A7', orientation);
    const cols = Math.max(1, Math.floor(sheet.w / card.w));
    const rows = Math.max(1, Math.floor(sheet.h / card.h));
    return { cols, rows, cellW: card.w, cellH: card.h, perPage: cols * rows, fillCell: false };
  }
  const { cols, rows } = sheetGrid(Math.max(1, opts.cardsPerPage || 1), orientation);
  return { cols, rows, cellW: Math.floor(sheet.w / cols), cellH: Math.floor(sheet.h / rows), perPage: cols * rows, fillCell: true };
}
/** Tile cards into a sheet per a resolved `sheetLayout`. Each cell = buildCardHTML at cell px. */
export function buildSheetHTML(cards: Card[], lay: { cols: number; rows: number; cellW: number; cellH: number; fillCell: boolean }, settings: Settings, locale: string, forPrint = false, overridePx: { w: number; h: number } | null = null): string {
  const orient = (cards[0]?.orientation as string) || settings.orientation;
  const { w, h } = overridePx || getPaperPx(settings.paperSize, orient);
  const { cols, rows, cellW, cellH } = lay;
  const cells = Array.from({ length: cols * rows }, (_, i) => {
    const card = cards[i];
    const inner = card ? buildCardHTML(card, settings, locale, forPrint, { w: cellW, h: cellH }) : '';
    return `<div class="fc-sheet-cell" style="width:${cellW}px;height:${cellH}px;overflow:hidden;">${inner}</div>`;
  }).join('');
  // fixed grid fills the sheet (1fr tracks); auto-fit uses real-size px tracks packed from the top-left.
  const colTrack = lay.fillCell ? 'repeat(' + cols + ',1fr)' : 'repeat(' + cols + ',' + cellW + 'px)';
  const rowTrack = lay.fillCell ? 'repeat(' + rows + ',1fr)' : 'repeat(' + rows + ',' + cellH + 'px)';
  const justify = lay.fillCell ? '' : 'justify-content:start;align-content:start;';
  return `<div class="fc-sheet" style="width:${w}px;height:${h}px;display:grid;grid-template-columns:${colTrack};grid-template-rows:${rowTrack};${justify}background:#fff;overflow:hidden;">${cells}</div>`;
}
```

- [ ] **Step 4: `collectPrintSheets` in `printCards.ts`:**
```ts
import type { Project, Card } from '../model';
import { deriveAutoTemplate, recordToCard, chunkRecords } from '../cardMapping';
import { sheetLayout } from './card-render';

export interface Sheet { cards: Card[]; lay: ReturnType<typeof sheetLayout>; }
export function collectPrintSheets(project: Project): Sheet[] {
  const out: Sheet[] = [];
  for (const schema of project.schemas) {
    const template = schema.cardTemplates[0] ?? deriveAutoTemplate(schema);
    const orient = template.orientation || project.settings.orientation;
    const lay = sheetLayout(template, project.settings.paperSize, orient);
    const recs = project.records.filter((r) => r.schemaId === schema.id);
    const cards = recs.map((r) =>
      project.cards.find((c) => c.recordId === r.id) ?? recordToCard(r, schema, template, project.settings, project.activeLocale));
    for (const chunk of chunkRecords(cards, lay.perPage)) out.push({ cards: chunk, lay });
  }
  return out;
}
```
(`chunkRecords` is generic over arrays — reuse it on `Card[]`.) Keep `collectPrintCards` too (Print button count / gallery may still use it).

- [ ] **Step 5: GREEN + gates.** Commit: `feat(flashcards): N-up tiling core — cardsPerPage, sheetGrid, buildSheetHTML, collectPrintSheets`.

---

## Task 4: Wire tiling into print / PDF / preview

**Files:** Modify `components/PrintView.svelte`, `lib/pdfExport.ts`, `components/CardPreview.svelte`, `components/StyleControls.svelte`; Tests `tests/PrintView.test.ts`, `tests/CardPreview.test.ts`.

- [ ] **Step 1: PrintView** — iterate `collectPrintSheets($project)`; render one `.print-page` per sheet via `{@html buildSheetHTML(sheet.cards, sheet.lay, $project.settings, $project.activeLocale, true)}` sized to `getPaperPx($project.settings.paperSize, orient)`. Keep the `@media print` isolation (`:has(.print-view)`).

- [ ] **Step 2: pdfExport** — `exportCardsPdf` loops `collectPrintSheets`; per sheet, `host.innerHTML = buildSheetHTML(sheet.cards, sheet.lay, s, locale, true, px)`, capture, one PDF page per sheet (paper mm = the SHEET's paperSize/orientation). Filename/stamp unchanged.

- [ ] **Step 3: CardPreview** — add a **Card ↔ Sheet** segmented toggle. In `Card` mode show the single `buildCardHTML`; in `Sheet` mode compute `lay = sheetLayout(template, settings.paperSize, orient)`, find the chunk (`chunkRecords(schemaCards, lay.perPage)`) the selected record belongs to, and show `buildSheetHTML(chunk, lay, …)`, scaled by the existing zoom/fit. Registry labels already wired (Task 1).

- [ ] **Step 4: Cards/page control (in the preview toolbar or StyleControls Card tab)** — a mode select **Fixed N ↔ Auto-fit** bound to `template.autoFit` (via `setTemplateLayout`):
  - **Fixed:** a `cardsPerPage` select (1/2/3/4/6/8/9).
  - **Auto-fit:** a `cardSize` select (A5/A6/A7/A8) → `setTemplateLayout({ autoFit: true, cardSize })`. Show the resolved perPage (from `sheetLayout`) as a hint (e.g. "≈ 8/trang").

- [ ] **Step 5: Tests** — PrintView renders `.print-page` count = sheets (6-up, 7 records → 2). CardPreview: Sheet toggle renders `.fc-sheet` with the right cell count; changing Cards/page or Auto-fit calls `setTemplateLayout`. `sheetLayout` auto-fit already unit-tested in T3.

- [ ] **Step 6: Manual (human)** — preview Card/Sheet toggle; print & PDF a 6-up and 9-up deck.

- [ ] **Step 7: GREEN + gates.** Commit: `feat(flashcards): render N-up sheets in preview/print/PDF + Cards/page control`.

---

## Task 5: Visual pass

**Files:** Modify `lib/card-render.ts` / `lib/card-render.css` as needed. Mostly manual.

- [ ] **Step 1** — verify each of the 11 layouts in portrait + landscape: image-area height (Image %), grid splits, text-area overflow, empty-slot rendering (screen placeholder vs blank on print).
- [ ] **Step 2** — tiled sheets: even cell sizing, per-card margins act as gaps, no clipping/overflow, blank trailing cells on the last sheet.
- [ ] **Step 3** — tune spacing/borders/`background`/`overflow` where a layout reads poorly; keep fixed interior colors. Re-run gates after any code change.
- [ ] **Step 4: Manual (human)** sign-off across layouts × orientation × print/PDF.
- [ ] **Step 5: Commit** any tuning: `style(flashcards): visual tuning across single-card layouts + tiled sheets`.

---

## Self-review notes (author)
- Coverage: registry integrity + single mapping (T1), 5 grid layouts (T2), sheetGrid/buildSheetHTML/collectPrintSheets pure (T3), preview/print/PDF wiring + Cards/page (T4), visuals (T5, manual).
- Simplification: compound + 3card removed; `buildCardHTML` reused per tile via `overridePx`; one Card = one record.
- Testing gaps (declared, human): actual print/PDF output, canvas capture of tiled sheets, and every layout's visual quality.
- Out of scope: drag-handles, grouped image/text compound arrangements, per-card text-grid config.
