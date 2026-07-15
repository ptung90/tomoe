# Cascaded per-schema / per-card styling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 3-level style cascade — Global (`settings`) → per-schema (`template.style`) → per-card (`card.style`) — resolved per property (`card ?? schema ?? global`), edited via a scope switcher in StyleControls.

**Architecture:** A pure `resolveStyle(base, ...layers)` merges partial overrides over the global `Settings`; render/tiling consume the resolved `Settings` so `buildCardHTML` internals are unchanged. StyleControls gains a Global/type/card scope switcher writing to the matching level.

**Tech Stack:** Svelte 5, TS, vitest. No new deps.

## Global Constraints

- Everything under `src/lib/modules/flashcards/`. Module isolation. Card interior = fixed print colors; chrome = Calm Paper tokens; lucide subpath imports.
- `project.settings` stays the GLOBAL base (full `Settings`). Overrides are **partial** (`StyleOverrides`) on `template.style` (per-schema) and `card.style` (per-card).
- Resolution order: global → schema → card (later wins), **per property** (nested border/image/fonts merge field-by-field). `resolveStyle` is pure + immutable (never mutates `base`).
- `buildCardHTML` signature unchanged — callers pass the RESOLVED `Settings`.
- Migration: existing files render identically (overrides empty); legacy `card.titleFont`/`contentFont` fold into `card.style`.
- Gates per task: `npm run check` 0 errors · `npm test` green, 0 unhandled (re-run once on EBUSY) · `npm run build` OK. Merge only on green.
- NOTE: unrelated code-signing files (`.gitignore`, `package.json`, `src-tauri/SIGNING.md`, `src-tauri/signing/`, `src-tauri/tauri.signing.conf.json.example`) are uncommitted in the tree — never stage/commit them; `git add` only files you change.

---

## Task 1: StyleOverrides model + resolveStyle + wire renderer/tiling + migration

**Files:** `model.ts` (types + migration), Create `lib/style.ts` (`resolveStyle`), `lib/card-render.ts` (drop per-card font merge), `cardMapping.ts` (recordToCard unchanged; verify), `lib/printCards.ts` + `components/CardPreview.svelte` + `components/PrintView.svelte` + `lib/pdfExport.ts` (pass resolved settings); Tests `tests/style.test.ts` (new), `tests/flashcards-model.test.ts` (migration), `tests/card-render.test.ts` (regression).

**Interfaces produced:** `StyleOverrides`, `CardTemplate.style?`, `Card.style?`, `resolveStyle(base, ...layers): Settings`.

- [ ] **Step 1: model.ts types.** Add:
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
Add `style?: StyleOverrides;` to `CardTemplate` and to `Card`. Keep `Card.titleFont?`/`contentFont?` declared (legacy, read only by migration — comment as such).

- [ ] **Step 2: `lib/style.ts` (pure).** Create:
```ts
import type { Settings, StyleOverrides } from '../model';
/** Merge partial style layers over a full Settings base (later layers win), per property.
 *  Nested border/image/titleFont/contentFont merge field-by-field; scalars replace. Pure; base untouched. */
export function resolveStyle(base: Settings, ...layers: (StyleOverrides | undefined)[]): Settings {
  let out: Settings = {
    ...base,
    border: { ...base.border }, image: { ...base.image },
    titleFont: { ...base.titleFont }, contentFont: { ...base.contentFont },
  };
  for (const l of layers) {
    if (!l) continue;
    out = {
      ...out,
      ...(l.margin !== undefined ? { margin: l.margin } : {}),
      ...(l.padding !== undefined ? { padding: l.padding } : {}),
      ...(l.imgPadding !== undefined ? { imgPadding: l.imgPadding } : {}),
      ...(l.textVAlign !== undefined ? { textVAlign: l.textVAlign } : {}),
      ...(l.paperSize !== undefined ? { paperSize: l.paperSize } : {}),
      ...(l.orientation !== undefined ? { orientation: l.orientation } : {}),
      border: { ...out.border, ...(l.border ?? {}) },
      image: { ...out.image, ...(l.image ?? {}) },
      titleFont: { ...out.titleFont, ...(l.titleFont ?? {}) },
      contentFont: { ...out.contentFont, ...(l.contentFont ?? {}) },
    };
  }
  return out;
}
```

- [ ] **Step 3: card-render.ts — drop the per-card font merge.** `buildCardHTML` currently does `const titleF = { ...s.titleFont, ...(card.titleFont || {}) }` (and contentF). Since callers now pass a RESOLVED `Settings` that already includes `card.style.titleFont`, change to `const titleF = { ...s.titleFont }` / `const contentF = { ...s.contentFont }` (drop the `card.titleFont`/`contentFont` spread). Leave `card.labelSize`/`contentSize`/`customCss`/`cssClass`/`hideTitle`/`hideSectionLabels` handling unchanged (still per-card, not part of StyleOverrides).

- [ ] **Step 4: Wire resolved settings at the call sites.**
  - **CardPreview.svelte:** `const eff = $derived(template ? resolveStyle($project.settings, template.style, record ? cardFor(record)?.style : undefined) : $project.settings)`. Use `eff` everywhere it passed `$project.settings` to `buildCardHTML`, and `eff.paperSize`/`eff.orientation` for paper/orient/`sheetLayout`. (For the single card, resolve the selected record's `card.style`; for sheet mode, resolve per cell — see below.)
  - **lib/printCards.ts `collectPrintSheets`:** per schema, `const schemaEff = resolveStyle(project.settings, template.style)`; use `schemaEff` for `sheetLayout(template, schemaEff.paperSize, orient)` where `orient = schemaEff.orientation`. Add `settings: schemaEff` to the `Sheet` so PrintView/pdfExport use it.
  - **lib/card-render.ts `buildSheetHTML(cards, lay, settings, locale, forPrint?, overridePx?)`:** for each cell, pass `resolveStyle(settings, cards[i].style)` (card-level) to `buildCardHTML`. (`settings` here is the schema-effective one passed in.)
  - **PrintView.svelte:** `buildSheetHTML(sheet.cards, sheet.lay, sheet.settings, …)`.
  - **pdfExport.ts:** page mm from `sheet.settings.paperSize` + `sheet.lay.orient`; `buildSheetHTML(sheet.cards, sheet.lay, sheet.settings, …)`.

- [ ] **Step 5: Migration (`model.ts` parseProject).** After building cards, fold legacy per-card fonts into `card.style`:
```ts
cards.map((c) => {
  const legacy = (c.titleFont || c.contentFont)
    ? { ...(c.style ?? {}), ...(c.titleFont ? { titleFont: c.titleFont } : {}), ...(c.contentFont ? { contentFont: c.contentFont } : {}) }
    : c.style;
  const { titleFont, contentFont, ...rest } = c;
  return legacy ? { ...rest, style: legacy } : rest;
})
```
(Apply within the existing card-filtering/normalizing map. Templates: no change needed — `style` defaults undefined.)

- [ ] **Step 6: Tests.**
  - `tests/style.test.ts` (new): `resolveStyle(base)` returns a full Settings equal-by-value to base (base untouched); a schema layer `{ border: { width: 8 } }` overrides only width, keeps color; a card layer over schema wins; `{ titleFont: { size: 20 } }` merges, keeps family; scalar `margin`/`paperSize`/`orientation` replace; undefined layers ignored; `expect(base.border.width).not.toBe(8)` (immutability).
  - `flashcards-model.test.ts`: a legacy card with `titleFont` → after parse, `card.style.titleFont` set and top-level `titleFont` gone.
  - `card-render.test.ts`: regression — existing render tests still pass (buildCardHTML with plain settings unchanged output).

- [ ] **Step 7: GREEN + gates.** Commit: `feat(flashcards): StyleOverrides + resolveStyle cascade; renderer/tiling use resolved settings (behavior unchanged)`.

---

## Task 2: Store setters for schema/card style

**Files:** `stores.ts`; `cardMapping.ts` (a `applyTemplateStyle` helper) or inline; Tests `tests/flashcards-stores.test.ts` (or a focused file).

**Interfaces produced:** `setTemplateStyle(schemaId, patch: StyleOverrides)`, `setCardStyle(cardId, patch: StyleOverrides)`, `clearStyleOverride(scope, keyPath)`.

- [ ] **Step 1: Failing tests.** `setTemplateStyle(sid, { border: { width: 6 } })` → `schema.cardTemplates[0].style.border.width === 6`, merges (not replaces) with existing `style`; `setCardStyle(cid, { titleFont: { size: 22 } })` → `card.style.titleFont.size === 22`; `clearStyleOverride('schema', sid, 'border')` (or a key) removes that override so it inherits. Use the existing store + a seeded schema/record/card.

- [ ] **Step 2: Implement in `stores.ts`.**
```ts
export function setTemplateStyle(schemaId: string, patch: import('./model').StyleOverrides): void {
  commit(cardMapping.applyTemplateStyle(get(project), schemaId, patch));
}
export function setCardStyle(cardId: string, patch: import('./model').StyleOverrides): void {
  commit({ ...get(project), cards: get(project).cards.map((c) => c.id === cardId
    ? { ...c, style: mergeStyle(c.style, patch) } : c) });
}
```
Add `cardMapping.applyTemplateStyle(p, schemaId, patch)` (mirror `applyTemplatePatch`, but merges into `template.style` via a `mergeStyle` deep-merge of two `StyleOverrides`). Add a small `mergeStyle(base?, patch)` (deep-merge border/image/fonts field-by-field, scalars replace) in `lib/style.ts` (exported, reused by both setters). `clearStyleOverride(scope, id, key)` deletes `style[key]` at the level (and if `style` becomes empty, set it undefined).

- [ ] **Step 3: GREEN + gates.** Commit: `feat(flashcards): setTemplateStyle / setCardStyle / clearStyleOverride`.

---

## Task 3: StyleControls scope switcher (Global / This type / This card)

**Files:** `components/StyleControls.svelte`; Tests `tests/StyleControls.test.ts`.

- [ ] **Step 1: Scope state + effective read.** Add `let scope = $state<'global' | 'schema' | 'card'>('global');`. Derive the active `template` (from selected record's schema) and `card` (the selected record's card, packed-or-derived). Derive `eff = resolveStyle($project.settings, template?.style, card?.style)` — controls DISPLAY `eff` values. Also derive the current-scope override object (`scope==='global' ? settings : scope==='schema' ? template?.style : card?.style`) to compute the "inherited vs set here" indicator per prop.

- [ ] **Step 2: Scope switcher UI.** A segmented control at the top of the panel: `Global · This type · This card`. "This type" disabled if no schema; "This card" disabled if no selected record/card. Default Global.

- [ ] **Step 3: Scope-aware writes.** A single `write(patch: StyleOverrides | Partial<Settings>)` helper: `scope==='global'` → `setSettings(patch)`; `'schema'` → `setTemplateStyle(schema.id, patch)`; `'card'` → `setCardStyle(card.id, patch)`. Repoint every existing control's `onchange`/`oninput` from `setSettings(...)` to `write(...)` (same patch shape — `setSettings` and the override setters accept the same partial shapes for border/image/fonts/scalars). Controls read from `eff` (e.g. `value={eff.border.width}`, `value={eff.titleFont.family}`).

- [ ] **Step 4: Inherited indicator + reset.** For each control (or each group), when the prop is NOT present in the current scope's override object, show a dimmed/"inherited" style; render a small reset (×) that calls `clearStyleOverride(scope, id, key)` to drop the current-scope override. (Global scope has nothing to reset — hide it there.) Keep it lightweight: a per-group "inherited" dot + a group-level reset is acceptable if per-control is too noisy.

- [ ] **Step 5: Keep Card→Page/Fields + Text/Image tabs working.** The Page (cardsPerPage/autoFit/cardSize) and Fields (hideTitle/hideSectionLabels) controls stay `setTemplateLayout` (they're template-structural, not `StyleOverrides`) — unaffected by scope. Layout dropdown stays in CardPreview.

- [ ] **Step 6: Tests.** Scope switch changes write target: at "This type", editing border width writes `template.style.border.width` (not `settings`); at Global, writes `settings`; controls display the resolved value; reset at schema scope clears the override (falls back to global). Reuse the tab-scoped `within(...)` query pattern; seed a schema + selected record.

- [ ] **Step 7: GREEN + gates.** Commit: `feat(flashcards): StyleControls scope switcher (global/schema/card) with inherited + reset`.

---

## Task 4: Whole-branch review + visual pass

- [ ] **Step 1:** Whole-branch review (most-capable model) — focus: cascade correctness (per-prop precedence; no accidental global mutation), migration (legacy fonts + no data loss), render/tiling parity (schema override affects only that schema; card override only that card), scope UI read/write correctness, no regression to the single-schema/global path.
- [ ] **Step 2:** Dispatch ONE fix wave for Critical/Important findings.
- [ ] **Step 3: Manual (human):** two schemas with different per-type styles; a per-card override; verify preview + print/PDF reflect the cascade; reset behavior.

## Self-review notes (author)
- Coverage: resolveStyle + migration + regression (T1), store setters (T2), scope UI (T3), whole-branch (T4).
- `buildCardHTML` internals untouched — only the effective `Settings` it receives changes; per-card font merge moves into the cascade.
- Out of scope: presets/themes, copy-style, per-locale styling.
- Testing gap (human): the scope UI's visual "inherited/reset" affordance + multi-schema look across print/PDF.
