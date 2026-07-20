# Style Presets + Continent Colour — Design

Date: 2026-07-20
Status: Design (awaiting review) → implement A first, then B.

## Problem

A user has styled many cards across a project. Each card can carry its own
`card.style` override, and each view its own `template.style`, so the look drifts
apart and there is no way to push one consistent "look" across everything at once.

Two related-but-separate needs came out of the discussion:

- **A — Style Presets**: save a reusable "style set" (colours/fonts/spacing/image,
  **excluding** border and page/layout) and apply it to *all* cards in the project,
  optionally flattening per-view and per-card overrides so everything follows it.
- **B — Continent colour**: tag a project with which continent it belongs to (or
  none) and auto-set its signature colour — for now the **border colour** — from the
  existing Montessori continent palette. Must stay easy to extend later.

The two are orthogonal by design: **A excludes border; B only touches border colour.**
Applying a style preset never clobbers the continent border colour, and vice-versa.
Both are thin specialisations of the same primitive: *merge a partial `StyleOverrides`
into Global settings* (`cardMapping.applySettings` / `stores.setSettings`).

## Existing building blocks (reuse, don't reinvent)

- **Style cascade**: Global `settings` → per-view `template.style` → per-card
  `card.style`, resolved per-property by `lib/style.ts` `resolveStyle`
  (nested `border`/`image`/fonts merge field-by-field).
- **Merge helpers**: `cardMapping.applySettings(p, patch)` (Global), `mergeStyle`
  (view/card), and the scope-clearing ops `resetScopeStyle` / `clearStyleOverride`.
- **Schema Library** pattern: `io/schemaIO.ts` `SchemaLibraryEntry` + localStorage
  key `tomoe.flashcards.schemaLibrary`, surfaced via `SchemaLibraryModal`. Feature A's
  library mirrors this exactly.
- **Continent palette**: `lib/palette.ts` `CONTINENT_COLORS` (7 continents, en/vi
  labels + hex) and `continentForColor()`; plus the app-level, user-remappable
  `continentColors` store (localStorage `tomoe.continentColors`). Feature B reuses
  all of it.

---

## Feature A — Style Presets

### A.1 What a preset is (pure core — `lib/stylePreset.ts`)

A `StylePreset` is a bundle of style properties **excluding** border, page geometry,
and layout/tiling. Concretely the included keys (`PRESET_KEYS`):

- `titleFont`, `contentFont` (family, size, weight, colour, lineHeight, textAlign)
- `image` (backgroundSize, backgroundPosition, **borderRadius, backgroundColor**)
- `margin`, `padding`, `imgPadding`, `paraGap`, `textVAlign`

**Excluded:** `border` (per requirement), `paperSize`, `orientation`, and anything on
`CardTemplate` (layout/grid/tiling — not a `StyleOverrides` key anyway).

```ts
export type StylePreset = Pick<StyleOverrides,
  'titleFont' | 'contentFont' | 'image' |
  'margin' | 'padding' | 'imgPadding' | 'paraGap' | 'textVAlign'>;

export const PRESET_KEYS: (keyof StylePreset)[] = [...];

/** Capture the preset-relevant slice of a full Settings object. */
export function settingsToPreset(s: Settings): StylePreset;

/** Merge a preset onto settings, returning new Settings (border/page untouched). Pure. */
export function applyPresetToSettings(s: Settings, preset: StylePreset): Settings;

/** Remove every PRESET_KEY from an override; return undefined if nothing remains.
 *  Border/page keys on the override are preserved. Pure. */
export function stripPresetKeys(o: StyleOverrides | undefined): StyleOverrides | undefined;
```

Nested groups (`image`, `titleFont`, `contentFont`) are captured/stripped **whole**
(a preset always defines full groups), scalars replace.

### A.2 Storage — app-level Library (`io/stylePresetIO.ts` + `stores.ts`)

Mirror the Schema Library:

```ts
export interface StylePresetEntry { id: string; name: string; addedAt: number; preset: StylePreset }
```

- localStorage key `tomoe.flashcards.stylePresetLibrary`.
- Store surface (mirrors schema library): `stylePresetLibrary` readable, plus
  `saveStylePreset(name)`, `deleteStylePreset(id)`, `renameStylePreset(id, name)`.
- **Forward-safety**: presets are merged over `settingsToPreset(DEFAULT_SETTINGS)` on
  read so an old-build preset gains newly-added keys (mirrors `mergeSettingsOverDefaults`).
- **Export/import**: `.tomoestyle.json` file `{ tomoeStylePreset: 1, name, preset }`,
  with `serializeStylePreset` / `parseStylePreset` / `looksLikeStylePresetFile`
  (mirror `schemaIO`). *(Import routing through the shell open-router is out of scope
  for v1 — import is a button inside the modal.)*

### A.3 Apply (store action — one undo step)

```ts
export function applyStylePreset(preset: StylePreset,
  opts: { syncViews: boolean; clearCards: boolean }): void
```

Project-wide, in a single `commit`:

1. **Always**: Global settings = `applyPresetToSettings(settings, preset)`.
2. If `syncViews`: for every `schema.cardTemplates[].style`, replace with
   `stripPresetKeys(style)` (drops preset keys → views inherit the new Global; border
   & page keys kept).
3. If `clearCards`: same `stripPresetKeys` over every `card.style`.

Both flags on ⇒ every view and card follows the preset exactly; border + layout +
paper untouched.

### A.4 UI (`components/StylePresetModal.svelte`)

- Entry point: a **"Presets"** button in `StyleControls` (near the scope switcher).
- Modal contents:
  - **Save current as preset** — name it; captures `settingsToPreset($project.settings)`.
  - List of presets, each with **Apply** (opens a small confirm with two checkboxes:
    *Đồng bộ cả View* = `syncViews`, *Xoá override từng thẻ* = `clearCards`; both
    default **on**), **Rename**, **Delete**.
  - **Import** / **Export** buttons (`.tomoestyle.json`).
- Toast on apply summarising what changed (e.g. "Applied 'Warm' · N views · M cards").

---

## Feature B — Project continent → signature border colour

### B.1 Data model (`model.ts`)

Add optional project metadata:

```ts
export interface Project { ...; category?: string }   // a CONTINENT_COLORS key, or undefined = none
```

- `parseProject`: `category: typeof raw.category === 'string' ? raw.category : undefined`.
- `serializeProject`: written through as-is (undefined ⇒ omitted). No migration needed
  (absent = none).

### B.2 Apply (store action — one undo step)

```ts
export function setProjectCategory(key: string | null): void
```

Single `commit`:

- Set `project.category = key ?? undefined`.
- If `key`: also set Global `border.color = get(continentColors)[key]` (the
  user-remappable palette store, which already falls back to `CONTINENT_COLORS` hex).
- If `null` (None): only clear the category; **leave `border.color` as-is** (user
  keeps whatever they set manually).

**Auto-apply**: selecting a continent applies its colour immediately (per decision).

### B.3 Extensibility (explicit)

Today B writes only `border.color`. To keep the future open without a data-model change,
the "what a continent contributes" is isolated in one helper:

```ts
/** The style patch a continent contributes. v1: just the border colour. */
function continentPatch(key: string, colors: Record<string,string>): StyleOverrides {
  return { border: { color: colors[key] } };
}
```

Later a continent could return a richer `StyleOverrides` (accent, fonts, …) and
`setProjectCategory` merges it via `applySettings` — same primitive as Feature A. No
schema/file change required; only this helper grows.

### B.4 UI (`Workspace.svelte` header)

- A **continent dropdown** next to the project-name input. Options: **None** +
  the 7 `CONTINENT_COLORS`, label localised by `$project.activeLocale` (en/vi).
- Bound to `$project.category`; `onchange` → `setProjectCategory(value || null)`.
- Small colour swatch next to each option / the current selection (uses `continentColors`).

---

## Testing (TDD)

**A — pure (`tests/stylePreset.test.ts`)**
- `settingsToPreset` picks exactly `PRESET_KEYS`; never includes border/paper/orientation.
- `applyPresetToSettings` sets preset keys, leaves `border`/`paperSize`/`orientation` untouched; base not mutated.
- `stripPresetKeys` removes preset keys, keeps `border`; returns `undefined` when empty.

**A — store (`tests/stylePreset-store.test.ts` or extend flashcards-stores)**
- `applyStylePreset` writes Global; `syncViews` clears view overrides' preset keys (keeps border); `clearCards` clears card overrides; both off ⇒ only Global changes; one undo reverts all.

**A — library IO** — save/rename/delete round-trip via localStorage; `serialize`/`parse` `.tomoestyle.json` round-trip; `parse` rejects non-marker files.

**B (`tests/continent-category.test.ts` + model round-trip)**
- `setProjectCategory('europe')` sets `category` and Global `border.color` to the europe hex; a remapped `continentColors` wins.
- `setProjectCategory(null)` clears `category` and leaves `border.color` unchanged.
- `parseProject`/`serializeProject` round-trip `category` (and omit when undefined).

**Component tests** (mirror existing StyleControls/SchemaLibrary tests) for the modal apply-options and the header dropdown commit.

## Out of scope (v1)

- Live-linked themes (cards auto-updating when a preset changes) — rejected in favour of
  re-apply.
- Shell open-router handling of `.tomoestyle.json` (import is in-modal only).
- Per-continent rich themes (only border colour today; B.3 leaves the door open).
- Any change to border/page semantics.

## Build order

1. **Feature A** (pure core → library IO → store apply → modal + StyleControls button).
2. **Feature B** (model.category → store `setProjectCategory` → header dropdown).

Each ships green (`npm run check`, `npm test`, `npm run build`) before the next.
