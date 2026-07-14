# Tomoe Spec #4a — Flashcards Cards Gallery + Layout Chunking (design)

Date: 2026-07-14
Status: Approved (brainstorming) → ready for implementation plan
Module: `src/lib/modules/flashcards/`
Depends on: Spec #3 (Card render + preview) — merged.

This is the first slice of roadmap spec #4 ("Pack/generate + escape-hatch card
edit + apply card→record"), which was decomposed:
- **#4a (this spec)** — Cards gallery + auto-synced cards, chunked by layout so
  `3card` shows 3 records per page.
- #4b (later) — manual pack (choose records, persist `project.cards`, mixed
  schemas, sync status, consolidation).
- #4c (later) — escape-hatch card edit + apply card→record.

## Goal

Add a **Cards view** that shows every record rendered as its card, and make the
`3card` layout mean what it should: **3 records per page**. Cards are a live
projection of records (auto-synced, derived on the fly) — no persistence, no
generate button, no draft/synced status yet (those arrive with divergence in
#4b/#4c). Unify the gallery and the live preview around one idea: a **page is a
chunk of records**, sized by the layout (single layouts = 1 record/page,
`3card` = 3 records/page).

## Scope

**In scope**
- Pure helpers in `cardMapping.ts`: `cardsPerPage(layout)`, `chunkRecords(records, size)`, `recordsToCard(records[], schema, template, settings, locale)` (generalizes `recordToCard` to N records; compound `3card` maps each record to one cell).
- `CardPreview.svelte` rework: preview the **chunk containing the selected record** (single ⇒ unchanged 1-record behavior; `3card` ⇒ the 3-record page).
- `Workspace.svelte`: a **Records ⇄ Cards** view toggle in the header (local view state).
- `CardGallery.svelte`: responsive thumbnail grid, grouped by schema, one thumbnail per **chunk**; click a thumbnail → select the chunk's first record and switch to Records view. Empty states via the existing `EmptyState`.

**Out of scope (later)**
- Persisting `project.cards` (cards stay derived/auto-synced this spec).
- Manual pack (choosing which records to combine), mixing schemas, consolidation, sync/draft status — #4b.
- Escape-hatch card editing + apply card→record — #4c.
- A per-slot mapping editor (compound mapping is auto-derived).
- Compound layouts other than `3card` (still out, per spec #3).

## Compound auto-mapping (3card)

`3card` packs up to 3 records into one card; each record fills one column cell:
- `image` = the record's first `image` field value (omitted if none).
- cell `label` = the record's first text/`text-long` field value.
- cell `content` = the record's second text/`text-long` field value if present, else `''`.
- Pad to 3 cells (empty `{label:'', content:''}`) when a chunk has fewer than 3 records (last page).

Single layouts keep the existing `recordToCard` mapping (first text → title,
remaining text → sections, image fields → slots). `recordToCard` becomes the
1-record case of `recordsToCard`.

## Architecture

Everything under `src/lib/modules/flashcards/`.

```
cardMapping.ts            # MODIFY: add cardsPerPage, chunkRecords, recordsToCard (recordToCard delegates)
components/
  CardPreview.svelte      # MODIFY: preview the chunk containing the selected record
  CardGallery.svelte      # NEW: thumbnail grid of chunk-cards, grouped by schema
Workspace.svelte          # MODIFY: Records ⇄ Cards view toggle
```

### Pure logic (`cardMapping.ts`)

- `cardsPerPage(layout: string): number` — `LAYOUT_SLOTS[layout]` for compound layouts (`3card` → 3), else `1`. (Only `3card` is compound in scope; use a small `COMPOUND_LAYOUTS = new Set(['3card'])` guard so single layouts always return 1 regardless of their slot count.)
- `chunkRecords<T>(items: T[], size: number): T[][]` — split into consecutive chunks of `size` (size ≥ 1; a size ≤ 1 yields 1-item chunks).
- `recordsToCard(records: RecordItem[], schema: Schema, template: CardTemplate, settings: Settings, locale: string): Card`:
  - Single layout → behave exactly as today's `recordToCard(records[0], …)`.
  - `3card` → build `sections` (one per record: label=first text field, content=second text field) and `images` (one per record with an image field, `slot`=cell index), padded to 3. Card `layout`, `orientation`, `hideTitle`, `hideSectionLabels` from the template as today.
  - Empty `records` (shouldn't happen in the gallery) → an empty card that renders without throwing.
- Keep `recordToCard(record, …)` as a thin wrapper: `recordsToCard([record], …)` — existing callers/tests stay valid.

### `CardPreview.svelte` (rework)

- Derive the selected record's schema records list, chunk it by `cardsPerPage(template.layout)`, find the chunk containing the selected record, and render `buildCardHTML(recordsToCard(chunk, …), …)`. For single layouts the chunk is `[record]` — identical to current output. Toolbar (layout/paper/orientation), StyleControls, scaler, and canvas styling are unchanged.

### `Workspace.svelte` (view toggle)

- Add `let view = $state<'records' | 'cards'>('records')`. Header gets a two-button segmented toggle (Records | Cards) styled with Calm Paper tokens (active = accent). `{#if view === 'records'}` renders the existing 3-pane body; `{:else}` renders `<CardGallery onOpen={(recordId) => { selectRecord(recordId); view = 'records'; }} />` filling the body. `SchemaEditorModal` stays mounted in both.

### `CardGallery.svelte` (new)

- Props: `onOpen: (recordId: string) => void`.
- For each schema (in `$project.schemas` order): a section header (schema name + count); chunk that schema's records by `cardsPerPage(template.layout)` (template = `schema.cardTemplates[0] ?? deriveAutoTemplate(schema)`); render a responsive grid (auto-fill, ~190px) of thumbnails, one per chunk.
- Each thumbnail: a fixed-size frame containing `{@html buildCardHTML(recordsToCard(chunk, schema, template, $project.settings, $project.activeLocale))}` scaled to fit (same scale technique as CardPreview: outer frame sized to scaled dims, inner scaler at real px). Caption below = the chunk's first-record label (reuse the `rowLabel` idea: first non-image field, active locale, else `(untitled)`); for multi-record chunks append `+N` or a page index.
- Each thumbnail is a `<button>` → `onOpen(chunk[0].id)`; hover/focus states, keyboard accessible.
- Empty states via `EmptyState`: no schemas → prompt to create a schema; schemas but no records → prompt to add a record.
- `import '../lib/card-render.css'`.

## Data flow

Cards are **derived**, never stored: gallery and preview both read `$project`
and build cards on the fly, so any record/layout/style edit updates thumbnails
and preview reactively. `project.cards` is untouched this spec.

```
$project (records + schemas + settings + activeLocale)
  → per schema: template = cardTemplates[0] ?? deriveAutoTemplate
  → chunkRecords(schemaRecords, cardsPerPage(template.layout))
  → per chunk: recordsToCard(chunk, …) → buildCardHTML(…) → {@html} thumbnail
```

## Error handling / edge cases

- Schema with no records → no thumbnails for that schema (or a per-schema empty hint); overall empty state when there are zero records across all schemas.
- Last chunk shorter than the page size → padded cells render empty (engine already tolerates empty sections/slots).
- Record with missing fields → empty cells, never throws (as in spec #3).
- Selected record whose schema has zero records can't occur; if `selectedRecordId` isn't found, preview shows its empty state (unchanged).

## Testing

- `cardMapping.test.ts` (extend): `cardsPerPage` (3card→3, singles→1); `chunkRecords` (even, remainder, size 1); `recordsToCard` single (unchanged vs `recordToCard`), `3card` (3 records → 3 labelled cells + images, locale resolved), padding for a 2-record chunk, and `recordToCard` still delegates.
- `CardGallery.test.ts`: renders one thumbnail per chunk (e.g. 4 records + 3card → 2 thumbnails; 4 records + a single layout → 4 thumbnails), thumbnails contain `.fc-card`, clicking a thumbnail calls `onOpen` with the chunk's first record id.
- `CardPreview.test.ts` (extend): for a `3card` schema with ≥3 records, the preview shows the chunk (contains the other records' content, not just the selected one).
- `flashcards-workspace.test.ts` (extend): toggling to Cards view renders gallery thumbnails; toggling back shows the form.
- Gates: `npm run check` 0 errors · `npm test` green, 0 unhandled · `npm run build` OK.

## References

- Spec #3 engine/mapping: `lib/card-render.ts` (`buildCardHTML`, `LAYOUT_SLOTS`), `cardMapping.ts` (`recordToCard`, `deriveAutoTemplate`), `lib/card-render.css`.
- Old app compound mapping shape (labelSlot/textSlot/imageSlot per record): `flashcard-creator/src/js/records/pack.js` (`packRecords`) — auto-derived here, no manual mapping UI.
- Reuse `EmptyState.svelte`, `rowLabel` pattern from `SchemaRecordList.svelte`.
