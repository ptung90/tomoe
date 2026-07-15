# Tomoe Spec #10 — Cascaded per-schema / per-card styling (design)

Date: 2026-07-15. Module: `src/lib/modules/flashcards/`.
Decision (user): a **3-level style cascade** — Global → per-schema → per-card — overriding
**per property** (not all-or-nothing), edited via a **scope switcher** in StyleControls
(default Global). "Muốn global toàn bộ, nhưng một số phải custom riêng, đôi khi per-card."

## Goal

Let one file hold multiple card types (schemas) that **share global style defaults** yet can
**override any property per schema, or per individual card**. Resolution per property:
`card ?? schema ?? global`.

## Current state (what exists)

- **Global** style = `project.settings` (border, titleFont, contentFont, margin/padding/imgPadding/textVAlign, image, paperSize, orientation).
- **Per-card** font override already exists: `Card.titleFont`/`contentFont`, and `buildCardHTML` already merges `{ ...settings.titleFont, ...(card.titleFont||{}) }`.
- **Per-schema** style layer: **missing**.
- StyleControls currently writes only to `settings` (global) — so editing while viewing one card type restyles ALL types. That's the gap.

## Model

New in `model.ts`:
```ts
export interface StyleOverrides {
  border?: Partial<Settings['border']>;
  image?: Partial<Settings['image']>;
  titleFont?: Partial<FontSpec>;
  contentFont?: Partial<FontSpec>;
  margin?: number; padding?: number; imgPadding?: number;
  textVAlign?: 'top' | 'middle' | 'bottom';
  paperSize?: Settings['paperSize'];
  orientation?: Settings['orientation'];
}
```
- `CardTemplate.style?: StyleOverrides` (per-schema).
- `Card.style?: StyleOverrides` (per-card). Consolidate the existing `Card.titleFont`/`contentFont` into `card.style.titleFont`/`contentFont` (migrate on load).
- `project.settings` unchanged = the global base (full `Settings`).

## Resolver (`lib/style.ts`, pure)

```ts
export function resolveStyle(base: Settings, ...layers: (StyleOverrides | undefined)[]): Settings
```
Deep-merges each non-null layer over `base` in order (schema then card), field-by-field for the
nested objects (`border`/`image`/`titleFont`/`contentFont`) and replace for scalars. Returns a
full `Settings`. The renderer/tiling consume the **resolved** settings, so `buildCardHTML` needs
**no internal change** (it still reads `s.border`, `s.titleFont`, …).

## Wiring (renderer / tiling)

- **CardPreview:** `eff = resolveStyle($project.settings, template.style, card.style)`; pass `eff` where it currently passes `$project.settings` to `buildCardHTML`; use `eff.paperSize`/`eff.orientation` for paper + `sheetLayout`.
- **collectPrintSheets / buildSheetHTML:** resolve the **schema-effective** settings (`resolveStyle(settings, template.style)`) for the sheet's `sheetLayout` + frame; per cell, resolve `card.style` on top (`resolveStyle(schemaEff, card.style)`) and pass to `buildCardHTML`. Attach the schema-effective settings to the `Sheet` so PrintView/pdfExport size the page from it.
- **pdfExport:** page mm from the schema-effective `paperSize`/`orientation`.

(`buildCardHTML` signature and internals unchanged — it just receives a resolved `Settings`.)

## StyleControls (the UI change)

- **Scope switcher** at the top: `Global · This type · This card` (default **Global**).
- Every control:
  - **Displays** the resolved (effective) value for the current schema/card.
  - **Writes** to the current scope:
    - Global → `setSettings(patch)` (as today).
    - This type → `setTemplateStyle(schemaId, patch)` → merges into `template.style`.
    - This card → `setCardStyle(cardId, patch)` → merges into the selected record's `card.style`.
  - **Inherited indicator:** when the prop isn't set at the current scope, mark it (dimmed / a small "inherited" dot); a **reset (×)** clears the override at the current scope so it falls back to the parent level.
- "This card" scope acts on the card of the currently selected record; disabled if none selected. "This type" disabled if no schema.

New store actions: `setTemplateStyle(schemaId, patch)`, `setCardStyle(cardId, patch)`, and `clearStyleOverride(scope, key)` (reset one prop at a level).

## Migration

`parseProject`: `settings` stays global; fold any existing `card.titleFont`/`contentFont` into `card.style` (`{ titleFont, contentFont }`) and drop the top-level fields; `template.style` starts undefined. Existing files render identically (overrides empty ⇒ pure global).

## Testing

- `resolveStyle`: precedence card > schema > global, per-property; nested border/image/font merge field-by-field; scalars replace; undefined layers ignored; base untouched (immutable).
- Store: `setTemplateStyle`/`setCardStyle` merge partially; `clearStyleOverride` removes one prop; global `setSettings` unchanged.
- Render: a schema-level border override changes only that schema's cards, not another schema's; a card-level font override affects only that card.
- Migration: legacy `card.titleFont` folds into `card.style.titleFont`.
- StyleControls: scope switch changes read/write target; editing at "This type" writes `template.style`; reset clears it; global default still works.
- Gates: check 0 · test green · build OK.

## Out of scope

- Style presets/themes, copy-style-between-schemas, a "styles library".
- Per-locale styling.

## Plan shape (→ writing-plans → subagent-driven)

1. **Model + resolver + wire renderer/tiling** — `StyleOverrides`, `resolveStyle` (`lib/style.ts`), `template.style`/`card.style`; CardPreview/collectPrintSheets/buildSheetHTML/pdfExport consume resolved settings. Migration folds legacy card fonts. No UI yet ⇒ behavior identical (overrides empty). Regression-gate.
2. **Store setters** — `setTemplateStyle`/`setCardStyle`/`clearStyleOverride` + tests.
3. **StyleControls scope switcher** — scope state, effective-value display, scope-aware writes, inherited/reset per control.
4. **Whole-branch review + visual pass** (multi-schema styling by scope; per-card override; print/PDF).
