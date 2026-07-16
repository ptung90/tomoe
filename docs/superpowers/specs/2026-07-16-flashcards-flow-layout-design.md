# Flashcards: "Flow" (document) layout family — design

**Date:** 2026-07-16
**Module:** `src/lib/modules/flashcards`
**Status:** Design (approved sections A–D; awaiting spec review)

## Problem

The flashcard render engine has 12 grid layouts (`lib/layouts.ts`). Each is a
`LayoutDef` (`slots` + `split{row,col,inner}`) rendered by `buildCardHTML` into
**one card = one record = one fixed page**: a single `.fc-image-area` (N image
slots) stacked with a `.fc-text-area` (title + sections), then tiled N-up onto
sheets for print/PDF.

The user needs a different kind of output: a **country-profile document** — a
big outline-title collage cover, then text-heavy pages with named sections
(Landscape, Plants and Animals, Landmarks and Culture, Food), each a bold
heading + markdown bullet list, with images **floated** beside the text so it
wraps around them. It spans multiple pages. The user will author record sets for
**many countries** under one schema, and wants a **few fixed layout variants**
(differing only in image placement / add-remove images) — without diluting the
existing grid layouts.

## Decisions (from brainstorming)

1. **Render model:** multi-page document, but each page is bounded to a **view**;
   content that overflows a page **auto-fits** (never spills to an extra page).
2. **"Pages" = views:** reuse the existing multi-view mechanism (one
   `CardTemplate` per view). A country doc = 3 views (cover / page-1 / page-2).
   Print/PDF already concatenates views in order.
3. **Variants = a few fixed presets** authored in code; the user picks a preset
   per view. Not drag-drop, not per-image positioning UI.
4. **Style:** the flow layout ships its own CSS baseline (no border, bold section
   headings, bullets, header+flag column, outline collage title) but still
   **respects the existing style cascade** (Global settings → schema
   `template.style` → card `style`) for font/color/margin/paraGap.
5. **Images:** the cover reuses the **same image fields** as the pages (no
   separate line-art fields). Auto-fill (search-query → image) is a
   **placeholder/reference only** — the user replaces/crops final images by hand.

## Architecture — Approach A (chosen)

Keep the grid engine untouched; add a parallel **flow** family that plugs into
the existing dispatch, cardMapping, picker, print, and style cascade.

- **`LAYOUTS` (grid) is not modified.** A new registry `FLOW_LAYOUTS` lives in a
  new file and is merged with grid layouts only where the picker lists options.
- `buildCardHTML` gains **one dispatch line** at the top; the entire grid path is
  unchanged.
- Print/pack need **no logic changes**: flow presets set `cardsPerPage: 1`, so
  each view renders full-page as one "full" sheet through the existing
  `sheetLayout` → `buildSheetHTML` → `buildCardHTML` pipeline.

### New files

- `src/lib/modules/flashcards/lib/flow-layouts.ts` — `FlowLayoutDef`,
  `FLOW_LAYOUTS`, `isFlowLayout(id)`, `getFlowLayout(id)`. No render/`marked`
  deps (safe for `model.ts`/`cardMapping.ts` to import, same rule as
  `layouts.ts`).
- `src/lib/modules/flashcards/lib/flow-render.ts` — `buildFlowCardHTML(...)` and
  the fit helper. Imports the shared render utilities (`esc`, `mdBlock`,
  `mdInline`, `resolveLocale`) from `card-render.ts`.

### Registry & presets

```ts
export interface FlowLayoutDef {
  id: string; label: string; family: 'flow';
  mode: 'collage' | 'page';
  collageColumns?: number;                       // collage: image grid columns
  titleStyle?: 'filled' | 'outline';             // cover uses 'outline'
  imageWidth?: string;                           // page: floated image width, e.g. '40%'
  sectionImageSide?: 'alt' | 'left' | 'right';   // page: float side; 'alt' = alternate by index
}
export const FLOW_LAYOUTS: FlowLayoutDef[] = [
  { id: 'country-cover', label: 'Country cover (collage)', family: 'flow', mode: 'collage', collageColumns: 3, titleStyle: 'outline' },
  { id: 'country-page',  label: 'Country page',            family: 'flow', mode: 'page', imageWidth: '40%', sectionImageSide: 'alt' },
];
```

- A future variant = a new object (change `collageColumns` / `sectionImageSide` /
  `imageWidth`) — no new code.
- **Header auto-hides** when a view selects no title/meta fields, so View 2
  (Landmarks/Food, continuation) reuses `country-page` with no header. Only
  **2 presets** cover all 3 pages (YAGNI).

## Data flow — record → flow Card (field-role parsing)

Roles are inferred from `SchemaField.type` + the order of fields **within the
view** (`activeFieldsFor`) — no naming convention, no manual mapping config:

| Role | Source | Vietnam example |
|---|---|---|
| **title** | schema title field (first non-image text field), if in the view | `name` → `<h1>Vietnam</h1>` |
| **meta lines** | remaining `type:'text'` fields in the view | `capital`, `language` |
| **sections** | `type:'text-long'` fields in the view | `contentLandscape`, `contentFood`, … |
| **header image** | image field appearing **before** the first section | `imageFlag` |
| **section images** | image field appearing **after/at** a section | `imageLandscape` floats in Landscape |

- Parsing lives in `cardMapping.recordToCard`, guarded by
  `isFlowLayout(template.layout)`. It populates **additive optional** fields on
  `Card`: `meta?: { label: LocalizedText; value: LocalizedText }[]`,
  `headerImage?: CardImage`, and `CardSection.image?: CardImage`. The grid path
  never reads these — its behavior is unchanged.
- **Collage view** (only image fields selected, no long-text): every image field
  → a collage tile (`card.images`); `name` → the large title.
- Author controls page composition and image↔section pairing via each view's
  **field selection + order** (`setViewFields`, already implemented). "Add/remove
  images" = include/exclude an image field, or leave it empty in the record.

> ⚠️ **Assumption to verify during implementation:** in the country schema,
> `capital`/`language` are `type:'text'` and `contentX` are `type:'text-long'`.
> The sample repo project confirms the `text` / `text-long` / `image` type
> system exists, but the country schema (`sch_1t711jio`) is in the user's own
> project, not the repo. If the types differ, the role rule adapts (fall back to
> length heuristic or an explicit per-view mapping).

## Renderer — `buildFlowCardHTML(card, settings, locale, def, pagePx)`

Returns an HTML string (same contract as `buildCardHTML`), reusing shared
helpers. A scoped `<style data-id>` block carries the baseline, mirroring the
existing `buildCardHTML` pattern; the style cascade still feeds
font/color/margin/paraGap.

- **`mode: 'collage'`** — one large title (outline via `-webkit-text-stroke` +
  transparent fill when `titleStyle: 'outline'`) + a CSS grid of `collageColumns`
  columns holding image tiles (`card.images`). No sections, no border.
- **`mode: 'page'`** —
  - **Header block** (only when title/meta present): `<h1>` title + meta lines
    ("Capital- …") in a left column, `headerImage` floated right. Omitted
    entirely when the view has no title/meta.
  - **Sections**: each = bold `Label:` heading + `mdBlock(content)` (markdown
    `- …` → `<ul><li>`). A section's image (if any) uses **CSS `float`**
    (`left`/`right` per `sectionImageSide`; `'alt'` alternates by index) at width
    `imageWidth`, so the section text wraps around it — matching the mock.
- Baseline defaults (no border, heading weight, bullets, header column) are in
  the renderer; mock-matching look out-of-box (border width 0, handwriting-ish
  font) comes from the **schema-library entry's `settings`**, not hardcoded in
  the renderer.

### Auto-fit ("overflow → shrink to fit")

The renderer emits strings, so fitting needs DOM measurement:

- Flow card renders into a fixed page (`pagePx` from `getPaperPx`); an inner
  wrapper has `transform-origin: top left`.
- Helper `fitFlowScale(el, pageInnerH)`: measures natural `scrollHeight`; if it
  exceeds the page height, sets CSS var `--flow-scale = clamp(0.5, pageInnerH /
  naturalH, 1)` and applies `transform: scale(var(--flow-scale))`.
- Runs in **preview** (a `$effect` in `CardPreview` after mount/update) and in
  **print/PDF** (before capture, in `PrintView` / `pdfExport`).
- **MVP = uniform `transform: scale`** (deterministic, single measurement, no
  reflow). Accepts a little right-margin whitespace because scaling shrinks width
  too. **Font-size-only scaling** (no width loss, but needs a few measure
  iterations) is a documented later refinement — YAGNI for MVP.

## Integration points (minimal edits to existing files)

- `lib/card-render.ts` `buildCardHTML`: add `if (isFlowLayout(card.layout))
  return buildFlowCardHTML(...)` as the first statement. Grid branch unchanged.
- `cardMapping.ts` `recordToCard`: add the flow branch (field-role parsing);
  else unchanged.
- `components/CardPreview.svelte` layout `<select>`: wrap current options in
  `<optgroup label="Cards">` and add `<optgroup label="Document">` from
  `FLOW_LAYOUTS`. UI-only change.
- **Print/pack** (`printCards.ts`, `pdfExport.ts`): no logic change — flow
  presets carry `cardsPerPage: 1` so `perPage === 1` makes each view its own
  full sheet (never mis-merged by `mergeLeftoverSheets`). Only add the fit-pass
  hook where the print/PDF DOM is built.

## Schema-library entry — "Country profile"

Ships the end-to-end workflow for authoring many countries:

- **Schema:** `name` (title), `capital`, `language` (`text`); `imageFlag` +
  `contentLandscape`/`imageLandscape`, `contentPlantsAndAnimals`/
  `imagePlantsAndAnimals`, `contentLandmarksAndCulture`/`imageLandmarksAndCulture`,
  `contentFood`/`imageFood`.
- **3 pre-built views:**
  - View 0 `country-cover` — fields: `name` + all image fields.
  - View 1 `country-page` — fields: `name`, `capital`, `language`, `imageFlag`,
    `contentLandscape`, `imageLandscape`, `contentPlantsAndAnimals`,
    `imagePlantsAndAnimals` (ordered content-then-image per section).
  - View 2 `country-page` — fields: `contentLandmarksAndCulture`,
    `imageLandmarksAndCulture`, `contentFood`, `imageFood` (no title/meta → header
    auto-hidden).
- **`settings`:** border width 0, handwriting-ish font family, A4 portrait — so a
  freshly inserted project matches the mock without renderer hardcoding.

Insert via the existing Schema Library → fill records per country → the 3 views
render/print as the 3-page document.

## Testing (TDD — pure logic first)

- `recordToCard` flow branch: correct title / meta / sections / headerImage
  classification, and collage-tile collection (vitest, in `cardMapping.test.ts`).
- `flow-layouts`: `isFlowLayout`, `getFlowLayout`, registry integrity.
- `buildFlowCardHTML`: header present iff title/meta; float side alternates by
  index; section headings + `<ul>` from markdown; collage tile count = image
  count; outline-title style on cover.
- `fitFlowScale` pure part: scale computed from (naturalH, pageInnerH) and
  clamped — testable without DOM; the measurement wiring is verified by hand in
  preview.
- **Regression:** existing grid + print + pack + view tests stay green (proves
  the grid engine is undiluted).

## Scope / YAGNI

- 2 presets (`country-cover`, `country-page`); header auto-hides.
- No drag-drop, no per-image positioning UI, no separate line-art image fields,
  no new export path.
- Reuse: multi-view, print, pack, style cascade, schema library, `marked`,
  auto-fill/crop.
- Auto-fit MVP is uniform scale; font-only scaling deferred.

## Out of scope / follow-ups

- Font-size-only auto-fit (no width loss).
- Additional flow variants beyond the initial 2 presets.
- Per-image manual placement controls.
