# Tomoe Spec #3 — Flashcards Card Render + Live Preview (design)

Date: 2026-07-14
Status: Approved (brainstorming) → ready for implementation plan
Module: `src/lib/modules/flashcards/`
Depends on: Spec #2 (Records workspace) — merged.

## Goal

Port the flashcard-creator render engine (`buildCardHTML`) into Tomoe as a pure
TypeScript util, and show a **live card preview** of the selected record in a
third workspace pane. The record is turned into a card via an auto-derived
template (choose the layout); paper size/orientation and basic styling (border +
title/content fonts) are editable and drive the preview. Cards are not persisted
here — that is Pack/generate (spec #4).

## Scope

**In scope**
- Render engine `card-render.ts` (pure): `buildCardHTML(card, settings, locale, forPrint?, overridePx?)` → HTML string.
- **7 layouts** ported: `fulltext`, `fullimage`, `2x2`, `1top-1bot`, `1top-2bot`, `2top-1bot`, `3card`.
- Ported `.fc-*` styles for those layouts → `card-render.css` (global).
- `cardMapping.ts` (pure): `deriveAutoTemplate(schema)` + `recordToCard(record, schema, template, settings, locale)`.
- Third workspace pane `CardPreview.svelte`: live, scale-to-fit preview of the selected record; toolbar with layout / paper-size / orientation controls.
- `StyleControls.svelte`: edit `project.settings` border + `titleFont`/`contentFont`.
- Persist one auto-template per schema at `schema.cardTemplates[0]` (layout + size/orientation/toggles only; field→slot mapping is re-derived each render).

**Out of scope (later specs)**
- Detailed slot-mapping template editor (which field → which slot/section by hand).
- Multiple templates per schema (front/back, compound sets).
- Heavy compound layouts: `8img-8txt`, `6cell`, `txtgrid`, `img3-txt3`, `2img-2txt`, `3img-3txt`.
- Interactive drag-to-resize split handles (`buildHandles`).
- Copy-HTML / print / PDF (spec #6). Per-card style overrides + custom CSS editing.
- Persisting actual `Card` objects (spec #4 pack/generate).

## Approach (approved)

Port `buildCardHTML` as a **pure** TS module returning an HTML string, rendered
via Svelte `{@html}`. Remove the flashcard-creator global `state` dependency —
pass `locale` as a parameter. Reuse the `marked` dependency added in spec #2 for
Markdown→HTML.

**CSS handling (chosen: A).** `{@html}` content is NOT styled by a Svelte
component's scoped `<style>` (Svelte hashes scoped selectors). So the `.fc-*`
rules live in a **global** stylesheet `card-render.css`, imported once by
`CardPreview.svelte` (a plain `import './lib/card-render.css'` is global in
Svelte/Vite). The engine still injects a per-card `<style>` tag scoped by
`.fc-card[data-id="…"]` for title/label/font rules and h1/h2/h3, exactly as the
old app does. Rejected: a giant `:global(){}` block (unreadable); injecting the
whole base CSS into every HTML string (duplicated markup, bloated strings).

## Architecture

Everything under `src/lib/modules/flashcards/`.

```
lib/
  card-render.ts     # pure: buildCardHTML + registries (LAYOUTS/SLOTS/SPLIT/PAPER_MM) + helpers
  card-render.css    # ported .fc-* styles (global), imported by CardPreview
  cardMapping.ts     # pure: deriveAutoTemplate(schema), recordToCard(record, schema, template, settings, locale)
components/
  CardPreview.svelte   # right pane: toolbar (layout/paper/orientation) + StyleControls + scaled {@html}
  StyleControls.svelte # collapsible border + title/content font editing → commit(settings)
Workspace.svelte     # MODIFY: add 3rd pane + a second resizer
stores.ts            # MODIFY: setSettings(patch), setTemplateLayout(schemaId, patch)
```

### Units and boundaries

- **`card-render.ts` — pure engine.** No Svelte, no DOM, no globals. Signature
  `buildCardHTML(card: Card, settings: Settings, locale: string, forPrint = false, overridePx?: {w:number;h:number} | null): string`.
  Ports (transcribed from `flashcard-creator/src/js/render.js`, verbatim where
  possible): the default grid path (`getGridTemplateStyle`, `buildSlots`,
  `buildSectionsHtml`, `buildFontOverride`), `fulltext`/`fullimage` branches, and
  `buildCompound` containing **only** `build_3card` (+ its helpers
  `buildCompoundCellStyle`, `resolveImgStyle`, `renderCompoundShell`,
  `buildSectionCellHtml`, `titleBlock`). `buildCompound` returns `null` for any
  other layout. Helpers `getPaperPx`, `mmToPx`, `esc`, `resolveLocale(val,
  locale)` (replaces `getLocaleValue`), `mdInline`/`mdBlock` (via `marked`).
  Registries hold only the 7 layouts + `PAPER_MM` (A4/A5/A6/Letter). `buildHandles`
  is NOT ported.
- **`cardMapping.ts` — pure mapping.**
  - `deriveAutoTemplate(schema): CardTemplate` — `{ id, templateType, layout,
    size, orientation, hideTitle, hideSectionLabels }` with sensible defaults;
    `templateType` = `'compound'` for `3card`, else `'single'`.
  - `recordToCard(record, schema, template, settings, locale): Card` — builds the
    `Card` fed to `buildCardHTML`: first `image` field → image slot(s); first
    text/text-long field → `title`; remaining text fields → `sections`
    (`label` = field.label, `content` = resolved field value). Mapping is
    derived from the CURRENT schema fields each call (never persisted stale).
- **Components** read `$project` + selection stores and call the store wrappers;
  the preview is a `$derived` HTML string fed to `{@html}`.

## Stores & data flow

Extend `stores.ts`:
- `setSettings(patch: Partial<Settings>): void` → `commit(applySettings($project, patch))` (deep-merge border/fonts). `applySettings` is a pure helper (tested).
- `setTemplateLayout(schemaId: string, patch: Partial<CardTemplate>): void` → ensures `schema.cardTemplates[0]` exists (via `deriveAutoTemplate`) then patches layout/size/orientation/toggles; `commit`. Pure update helper `applyTemplatePatch` (tested).

**Preview data flow:**
```
selectedRecordId + $project
  → record + schema + template(schema.cardTemplates[0] ?? deriveAutoTemplate)
  → recordToCard(record, schema, template, $project.settings, $project.activeLocale)
  → buildCardHTML(card, settings, locale)   // pure string
  → {@html} inside a transform:scale(paneW / cardW) wrapper
```
Editing a field (already debounced in RecordDetail), the layout/paper/orientation
controls, and StyleControls all flow through `commit` → `$project` updates →
preview re-derives. `buildCardHTML` is pure string-building, so re-rendering per
edit is cheap.

## CardPreview UI

- Toolbar row: **layout** `<select>` (7 options), **paper** `<select>`
  (A4/A5/A6/Letter), **orientation** toggle (portrait/landscape); a button toggles
  the **StyleControls** panel.
- Body: a scaler `<div style="transform:scale(k);transform-origin:top left">`
  wrapping the `{@html}` card, where `k = min(1, availableWidth / cardWpx)`; the
  card renders at real paper px from `getPaperPx`.
- Empty state when no record is selected.
- `import './lib/card-render.css'` for the `.fc-*` rules.

## StyleControls UI

- Collapsible panel editing `project.settings`:
  - border: width (number), style (`<select>`: solid/dashed/double/…), color (color input), radius (number).
  - titleFont & contentFont: family (`<select>`/text), size (number), weight (`<select>`), color (color input).
- Each change → `setSettings(patch)`. Number/text/color inputs are debounced via
  the existing `keyedDebounce` so a drag/burst collapses into one undo step.

## Workspace change

Add a third pane to `Workspace.svelte`: `list | resizer | detail | resizer |
preview`. Second resizer uses the existing `dragX` action with clamped width.
Header counts unchanged. The preview pane can be collapsed to a minimum width.

## `{@html}` safety

Content is the user's own local project data (desktop app; no third-party input).
Markdown is rendered through `marked`. Per-card `customCss` editing is NOT exposed
in this spec, so no user-authored CSS is injected. This matches the old app's
model and is acceptable for a local single-user editor.

## Error handling

- Missing/empty fields → empty slots / placeholder (engine already handles via
  `forPrint` false → placeholder glyph; sections with empty content render empty).
- Record with no schema, or schema with no fields → preview shows a friendly
  empty/"nothing to preview" state, never throws.
- `recordToCard` tolerates absent image/text fields (no slot / empty section).

## Testing

- `card-render.test.ts` — for each of the 7 layouts, `buildCardHTML` returns HTML
  containing the expected structural markers (`data-layout`, image slots, sections,
  title), resolves the given locale, and sizes the card per paper (assert on the
  returned string — pure, no DOM). Include a `forPrint` variant check.
- `cardMapping.test.ts` — `deriveAutoTemplate` (field→role assignment,
  templateType for 3card) and `recordToCard` (image slot, title, sections,
  multilingual resolution, missing-field tolerance).
- `stores` additions — `setSettings` deep-merges + is undoable; `setTemplateLayout`
  creates then patches the schema template.
- Component test — `CardPreview` renders `{@html}` for a record with a text field
  (no TipTap) and shows the empty state when nothing is selected; `StyleControls`
  edits commit to settings.
- Gates: `npm run check` 0 errors · `npm test` green, 0 unhandled · `npm run build` OK.

## References

- Port source: `flashcard-creator/src/js/render.js` (`buildCardHTML`, the 7 target
  layout builders), `src/js/core/state.js` (LAYOUTS/SLOTS/SPLIT/PAPER_MM),
  `src/js/core/layouts-compound.js` (3card metadata), `src/js/core/utils.js`
  (`getPaperPx`/`mmToPx`/`esc`/`mdParse*`/`renderSectionContent`), `src/css/preview.css`
  (`.fc-*` rules for the 7 layouts). Skip handles, heavy compounds, and the
  interactive editor pieces.
- Tomoe model: `src/lib/modules/flashcards/model.ts` (`Card`, `CardTemplate`,
  `Settings`, `LocalizedText`, `DEFAULT_SETTINGS`).
- Reuse `marked` (added spec #2) and `keyedDebounce` (`src/lib/debounce.ts`).
