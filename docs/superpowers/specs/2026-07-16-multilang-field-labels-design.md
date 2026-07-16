# Tomoe Spec #13 — Multi-language field labels (design)

Date: 2026-07-16. Module: `src/lib/modules/flashcards/`.
Decision (user): a schema field's **label** should be localizable, like its value already is.
Scope is deliberately narrow: **only `SchemaField.label`** becomes multilingual. View names
(`CardTemplate.name`) and schema names (`Schema.name`) stay plain strings.

## Goal

When the active locale changes, a field's label on the card (and in the UI) shows the
locale-appropriate text — e.g. the "Definition" field reads "Definition" in EN and "Nghĩa" in VI —
matching how the field's **value** already localizes.

## Current state (verified in code)

- Field **values** are multilingual: `RecordItem.fields: Record<string, LocalizedText>`;
  `SchemaField.multilingual?: boolean` (default true for text); `RecordField.svelte` renders one
  input row per locale; `activeLocale`/`locales` on `Project`; `setField(recordId, key, value, locale)`.
- Field **labels are NOT**: `SchemaField.label: string`. In `recordToCard`
  (`cardMapping.ts:77-79`), a section is built as `{ label: f.label, content: resolveLocale(record.fields[f.key], locale) }`
  — content localizes, **label is the raw string**.
- Half the plumbing already exists: `CardSection.label` is typed `LocalizedText` and the card
  renderer already does `resolveLocale(sec.label, locale)` — but `recordToCard` feeds it a plain string.
- `resolveLocale(val, locale)` returns `''` for a missing locale (fine for values, wrong for a label).

## Model change

`SchemaField.label: string` → **`LocalizedText`** (`= string | Record<Locale, string>`).
- **Backward-compatible**: a plain string is already a valid `LocalizedText`; `resolveLabel`/`resolveLocale`
  accept both. No migration in `parseProject`; `serializeProject` unchanged (a `{en,vi}` label serializes
  like any localized value; an old string label stays a string).

## New helper (`lib/card-render.ts`, pure)

```ts
export function resolveLabel(label: LocalizedText, locale: string, key: string): string
```
Fallback chain (user decision): the active `locale`'s text → else the first non-empty value across
locales → else the field `key`. For a plain string: `label.trim() || key`. Never returns empty (a
label always renders something meaningful). Distinct from `resolveLocale` precisely by this fallback.

## Wiring

- **`recordToCard`**: section label = `resolveLabel(f.label, locale, f.key)` (was `f.label`). Card
  section labels now localize (+ fallback). Title/images have no field label — unchanged.
- **Readers that display a field label for the active locale** → wrap with
  `resolveLabel(f.label, $project.activeLocale, f.key)`:
  - `RecordField.svelte` — the `.field-label`.
  - `StyleControls.svelte` — the "Fields in this view" checklist item text.
  - `AutofillImagesModal.svelte` — the text/image field `<option>` text.
  - `lib/ai.ts` — the `(label)` description in the schema prompt (resolve to `activeLocale`; the AI
    keys record values by field `key`, so label localization doesn't change generation).
  - (CardGallery captions use the record *value*, not the label — untouched.)

## SchemaEditor + Schema Library fields-editor (the UI change)

- The field **label input** becomes **per-locale** — one input per `project.locales`, mirroring
  `RecordField`'s multilingual value entry (LOC tag + input row). Applies in
  `SchemaEditorModal.svelte` and the fields editor inside `SchemaLibraryModal.svelte`.
- Seeding: an existing string label pre-fills the input(s) (show it under each locale, or the primary
  locale — implementation detail); editing writes a `LocalizedText`. A label typed for a single locale
  may be stored as an object keyed by that locale; both string and object remain valid.
- Empty-label defensiveness on save stays (`SchemaEditorModal` already backfills blank label →
  `key`/`Field N`); now that runs per the resolved label.

## Testing

- `resolveLabel`: active-locale hit; active empty → other-locale fallback; all empty → `key`; plain
  string passthrough; empty string → `key`.
- `recordToCard`: a `{en,vi}` label renders the active locale's text; missing active-locale falls back;
  a legacy string label still renders (back-compat).
- SchemaEditor / library fields editor: per-locale label inputs read a `LocalizedText` and commit one;
  a legacy string label is seeded without loss.
- Readers show the resolved label (StyleControls checklist / AutofillImages option / RecordField).
- Back-compat: a schema whose labels are plain strings renders/edits exactly as before; serialize→parse
  round-trip preserves both string and object labels.
- Gates: `npm run check` 0 · `npm test` green · `npm run build` OK.

## Out of scope

- Localizing view names (`CardTemplate.name`) or schema names (`Schema.name`).
- Per-locale field `key`, type, or multilingual flag; locale management changes.

## Plan shape (→ writing-plans → subagent-driven)

1. **Model + `resolveLabel` + `recordToCard` + readers** — `SchemaField.label: LocalizedText`,
   pure `resolveLabel`, section-label localization, and the display swaps in RecordField /
   StyleControls / AutofillImagesModal / ai.ts. TDD; back-compat regression. No editor UI yet.
2. **SchemaEditorModal per-locale label input** — mirror RecordField's per-locale rows; seed from a
   string label; commit `LocalizedText`. Tests.
3. **Schema Library fields-editor per-locale label input** — same treatment in `SchemaLibraryModal`. Tests.
4. **Whole-branch review.**
