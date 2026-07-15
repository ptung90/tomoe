# Tomoe Spec #11 — Multi-view per schema (design)

Date: 2026-07-15. Module: `src/lib/modules/flashcards/`.
Decision (user): one record set, **multiple card templates ("views")** per schema — e.g.
Image / Label / Content — each with its own layout + **manually-selected fields** + style.
Preview shows **all views side by side** (one active view is editable); print **groups by view**
and **merges leftover partial pages** across same-layout views when exporting.

## Goal

Let a single schema's records be rendered through several independent "views", so the same
record (image, label, content) can produce an image-only card, a label-only card, and a
content-only card — previewed together and printed as separate decks.

## Current state

- `Schema.cardTemplates: CardTemplate[]` exists but **only `[0]` is ever used** (preview, gallery,
  pack, print, style controls all read `cardTemplates[0] ?? deriveAutoTemplate(schema)`).
- `recordToCard(record, schema, template, settings, locale)` builds **one** card from a record +
  a template, auto-including all fields (first text = title, rest = sections, images by slot).
- One `Card` per record (spec #9). Packed cards live in `project.cards`, each with `recordId` +
  `templateId`.
- Style cascade (#10): `global settings → template.style → card.style`, resolved per property.
  StyleControls scope switcher = Global / This type / This card.

## Approach

**A — a "view" *is* a `CardTemplate` in `cardTemplates[]`** (chosen over a separate `views[]` entity
or multi-schema record-sharing). Reuses `recordToCard(…, template, …)` and the #10 cascade
(per-view style = `template.style`). Minimal model surface; multi-view is opt-in by adding
templates, so single-template files are unchanged.

## Model changes (`model.ts`)

Add to `CardTemplate`:
- `name?: string` — an **explicit** view name set by the user (via rename). Usually unset.
- `fields?: string[]` — record field **keys** this view includes, in order. `undefined`/empty ⇒
  include all fields (today's behavior; back-compat).

**View label is derived, not stored by default.** A pure helper
`viewLabel(template, schema): string` returns `template.name` if set; else, if exactly one field
is selected, that field's `label` (e.g. `image` field labelled "Image" → **"Image"**); else if
several are selected, their labels joined (`"Label + Content"`, truncated); else `View {index+1}`.
So a view named purely by its field needs no manual naming; `renameView` sets an explicit `name`
that overrides the derived label. Everything that shows a view name calls `viewLabel`.

`Schema.cardTemplates[]` is now the schema's ordered list of **views**. No migration needed:
files with `cardTemplates.length <= 1` behave exactly as today. `parseProject` leaves extra
templates intact (already maps the whole array through `migrateTemplate`).

## recordToCard — honor field selection

If `template.fields` is a non-empty array, filter `schema.fields` to those keys **in the given
order** before computing title/sections/images; otherwise use all fields (unchanged). The
title/sections/images arrangement logic is otherwise identical. Examples:
- Image view: `fields:['image']`, layout `fullimage` → image slot only.
- Label view: `fields:['label']`, layout `fulltext` → the label as the single text.
- Content view: `fields:['content']`, layout `fulltext` → the content as the single text.

## Store (`stores.ts` + `cardMapping.ts`)

- New: `addView(schemaId)` (no explicit `name`; label derives from its fields via `viewLabel`),
  `renameView(schemaId, templateId, name)` (sets explicit `name`),
  `deleteView(schemaId, templateId)` (**refuses to delete the last view**),
  `setViewFields(schemaId, templateId, keys)`.
- Retarget existing per-template setters from `cardTemplates[0]` to a **`templateId`**:
  `setTemplateLayout`, `setTemplateStyle`, `clearStyleOverride`, `resetScopeStyle`,
  and the `applyTemplatePatch`/`applyTemplateStyle` helpers. Default to the active view.
- New UI-only store `activeViewId: Writable<string | null>` — which view the preview/controls
  edit. Reset/adjusted when the selected record's schema changes; falls back to the schema's
  first view.

## Preview (`CardPreview.svelte`) — all views + one active

- Render **one card per view** of the selected record, side by side (a wrapping row), each
  captioned with the view name. Fit-scale each to a column; existing zoom applies.
- A **view bar** above the cards: chips `[Image] [Label] [Content] [＋]` — click a chip to make
  that view **active** (highlighted), `＋` adds a view, chip context gives rename/delete.
- The layout dropdown, field-selection, and StyleControls all target the **active view**.
- **Sheet mode** shows the **active view's** sheets (not all views at once). Zoom/status bar
  unchanged.

## StyleControls (`StyleControls.svelte`) — "This view"

- Rename the middle scope **"This type" → "This view"**; it writes to the **active view's**
  `template.style` (via the retargeted `setTemplateStyle`/`clearStyleOverride`/`resetScopeStyle`).
  Global + This card unchanged. Cascade is unchanged (global → view.style → card.style).
- Page (cardsPerPage/autoFit/cardSize) and Fields (hideTitle/hideSectionLabels) target the active
  view. Add the **field-selection** control for the active view (checklist of the schema's fields
  → sets `template.fields`).

## Pack / cards (`cardOps.ts`, `CardGallery.svelte`)

- A packed `Card` is identified by **`(recordId, templateId)`**. `packAllForSchema` packs every
  record × every view. `regenerateCard`/`deleteCard`/stale operate per card id (already keyed).
- `isCardStale` compares a card to its source record **through the card's own view** (`templateId`
  → that view's field selection/layout), not always `cardTemplates[0]`.
- Gallery groups by schema and shows cards (now record×view); auto-derived cards fill in per view
  for records not yet packed. Cell-size sizing already fixed (d4e96ee) — reuse per view.

## Print / PDF (`printCards.ts`, `pdfExport.ts`, `PrintView.svelte`)

- `collectPrintSheets`: for each schema, iterate **each view**; map its records → cards (packed
  or derived) through that view; chunk into the view's own N-up sheets. Primary order = **grouped
  by view** (all of view 1's sheets, then view 2's, …). Each `Sheet` keeps its view's resolved
  `settings` (schema-effective for that template).
- **Leftover merge (export only):** after each view's full sheets, collect every view's **trailing
  partial sheet** (the final chunk that doesn't fill a page). Partial pages that share the **same
  sheet layout** — identical `paperSize`, `orientation`, and cell grid (cols×rows, cell px) — are
  re-tiled together into combined pages appended at the end. A view whose layout is unique keeps
  its own partial page. Full sheets are never reshuffled. On-screen preview may stay simple
  (per-view); the merge is applied by `collectPrintSheets` so both Print and PDF benefit.
  - Determinism: merge order follows view order; a pure helper `mergeLeftoverSheets(sheets)`
    groups trailing partials by a layout key and re-chunks.

## Testing

- `recordToCard`: field-selection subset + order; image-only; text-only; empty/undefined ⇒ all.
- `viewLabel`: derives from a single field's label, joins several, honors explicit `name`,
  falls back to `View {n}`.
- Store: `addView` appends a view; `renameView` sets explicit name; `deleteView` refuses the last;
  `setViewFields`; per-template setters hit the addressed `templateId` (not `[0]`).
- Pack: `packAllForSchema` yields one card per (record × view); stale is per view.
- `collectPrintSheets`: grouped by view; leftover partials of same-layout views merge into fewer
  pages; different-layout partials do **not** merge; full sheets unchanged.
- StyleControls: "This view" writes the active view's `template.style`, not settings, not another
  view.
- Migration/back-compat: a single-template file previews/prints exactly as before (one view).
- Gates: `npm run check` 0 · `npm test` green · `npm run build` OK.

## Out of scope

- Views spanning multiple schemas; a shared "view library"/presets across schemas.
- Per-view locale; drag-to-arrange field→slot mapping (field selection is a checklist + layout).
- Reordering views by drag (add/delete/rename only; order = insertion order).

## Plan shape (→ writing-plans → subagent-driven)

1. **Model + recordToCard field-selection** — `name`/`fields` on `CardTemplate`; `recordToCard`
   honors `fields`; back-compat. TDD, no UI. Regression-gate.
2. **Store view actions + retarget setters to templateId** — add/rename/delete(last-guard)/
   setViewFields; `applyTemplatePatch`/`applyTemplateStyle`/clear/reset by templateId;
   `activeViewId`. Tests.
3. **Pack + gallery per (record × view)** — `packAllForSchema` all views; per-view stale;
   gallery renders record×view. Tests.
4. **Preview all-views + view bar + active view** — side-by-side cards, view bar
   (add/rename/delete/select), active-view targeting; Sheet mode = active view.
5. **StyleControls "This view" + field-selection control** — scope rename + retarget;
   field checklist writes `template.fields`; Page/Fields target active view. Tests.
6. **Print/PDF grouped-by-view + leftover merge** — `collectPrintSheets` per view;
   `mergeLeftoverSheets` pure helper; PrintView/pdfExport consume. Tests.
7. **Whole-branch review + visual pass.**
