# Multi-language Field Labels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a schema field's **label** localizable (like its value already is), so the
active locale's text shows on rendered cards and in the flashcards UI — e.g. a "Definition"
field reads "Nghĩa" in VI — while a plain-string label stays fully valid and unmigrated.

**Architecture:** `SchemaField.label` changes type from `string` to the existing
`LocalizedText` union (`string | Record<Locale, string>`). A new pure helper `resolveLabel`
(in `lib/card-render.ts`, next to the existing `resolveLocale`) resolves a label to display
text with a label-specific fallback chain (active locale → any non-empty locale → the field
`key`) — it never returns an empty string. Every place that currently reads `SchemaField.label`
directly is rewired through `resolveLabel`. Two more pure helpers, `labelLocaleValue` and
`setLabelLocale`, support a per-locale label *editor* UI (mirroring how `RecordField` already
edits a multilingual field *value*) in `SchemaEditorModal.svelte` and `SchemaLibraryModal.svelte`.

**Tech Stack:** Svelte 5 (runes) + TypeScript, vitest + @testing-library/svelte, no new
dependencies.

## Global Constraints

- Svelte 5 runes only (no `$:`).
- lucide subpath imports only (`lucide-svelte/icons/x`, never the barrel) — N/A for this
  feature (no new icons), but any touched file must keep its existing subpath imports as-is.
- Style with Calm Paper tokens (`var(--accent)`, `var(--text-muted)`, `var(--border)`, …) — no
  hardcoded hex — for any new CSS.
- Pure logic is immutable and built TDD (failing test → implementation → passing test).
- **Backward-compatible**: a plain-string label stays valid. No `parseProject` migration is
  added; `serializeProject` is unchanged (an object label serializes like any other localized
  value; a string label stays a string).
- Gates: `npm run check` must be 0 errors (see Task 1 note on the two *expected*, temporary
  errors it does not yet fix); `npm test` must be green (a transient Windows `EBUSY` on the
  vitest cache is a known flake — re-run once before treating it as a real failure); `npm run
  build` must succeed.
- Commit only the files each task actually changes. NEVER stage `.gitignore`, `package.json`,
  `src-tauri/SIGNING.md`, `src-tauri/signing/`, or `src-tauri/tauri.signing.conf.json.example`.

---

## Task 1: Model + `resolveLabel`/editor helpers + `recordToCard`/`viewLabel` + readers

This task lands the whole non-editor half of the feature: the type change, the pure helpers,
the two production call sites that build a label for display (`recordToCard`, `viewLabel`),
and every UI "reader" that currently prints `field.label` directly. It does **not** build the
full per-locale label *editor* UI in `SchemaEditorModal.svelte` / `SchemaLibraryModal.svelte`
(that's Tasks 2–3) — but it DOES apply a minimal compile-safe stopgap to the single label
`<input>` in each of those two files (a one-line edit that reads/writes the primary locale via
`labelLocaleValue`/`setLabelLocale`), so this task ends with `npm run check` at 0 errors. Every
task ends green — the per-task SDD reviewer requires it.

**Files:**
- Modify: `src/lib/modules/flashcards/model.ts:17` (`SchemaField.label` type)
- Modify: `src/lib/modules/flashcards/lib/card-render.ts` (add `resolveLabel`,
  `labelLocaleValue`, `setLabelLocale` next to `resolveLocale`)
- Modify: `src/lib/modules/flashcards/cardMapping.ts` (`recordToCard`, `viewLabel`)
- Modify: `src/lib/modules/flashcards/components/CardGallery.svelte:61` (`viewLabel` call)
- Modify: `src/lib/modules/flashcards/components/CardPreview.svelte:102` (`viewLabel` call)
- Modify: `src/lib/modules/flashcards/components/StyleControls.svelte` (`viewLabel` call +
  field checklist)
- Modify: `src/lib/modules/flashcards/components/SchemaLibraryModal.svelte:203` (`viewLabel`
  call) + `:183` (minimal compile-safe label-input stopgap — full per-locale UI is Task 3)
- Modify: `src/lib/modules/flashcards/components/SchemaEditorModal.svelte:46,89` (minimal
  compile-safe label backfill + label-input stopgap — full per-locale UI is Task 2)
- Modify: `src/lib/modules/flashcards/components/RecordField.svelte` (field label display)
- Modify: `src/lib/modules/flashcards/components/RecordDetail.svelte` (pass `activeLocale`)
- Modify: `src/lib/modules/flashcards/components/AutofillImagesModal.svelte` (option labels)
- Modify: `src/lib/modules/flashcards/lib/ai.ts` (prompt field-label description)
- Test: `tests/card-render.test.ts`
- Test: `tests/cardMapping.test.ts`
- Test: `tests/RecordField.test.ts`
- Test: `tests/StyleControls.test.ts`
- Test: `tests/AutofillImagesModal.test.ts`
- Test: `tests/ai.test.ts`
- Test: `tests/flashcards-model.test.ts`

**Interfaces:**
- Produces (used by Tasks 2–3):
  - `resolveLabel(label: LocalizedText, locale: string, key: string): string` — exported from
    `src/lib/modules/flashcards/lib/card-render.ts`.
  - `labelLocaleValue(label: LocalizedText, locale: string, firstLocale: string): string` —
    exported from the same file.
  - `setLabelLocale(label: LocalizedText, locale: string, text: string, firstLocale: string):
    LocalizedText` — exported from the same file.
  - `SchemaField.label: LocalizedText` (was `string`) — exported from
    `src/lib/modules/flashcards/model.ts`.
  - `viewLabel(template: CardTemplate, schema: Schema, index: number, locale: string): string`
    (added a required 4th `locale` param) — exported from
    `src/lib/modules/flashcards/cardMapping.ts`.
  - `RecordField.svelte` gains an optional prop `activeLocale?: string` (default `'en'`).

### Step 1: Write the failing test for `resolveLabel`

Add to `tests/card-render.test.ts` — change the import line and add a new `describe` block
right after the existing `describe('card-render helpers', ...)` block (before `function
card(...)`):

Before (`tests/card-render.test.ts:1-4`):
```ts
import { describe, it, expect } from 'vitest';
import { getPaperPx, mmToPx, esc, resolveLocale } from '../src/lib/modules/flashcards/lib/card-render';
import { buildCardHTML, sheetGrid, sheetLayout, buildSheetHTML } from '../src/lib/modules/flashcards/lib/card-render';
import { LAYOUT_SLOTS } from '../src/lib/modules/flashcards/lib/layouts';
```

After:
```ts
import { describe, it, expect } from 'vitest';
import { getPaperPx, mmToPx, esc, resolveLocale, resolveLabel, labelLocaleValue, setLabelLocale } from '../src/lib/modules/flashcards/lib/card-render';
import { buildCardHTML, sheetGrid, sheetLayout, buildSheetHTML } from '../src/lib/modules/flashcards/lib/card-render';
import { LAYOUT_SLOTS } from '../src/lib/modules/flashcards/lib/layouts';
```

Insert this new block right before `function card(partial: Partial<Card>): Card {` (currently
line 31):
```ts
describe('resolveLabel', () => {
  it('returns the active locale\'s text when present', () => {
    expect(resolveLabel({ en: 'Definition', vi: 'Nghĩa' }, 'vi', 'def')).toBe('Nghĩa');
  });
  it('falls back to another non-empty locale when the active one is blank', () => {
    expect(resolveLabel({ en: 'Definition', vi: '' }, 'vi', 'def')).toBe('Definition');
  });
  it('falls back to the field key when every locale is blank', () => {
    expect(resolveLabel({ en: '', vi: '  ' }, 'vi', 'def')).toBe('def');
  });
  it('passes a plain string label through unchanged (trimmed)', () => {
    expect(resolveLabel('  Definition  ', 'vi', 'def')).toBe('Definition');
  });
  it('falls back to the key for an empty or whitespace-only string label', () => {
    expect(resolveLabel('', 'en', 'def')).toBe('def');
    expect(resolveLabel('   ', 'en', 'def')).toBe('def');
  });
});

describe('labelLocaleValue / setLabelLocale', () => {
  it('labelLocaleValue reads the requested locale slot of an object label', () => {
    expect(labelLocaleValue({ en: 'Definition', vi: 'Nghĩa' }, 'vi', 'en')).toBe('Nghĩa');
    expect(labelLocaleValue({ en: 'Definition' }, 'vi', 'en')).toBe('');
  });
  it('labelLocaleValue shows a legacy string label only under the first locale', () => {
    expect(labelLocaleValue('Definition', 'en', 'en')).toBe('Definition');
    expect(labelLocaleValue('Definition', 'vi', 'en')).toBe('');
  });
  it('setLabelLocale writes into an object label, preserving the other locales', () => {
    expect(setLabelLocale({ en: 'Definition', vi: '' }, 'vi', 'Nghĩa', 'en')).toEqual({ en: 'Definition', vi: 'Nghĩa' });
  });
  it('setLabelLocale converts a legacy string label to an object, keeping it under the first locale', () => {
    expect(setLabelLocale('Definition', 'vi', 'Nghĩa', 'en')).toEqual({ en: 'Definition', vi: 'Nghĩa' });
  });
  it('setLabelLocale converts a blank label to an object with only the new locale set', () => {
    expect(setLabelLocale('', 'en', 'Definition', 'en')).toEqual({ en: 'Definition' });
  });
});
```

### Step 2: Run the tests, verify they fail

Run: `npm test -- card-render.test.ts`
Expected: FAIL — `resolveLabel`, `labelLocaleValue`, `setLabelLocale` are not exported from
`card-render.ts` (TypeScript/import error surfaced as a test failure).

### Step 3: Implement the three helpers

In `src/lib/modules/flashcards/lib/card-render.ts`, add right after the existing
`resolveLocale` function (currently lines 27-31):

Before:
```ts
export function resolveLocale(val: LocalizedText | undefined | null, locale: string): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'object') return val[locale] ?? '';
  return val;
}

export function mdInline(text: string): string { return marked.parseInline(text || '', { async: false }) as string; }
```

After:
```ts
export function resolveLocale(val: LocalizedText | undefined | null, locale: string): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'object') return val[locale] ?? '';
  return val;
}

/** Resolve a field label to display text. Unlike `resolveLocale` (used for field *values*,
 *  which may legitimately be blank), a label always renders something meaningful: the active
 *  `locale`'s text → else the first non-empty value across locales → else the field `key`.
 *  Never returns an empty string. Pure. */
export function resolveLabel(label: LocalizedText, locale: string, key: string): string {
  if (typeof label === 'object') {
    const cur = (label[locale] ?? '').trim();
    if (cur) return cur;
    for (const v of Object.values(label)) {
      const t = (v ?? '').trim();
      if (t) return t;
    }
    return key;
  }
  const s = (label ?? '').trim();
  return s || key;
}

/** Read the per-locale editor value for a label input: an object label reads its `locale`
 *  slot directly (blank if unset); a legacy string label is shown ONLY under `firstLocale` (so
 *  it appears once, not duplicated under every locale) and blank everywhere else. Pure —
 *  companion to `setLabelLocale` for the label editor UI (SchemaEditorModal / SchemaLibraryModal). */
export function labelLocaleValue(label: LocalizedText, locale: string, firstLocale: string): string {
  if (typeof label === 'object') return label[locale] ?? '';
  return locale === firstLocale ? label : '';
}

/** Write one locale's text into a label, normalizing to an object. A legacy string label is
 *  first carried into `{ [firstLocale]: label }` (so editing any OTHER locale never loses it);
 *  a blank label starts from `{}`. Pure — companion to `labelLocaleValue`. */
export function setLabelLocale(label: LocalizedText, locale: string, text: string, firstLocale: string): LocalizedText {
  const base: Record<string, string> = typeof label === 'object' ? { ...label } : (label ? { [firstLocale]: label } : {});
  base[locale] = text;
  return base;
}

export function mdInline(text: string): string { return marked.parseInline(text || '', { async: false }) as string; }
```

### Step 4: Run the tests, verify they pass

Run: `npm test -- card-render.test.ts`
Expected: PASS (all `resolveLabel` / `labelLocaleValue` / `setLabelLocale` cases green).

### Step 5: Change `SchemaField.label` to `LocalizedText`

In `src/lib/modules/flashcards/model.ts`:

Before (line 17):
```ts
export interface SchemaField { id: string; key: string; label: string; type: 'text'|'text-long'|'image'; multilingual?: boolean }
```

After:
```ts
export interface SchemaField { id: string; key: string; label: LocalizedText; type: 'text'|'text-long'|'image'; multilingual?: boolean }
```

### Step 6: Run `npm run check`, confirm the expected error set (interim — later steps of THIS task fix all of them)

Run: `npm run check`
Expected: FAIL, with errors in exactly these locations. Every one is fixed by a later step of
**this task** (Step 7 fixes `cardMapping.ts`; Step 20a/20b apply the editor stopgaps) — so
Task 1 still ends at 0 errors:
- `src/lib/modules/flashcards/cardMapping.ts` — `viewLabel` returns `f.label` (now
  `LocalizedText`) where the signature promises `string`. (Fixed in Step 7.)
- `src/lib/modules/flashcards/components/SchemaEditorModal.svelte:46` — `f.label.trim()`,
  `.trim()` does not exist on `Record<string,string>`. (Stopgap in Step 20a.)
- `src/lib/modules/flashcards/components/SchemaEditorModal.svelte:89` — `bind:value={f.label}`
  type mismatch. (Stopgap in Step 20a.)
- `src/lib/modules/flashcards/components/SchemaLibraryModal.svelte:183` —
  `bind:value={f.label}` type mismatch. (Stopgap in Step 20b.)

This step is a checkpoint, not a fix — continue to Step 7.

### Step 7: Fix `recordToCard` and `viewLabel` in `cardMapping.ts`

Before (`src/lib/modules/flashcards/cardMapping.ts:1-4`):
```ts
import { uid, type Project, type Schema, type CardTemplate, type RecordItem, type Card, type CardSection, type CardImage, type Settings, type StyleOverrides, type SchemaField } from './model';
import { resolveLocale } from './lib/card-render';
import { LAYOUT_SLOTS } from './lib/layouts';
import { mergeStyle } from './lib/style';
```

After:
```ts
import { uid, type Project, type Schema, type CardTemplate, type RecordItem, type Card, type CardSection, type CardImage, type Settings, type StyleOverrides, type SchemaField } from './model';
import { resolveLocale, resolveLabel } from './lib/card-render';
import { LAYOUT_SLOTS } from './lib/layouts';
import { mergeStyle } from './lib/style';
```

Before (`recordToCard`, currently lines 77-79):
```ts
  const sections: CardSection[] = sectionFields.map((f) => (
    { id: uid('sec'), label: f.label, content: resolveLocale(record.fields[f.key], locale) }
  ));
```

After:
```ts
  const sections: CardSection[] = sectionFields.map((f) => (
    { id: uid('sec'), label: resolveLabel(f.label, locale, f.key), content: resolveLocale(record.fields[f.key], locale) }
  ));
```

Before (`viewLabel`, currently lines 95-111):
```ts
const MAX_VIEW_LABEL = 24;
/** The display name for a view (a CardTemplate): the explicit `name` if set; else the label of
 *  its one selected field; else its selected fields' labels joined (truncated); else "View {n}"
 *  (1-based `index` — the caller passes the template's position in `schema.cardTemplates`). Pure. */
export function viewLabel(template: CardTemplate, schema: Schema, index: number): string {
  if (template.name) return template.name;
  const keys = template.fields ?? [];
  if (keys.length === 1) {
    const f = schema.fields.find((x) => x.key === keys[0]);
    if (f) return f.label;
  } else if (keys.length > 1) {
    const labels = keys.map((k) => schema.fields.find((x) => x.key === k)?.label ?? k);
    const joined = labels.join(' + ');
    return joined.length > MAX_VIEW_LABEL ? joined.slice(0, MAX_VIEW_LABEL - 1) + '…' : joined;
  }
  return `View ${index + 1}`;
}
```

After:
```ts
const MAX_VIEW_LABEL = 24;
/** The display name for a view (a CardTemplate): the explicit `name` if set; else the label of
 *  its one selected field; else its selected fields' labels joined (truncated); else "View {n}"
 *  (1-based `index` — the caller passes the template's position in `schema.cardTemplates`).
 *  Field labels are resolved to `locale` via `resolveLabel`; `CardTemplate.name` itself stays a
 *  plain string (view names are out of scope for multi-language labels). Pure. */
export function viewLabel(template: CardTemplate, schema: Schema, index: number, locale: string): string {
  if (template.name) return template.name;
  const keys = template.fields ?? [];
  if (keys.length === 1) {
    const f = schema.fields.find((x) => x.key === keys[0]);
    if (f) return resolveLabel(f.label, locale, f.key);
  } else if (keys.length > 1) {
    const labels = keys.map((k) => {
      const f = schema.fields.find((x) => x.key === k);
      return f ? resolveLabel(f.label, locale, f.key) : k;
    });
    const joined = labels.join(' + ');
    return joined.length > MAX_VIEW_LABEL ? joined.slice(0, MAX_VIEW_LABEL - 1) + '…' : joined;
  }
  return `View ${index + 1}`;
}
```

### Step 8: Update `cardMapping.test.ts` — pass `locale` to every existing `viewLabel` call, add new cases

Before (`tests/cardMapping.test.ts:263-292`):
```ts
describe('viewLabel', () => {
  const sch = schema();
  it('uses the explicit name when set', () => {
    const t = { ...deriveAutoTemplate(sch), name: 'Cover' };
    expect(viewLabel(t, sch, 0)).toBe('Cover');
  });
  it('derives from a single selected field\'s label', () => {
    const t = { ...deriveAutoTemplate(sch), fields: ['pic'] };
    expect(viewLabel(t, sch, 0)).toBe('Pic');
  });
  it('joins several selected fields\' labels with " + "', () => {
    const t = { ...deriveAutoTemplate(sch), fields: ['title', 'def'] };
    expect(viewLabel(t, sch, 0)).toBe('Title + Definition');
  });
  it('truncates a long joined label to <=24 chars with a trailing ellipsis', () => {
    const longSchema: Schema = { id: 's2', name: 'Long', cardTemplates: [], fields: [
      { id: 'f1', key: 'a', label: 'A Very Long Field Label', type: 'text' },
      { id: 'f2', key: 'b', label: 'Another Long Field Label', type: 'text' },
    ] };
    const t = { ...deriveAutoTemplate(longSchema), fields: ['a', 'b'] };
    const label = viewLabel(t, longSchema, 0);
    expect(label.length).toBeLessThanOrEqual(24);
    expect(label.endsWith('…')).toBe(true);
  });
  it('falls back to "View {n}" (1-based) when no fields are selected and no name is set', () => {
    const t = deriveAutoTemplate(sch); // no fields, no name
    expect(viewLabel(t, sch, 0)).toBe('View 1');
    expect(viewLabel(t, sch, 2)).toBe('View 3');
  });
});
```

After:
```ts
describe('viewLabel', () => {
  const sch = schema();
  it('uses the explicit name when set', () => {
    const t = { ...deriveAutoTemplate(sch), name: 'Cover' };
    expect(viewLabel(t, sch, 0, 'en')).toBe('Cover');
  });
  it('derives from a single selected field\'s label', () => {
    const t = { ...deriveAutoTemplate(sch), fields: ['pic'] };
    expect(viewLabel(t, sch, 0, 'en')).toBe('Pic');
  });
  it('joins several selected fields\' labels with " + "', () => {
    const t = { ...deriveAutoTemplate(sch), fields: ['title', 'def'] };
    expect(viewLabel(t, sch, 0, 'en')).toBe('Title + Definition');
  });
  it('truncates a long joined label to <=24 chars with a trailing ellipsis', () => {
    const longSchema: Schema = { id: 's2', name: 'Long', cardTemplates: [], fields: [
      { id: 'f1', key: 'a', label: 'A Very Long Field Label', type: 'text' },
      { id: 'f2', key: 'b', label: 'Another Long Field Label', type: 'text' },
    ] };
    const t = { ...deriveAutoTemplate(longSchema), fields: ['a', 'b'] };
    const label = viewLabel(t, longSchema, 0, 'en');
    expect(label.length).toBeLessThanOrEqual(24);
    expect(label.endsWith('…')).toBe(true);
  });
  it('falls back to "View {n}" (1-based) when no fields are selected and no name is set', () => {
    const t = deriveAutoTemplate(sch); // no fields, no name
    expect(viewLabel(t, sch, 0, 'en')).toBe('View 1');
    expect(viewLabel(t, sch, 2, 'en')).toBe('View 3');
  });
  it('resolves a single selected field\'s {en,vi} label to the requested locale', () => {
    const mlSchema: Schema = { id: 's3', name: 'ML', cardTemplates: [], fields: [
      { id: 'f1', key: 'def', label: { en: 'Definition', vi: 'Nghĩa' }, type: 'text' },
    ] };
    const t = { ...deriveAutoTemplate(mlSchema), fields: ['def'] };
    expect(viewLabel(t, mlSchema, 0, 'vi')).toBe('Nghĩa');
    expect(viewLabel(t, mlSchema, 0, 'en')).toBe('Definition');
  });
  it('falls back to another locale when the requested one is blank, in a joined label', () => {
    const mlSchema: Schema = { id: 's4', name: 'ML2', cardTemplates: [], fields: [
      { id: 'f1', key: 'a', label: { en: 'Word', vi: '' }, type: 'text' },
      { id: 'f2', key: 'b', label: 'Note', type: 'text' },
    ] };
    const t = { ...deriveAutoTemplate(mlSchema), fields: ['a', 'b'] };
    expect(viewLabel(t, mlSchema, 0, 'vi')).toBe('Word + Note');
  });
});
```

Also add two cases to the existing `describe('recordToCard', ...)` block (after its last `it`,
currently ending at line 70, right before `describe('applySettings / applyTemplatePatch', ...)`):
```ts
  it('resolves an {en,vi} field label to the active locale in a section label', () => {
    const s = schema();
    s.fields = s.fields.map((f) => (f.key === 'def' ? { ...f, label: { en: 'Definition', vi: 'Nghĩa' } } : f));
    const c = recordToCard(rec, s, deriveAutoTemplate(s), DEFAULT_SETTINGS, 'vi');
    expect(c.sections[0].label).toBe('Nghĩa');
  });
  it('falls back to another locale when the active one\'s label is blank', () => {
    const s = schema();
    s.fields = s.fields.map((f) => (f.key === 'def' ? { ...f, label: { en: 'Definition', vi: '' } } : f));
    const c = recordToCard(rec, s, deriveAutoTemplate(s), DEFAULT_SETTINGS, 'vi');
    expect(c.sections[0].label).toBe('Definition');
  });
```

### Step 9: Update the 4 production call sites of `viewLabel` to pass a locale

Before (`src/lib/modules/flashcards/components/CardGallery.svelte:61`):
```ts
      return { template, viewName: viewLabel(template, schema, i), packed, autoRecs, cell, scale };
```
After:
```ts
      return { template, viewName: viewLabel(template, schema, i, $project.activeLocale), packed, autoRecs, cell, scale };
```

Before (`src/lib/modules/flashcards/components/CardPreview.svelte:102`):
```ts
      return { id: v.id, label: viewLabel(v, schema, i), html, cellPx: vCellPx };
```
After:
```ts
      return { id: v.id, label: viewLabel(v, schema, i, $project.activeLocale), html, cellPx: vCellPx };
```

Before (`src/lib/modules/flashcards/components/StyleControls.svelte:51`):
```ts
  const activeViewName = $derived(schema && template ? viewLabel(template, schema, Math.max(0, views.findIndex((v) => v.id === template!.id))) : '');
```
After:
```ts
  const activeViewName = $derived(schema && template ? viewLabel(template, schema, Math.max(0, views.findIndex((v) => v.id === template!.id)), $project.activeLocale) : '');
```

Before (`src/lib/modules/flashcards/components/SchemaLibraryModal.svelte:203`):
```svelte
                        <span class="view-name">{viewLabel(t, asSchema(expandedEntry), i)}</span>
```
After:
```svelte
                        <span class="view-name">{viewLabel(t, asSchema(expandedEntry), i, $project.activeLocale)}</span>
```

### Step 10: Run the cardMapping tests, verify they pass

Run: `npm test -- cardMapping.test.ts`
Expected: PASS.

### Step 11: Wire `RecordField.svelte` through `resolveLabel`

Before (`src/lib/modules/flashcards/components/RecordField.svelte:1-21`):
```svelte
<script lang="ts">
  import type { SchemaField, LocalizedText } from '../model';
  import RichText from './RichText.svelte';
  import ImageField from './ImageField.svelte';

  let { field, value, locales, onChange }: {
    field: SchemaField;
    value: LocalizedText;
    locales: string[];
    onChange: (val: string, locale?: string) => void;
  } = $props();

  const multilingual = $derived(field.type !== 'image' && field.multilingual !== false);
  function loc(l: string): string {
    return value && typeof value === 'object' ? (value[l] ?? '') : (typeof value === 'string' ? value : '');
  }
  function str(): string { return typeof value === 'string' ? value : ''; }
</script>

<div class="field">
  <span class="field-label">{field.label}</span>
```

After:
```svelte
<script lang="ts">
  import type { SchemaField, LocalizedText } from '../model';
  import { resolveLabel } from '../lib/card-render';
  import RichText from './RichText.svelte';
  import ImageField from './ImageField.svelte';

  let { field, value, locales, activeLocale = 'en', onChange }: {
    field: SchemaField;
    value: LocalizedText;
    locales: string[];
    activeLocale?: string;
    onChange: (val: string, locale?: string) => void;
  } = $props();

  const multilingual = $derived(field.type !== 'image' && field.multilingual !== false);
  function loc(l: string): string {
    return value && typeof value === 'object' ? (value[l] ?? '') : (typeof value === 'string' ? value : '');
  }
  function str(): string { return typeof value === 'string' ? value : ''; }
</script>

<div class="field">
  <span class="field-label">{resolveLabel(field.label, activeLocale, field.key)}</span>
```

Then pass the project's active locale from the caller. Before
(`src/lib/modules/flashcards/components/RecordDetail.svelte:87-91`):
```svelte
          <RecordField
            field={f}
            value={record.fields[f.key] ?? ''}
            locales={$project.locales}
            onChange={(val, locale) => onFieldChange(f.key, val, locale)} />
```
After:
```svelte
          <RecordField
            field={f}
            value={record.fields[f.key] ?? ''}
            locales={$project.locales}
            activeLocale={$project.activeLocale}
            onChange={(val, locale) => onFieldChange(f.key, val, locale)} />
```

### Step 12: Add a `RecordField.test.ts` case for the resolved label, run it

Add to `tests/RecordField.test.ts`, inside the existing `describe('RecordField', ...)` block
(after its last `it`):
```ts
  it('resolves an {en,vi} field label to the active locale', () => {
    const field: SchemaField = { id: 'f1', key: 'def', label: { en: 'Definition', vi: 'Nghĩa' }, type: 'text', multilingual: true };
    render(RecordField, { field, value: { en: 'a bird', vi: 'con chim' }, locales: ['en', 'vi'], activeLocale: 'vi', onChange: vi.fn() });
    expect(screen.getByText('Nghĩa')).toBeInTheDocument();
  });
```

Run: `npm test -- RecordField.test.ts`
Expected: PASS (all 5 cases, including the 4 pre-existing ones — a plain-string `label` like
`'Title'`/`'Code'`/`'Pic'` in the existing tests resolves to itself regardless of locale).

### Step 13: Wire the StyleControls field checklist through `resolveLabel`

Before (`src/lib/modules/flashcards/components/StyleControls.svelte:29-30`):
```ts
  import { deriveAutoTemplate, viewLabel } from '../cardMapping';
  import { sheetLayout, sheetGrid } from '../lib/card-render';
```
After:
```ts
  import { deriveAutoTemplate, viewLabel } from '../cardMapping';
  import { sheetLayout, sheetGrid, resolveLabel } from '../lib/card-render';
```

Before (`src/lib/modules/flashcards/components/StyleControls.svelte:266-272`):
```svelte
            {#each schema.fields as f (f.key)}
              <label class="tool">
                <input type="checkbox" aria-label={f.label}
                  checked={(template?.fields?.length ?? 0) === 0 ? true : template!.fields!.includes(f.key)}
                  onchange={() => onToggleField(f.key)} /> {f.label}
              </label>
            {/each}
```
After:
```svelte
            {#each schema.fields as f (f.key)}
              <label class="tool">
                <input type="checkbox" aria-label={resolveLabel(f.label, $project.activeLocale, f.key)}
                  checked={(template?.fields?.length ?? 0) === 0 ? true : template!.fields!.includes(f.key)}
                  onchange={() => onToggleField(f.key)} /> {resolveLabel(f.label, $project.activeLocale, f.key)}
              </label>
            {/each}
```

### Step 14: Add a `StyleControls.test.ts` case, run it

Add to `tests/StyleControls.test.ts`, inside `describe('StyleControls — Fields checklist (per
view)', ...)` (after its last `it`):
```ts
  it('resolves a multilingual field label in the checklist to the active locale', async () => {
    const sid = S.addSchema('Words');
    S.updateSchema(sid, { fields: [
      { id: 'f1', key: 'def', label: { en: 'Definition', vi: 'Nghĩa' }, type: 'text', multilingual: true },
    ] });
    S.addRecord(sid);
    S.setActiveLocale('vi');
    render(StyleControls);
    await tab('Fields');
    expect(screen.getByLabelText('Nghĩa')).toBeInTheDocument();
  });
```

Run: `npm test -- StyleControls.test.ts`
Expected: PASS (all cases, including the pre-existing ones using plain-string labels like
`'Word'`/`'Def'`).

### Step 15: Wire `AutofillImagesModal.svelte` through `resolveLabel`

Before (`src/lib/modules/flashcards/components/AutofillImagesModal.svelte:1-8`):
```svelte
<script lang="ts">
  import X from 'lucide-svelte/icons/x';
  import WandSparkles from 'lucide-svelte/icons/wand-sparkles';
  import { autofill } from '../lib/imageAutofill';
  import { searchWikimedia } from '../lib/imageSearch';
  import { project, applyImageAutofill } from '../stores';
  import { showToast } from '../../../shell';
  import type { Schema, RecordItem } from '../model';
```
After:
```svelte
<script lang="ts">
  import X from 'lucide-svelte/icons/x';
  import WandSparkles from 'lucide-svelte/icons/wand-sparkles';
  import { autofill } from '../lib/imageAutofill';
  import { searchWikimedia } from '../lib/imageSearch';
  import { resolveLabel } from '../lib/card-render';
  import { project, applyImageAutofill } from '../stores';
  import { showToast } from '../../../shell';
  import type { Schema, RecordItem } from '../model';
```

Before (`src/lib/modules/flashcards/components/AutofillImagesModal.svelte:56-69`):
```svelte
      <label class="row">
        <span>Query field</span>
        <select aria-label="query field" bind:value={queryKey} disabled={running}>
          {#each textFields as f (f.id)}<option value={f.key}>{f.label}</option>{/each}
        </select>
      </label>
      {#if imageFields.length > 1}
        <label class="row">
          <span>Target image field</span>
          <select aria-label="target image field" bind:value={imageKey} disabled={running}>
            {#each imageFields as f (f.id)}<option value={f.key}>{f.label}</option>{/each}
          </select>
        </label>
      {/if}
```
After:
```svelte
      <label class="row">
        <span>Query field</span>
        <select aria-label="query field" bind:value={queryKey} disabled={running}>
          {#each textFields as f (f.id)}<option value={f.key}>{resolveLabel(f.label, $project.activeLocale, f.key)}</option>{/each}
        </select>
      </label>
      {#if imageFields.length > 1}
        <label class="row">
          <span>Target image field</span>
          <select aria-label="target image field" bind:value={imageKey} disabled={running}>
            {#each imageFields as f (f.id)}<option value={f.key}>{resolveLabel(f.label, $project.activeLocale, f.key)}</option>{/each}
          </select>
        </label>
      {/if}
```

### Step 16: Add an `AutofillImagesModal.test.ts` case, run it

Add to `tests/AutofillImagesModal.test.ts`, inside `describe('AutofillImagesModal', ...)`
(after its last `it`):
```ts
  it('resolves a multilingual field label in the query-field dropdown to the active locale', () => {
    const project = newProject();
    project.activeLocale = 'vi';
    const schema: Schema = { id: 's2', name: 'ML', cardTemplates: [], fields: [
      { id: 'f1', key: 'title', label: { en: 'Title', vi: 'Tiêu đề' }, type: 'text', multilingual: true },
      { id: 'f2', key: 'pic', label: 'Pic', type: 'image' },
    ] };
    project.schemas.push(schema);
    stores.loadProject(project, null);
    render(AutofillImagesModal, { records: [], schema, onClose: vi.fn(), search: vi.fn(async () => []) });
    const opts = Array.from(screen.getByLabelText(/query field/i).querySelectorAll('option')).map((o) => o.textContent);
    expect(opts).toContain('Tiêu đề');
  });
```

Run: `npm test -- AutofillImagesModal.test.ts`
Expected: PASS (all cases, including the pre-existing ones using plain-string labels).

### Step 17: Wire `lib/ai.ts` through `resolveLabel`

Before (`src/lib/modules/flashcards/lib/ai.ts:1-23`):
```ts
import Anthropic from '@anthropic-ai/sdk';
import { type Schema, type RecordItem, type LocalizedText } from '../model';

export const DEFAULT_AI_MODEL = 'claude-opus-4-8';
export interface AiConfig { apiKey: string; model: string }

/** Build the system + user prompt for generating `count` records for `schema`. Pure. */
export function buildRecordsPrompt(
  schema: Schema, instruction: string, count: number, locales: string[],
): { system: string; user: string } {
  const fieldLines = schema.fields.map((f) => {
    if (f.type === 'image') return `- "${f.key}" (${f.label}): image — value is a string URL (use "" if none).`;
    if (f.multilingual === false) return `- "${f.key}" (${f.label}): text — value is a plain string.`;
    return `- "${f.key}" (${f.label}): text — value is an object mapping locale → string, locales: ${locales.join(', ')}.`;
  }).join('\n');
  const system =
    `You generate flashcard records as strict JSON.\n` +
    `The schema "${schema.name}" has these fields (use the KEY as the JSON property):\n${fieldLines}\n\n` +
    `Respond with ONLY a JSON array of objects — no markdown, no prose, no code fence. ` +
    `Each object has exactly the field keys above. Do not invent extra keys.`;
  const user = `${instruction}\n\nGenerate ${count} record(s) as a JSON array.`;
  return { system, user };
}
```

After:
```ts
import Anthropic from '@anthropic-ai/sdk';
import { type Schema, type RecordItem, type LocalizedText } from '../model';
import { resolveLabel } from './card-render';

export const DEFAULT_AI_MODEL = 'claude-opus-4-8';
export interface AiConfig { apiKey: string; model: string }

/** Build the system + user prompt for generating `count` records for `schema`. The field
 *  description resolves each field's (possibly multilingual) label to the FIRST of `locales`
 *  (a stand-in "canonical" locale here — this prompt only has the enabled-locales list, not a
 *  single active one) via `resolveLabel`; the AI still keys record values by field `key`, so
 *  which locale's label text it sees does not change generation. Pure. */
export function buildRecordsPrompt(
  schema: Schema, instruction: string, count: number, locales: string[],
): { system: string; user: string } {
  const canonicalLocale = locales[0] ?? '';
  const fieldLines = schema.fields.map((f) => {
    const label = resolveLabel(f.label, canonicalLocale, f.key);
    if (f.type === 'image') return `- "${f.key}" (${label}): image — value is a string URL (use "" if none).`;
    if (f.multilingual === false) return `- "${f.key}" (${label}): text — value is a plain string.`;
    return `- "${f.key}" (${label}): text — value is an object mapping locale → string, locales: ${locales.join(', ')}.`;
  }).join('\n');
  const system =
    `You generate flashcard records as strict JSON.\n` +
    `The schema "${schema.name}" has these fields (use the KEY as the JSON property):\n${fieldLines}\n\n` +
    `Respond with ONLY a JSON array of objects — no markdown, no prose, no code fence. ` +
    `Each object has exactly the field keys above. Do not invent extra keys.`;
  const user = `${instruction}\n\nGenerate ${count} record(s) as a JSON array.`;
  return { system, user };
}
```

### Step 18: Add `ai.test.ts` cases, run them

Add to `tests/ai.test.ts`, inside `describe('buildRecordsPrompt', ...)` (after its existing
`it`):
```ts
  it('resolves a multilingual field label to the first locale for the prompt', () => {
    const s: Schema = { id: 's1', name: 'Verbs', cardTemplates: [], fields: [
      { id: 'f1', key: 'word', label: { en: 'Word', vi: 'Từ' }, type: 'text', multilingual: true },
    ] };
    const { system } = buildRecordsPrompt(s, 'x', 1, ['en', 'vi']);
    expect(system).toContain('(Word)');
  });
  it('falls back to the key when every locale of a multilingual label is blank', () => {
    const s: Schema = { id: 's1', name: 'Verbs', cardTemplates: [], fields: [
      { id: 'f1', key: 'word', label: { en: '', vi: '' }, type: 'text', multilingual: true },
    ] };
    const { system } = buildRecordsPrompt(s, 'x', 1, ['en', 'vi']);
    expect(system).toContain('(word)');
  });
```

Run: `npm test -- ai.test.ts`
Expected: PASS (all cases, including the pre-existing ones using plain-string labels).

### Step 19: Add a round-trip test for a multilingual schema field label

Add to `tests/flashcards-model.test.ts`, inside `describe('flashcards model', ...)` (after the
existing `'serialize -> parse round-trips'` test):
```ts
  it('serialize -> parse round-trips a schema with multilingual and legacy string field labels', () => {
    const p = newProject();
    p.schemas.push({
      id: 's1', name: 'Words', cardTemplates: [],
      fields: [
        { id: 'f1', key: 'def', label: { en: 'Definition', vi: 'Nghĩa' }, type: 'text', multilingual: true },
        { id: 'f2', key: 'note', label: 'Note', type: 'text', multilingual: false },
      ],
    });
    expect(parseProject(serializeProject(p))).toEqual(p);
  });
```

Run: `npm test -- flashcards-model.test.ts`
Expected: PASS.

### Step 20a: Apply the minimal compile-safe label stopgap in `SchemaEditorModal.svelte`

This is NOT the full per-locale UI (that's Task 2) — it's a single input, editing the primary
locale only, that compiles cleanly against `LocalizedText`. Task 2 replaces it wholesale.

First add the helper import. Before (`src/lib/modules/flashcards/components/SchemaEditorModal.svelte:6-7`):
```svelte
  import { project, schemaEditorOpen, addSchema, updateSchema, deleteSchema } from '../stores';
  import { uid, type SchemaField } from '../model';
```
After:
```svelte
  import { project, schemaEditorOpen, addSchema, updateSchema, deleteSchema } from '../stores';
  import { labelLocaleValue, setLabelLocale, resolveLabel } from '../lib/card-render';
  import { uid, type SchemaField } from '../model';
```

Fix the save-time blank-label backfill (it currently calls `.trim()` on a `LocalizedText`).
Before (`src/lib/modules/flashcards/components/SchemaEditorModal.svelte:41-47`):
```ts
  function close() { schemaEditorOpen.set(null); }
  function save() {
    // Fill blank keys/labels defensively so records can address fields.
    const clean = fields.map((f, i) => ({
      ...f,
      key: f.key.trim() || `field${i + 1}`,
      label: f.label.trim() || f.key.trim() || `Field ${i + 1}`,
    }));
```
After:
```ts
  function close() { schemaEditorOpen.set(null); }
  function save() {
    // Fill blank keys/labels defensively so records can address fields. `resolveLabel` collapses
    // a LocalizedText (or string) to display text, falling back to the key — so a blank label
    // backfills to the (possibly just-defaulted) key, exactly as before the type change.
    const clean = fields.map((f, i) => {
      const key = f.key.trim() || `field${i + 1}`;
      const resolved = resolveLabel(f.label, $project.locales[0], key).trim();
      return { ...f, key, label: resolved || `Field ${i + 1}`, type: f.type, multilingual: f.multilingual };
    });
```

Replace the single label input. Before (`src/lib/modules/flashcards/components/SchemaEditorModal.svelte:89-90`):
```svelte
            <input aria-label="field label" placeholder="label" bind:value={f.label}
              oninput={(e) => patchField(i, { label: (e.target as HTMLInputElement).value })} />
```
After:
```svelte
            <input aria-label="field label" placeholder="label"
              value={labelLocaleValue(f.label, $project.locales[0], $project.locales[0])}
              oninput={(e) => patchField(i, { label: setLabelLocale(f.label, $project.locales[0], (e.target as HTMLInputElement).value, $project.locales[0]) })} />
```

### Step 20b: Apply the minimal compile-safe label stopgap in `SchemaLibraryModal.svelte`

Same one-line-input stopgap; Task 3 replaces it with the full per-locale UI.

First add the helper import. Before (`src/lib/modules/flashcards/components/SchemaLibraryModal.svelte:18-20`):
```svelte
  import { serializeSchemaExport, type SchemaLibraryEntry } from '../io/schemaIO';
  import { viewLabel } from '../cardMapping';
  import { uid, type SchemaField, type Schema } from '../model';
```
After:
```svelte
  import { serializeSchemaExport, type SchemaLibraryEntry } from '../io/schemaIO';
  import { viewLabel } from '../cardMapping';
  import { labelLocaleValue, setLabelLocale } from '../lib/card-render';
  import { uid, type SchemaField, type Schema } from '../model';
```

Replace the single label input. Before (`src/lib/modules/flashcards/components/SchemaLibraryModal.svelte:183`):
```svelte
                      <input aria-label="field label" placeholder="label" bind:value={f.label} oninput={commitFields} />
```
After:
```svelte
                      <input aria-label="field label" placeholder="label"
                        value={labelLocaleValue(f.label, $project.locales[0], $project.locales[0])}
                        oninput={(e) => patchField(i, { label: setLabelLocale(f.label, $project.locales[0], (e.target as HTMLInputElement).value, $project.locales[0]) })} />
```
(Note: `patchField` in this file already calls `commitFields()` internally, so the explicit
`oninput={commitFields}` is no longer needed — the write goes through `patchField`.)

### Step 20c: Run the full gate — everything green

Run: `npm run check`
Expected: PASS — 0 errors. The `cardMapping.ts` error was fixed in Step 7; both editor errors
are fixed by the Step 20a/20b stopgaps.

Run: `npm test`
Expected: PASS — all suites green (Windows may show a transient `EBUSY` on the vitest cache;
re-run once if so). The pre-existing `SchemaEditorModal` / `SchemaLibraryModal` tests still pass:
each edits a label with no locale switching, so the primary-locale stopgap behaves like the old
single input (and `SchemaEditorModal`'s "field on save" test still backfills the blank label to
the key `'title'`).

Run: `npm run build`
Expected: PASS.

### Step 21: Commit

```bash
git add src/lib/modules/flashcards/model.ts \
  src/lib/modules/flashcards/lib/card-render.ts \
  src/lib/modules/flashcards/cardMapping.ts \
  src/lib/modules/flashcards/lib/ai.ts \
  src/lib/modules/flashcards/components/CardGallery.svelte \
  src/lib/modules/flashcards/components/CardPreview.svelte \
  src/lib/modules/flashcards/components/StyleControls.svelte \
  src/lib/modules/flashcards/components/SchemaLibraryModal.svelte \
  src/lib/modules/flashcards/components/SchemaEditorModal.svelte \
  src/lib/modules/flashcards/components/RecordField.svelte \
  src/lib/modules/flashcards/components/RecordDetail.svelte \
  src/lib/modules/flashcards/components/AutofillImagesModal.svelte \
  tests/card-render.test.ts tests/cardMapping.test.ts tests/RecordField.test.ts \
  tests/StyleControls.test.ts tests/AutofillImagesModal.test.ts tests/ai.test.ts \
  tests/flashcards-model.test.ts
git commit -m "feat: multi-language field labels — resolveLabel, recordToCard/viewLabel, readers"
```

---

## Task 2: `SchemaEditorModal` per-locale label input

Replaces Task 1's single-input primary-locale stopgap with the full per-locale editor: one
LOC-tagged input per `project.locales` (mirroring `RecordField`'s multilingual value-entry
rows). Task 1 already made the file compile-clean (helper import + `LocalizedText`-safe save
backfill + stopgap input); this task swaps the stopgap input for the multi-row block and
refines the save backfill to a shared `isLabelBlank` check.

**Files:**
- Modify: `src/lib/modules/flashcards/components/SchemaEditorModal.svelte`
- Test: `tests/SchemaEditorModal.test.ts`

**Interfaces:**
- Consumes: `labelLocaleValue(label, locale, firstLocale): string`,
  `setLabelLocale(label, locale, text, firstLocale): LocalizedText` from
  `src/lib/modules/flashcards/lib/card-render.ts` (Task 1).
- Produces: nothing new consumed by later tasks (Task 3 does the equivalent independently, in
  its own file).

### Step 1: Write the failing tests

Add to `tests/SchemaEditorModal.test.ts`, inside `describe('SchemaEditorModal', ...)` (after
its existing `it`):
```ts
  it('seeds one label input per project locale, initially blank for a new field', async () => {
    render(SchemaEditorModal);
    S.schemaEditorOpen.set('__new__');
    await screen.findByText(/schema name/i);
    await fireEvent.click(screen.getByRole('button', { name: /add field/i }));
    expect((screen.getByLabelText('field label en') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('field label vi') as HTMLInputElement).value).toBe('');
  });
  it('editing one locale\'s label writes a LocalizedText object without clobbering the other locale', async () => {
    render(SchemaEditorModal);
    S.schemaEditorOpen.set('__new__');
    await screen.findByText(/schema name/i);
    await fireEvent.click(screen.getByRole('button', { name: /add field/i }));
    await fireEvent.input(screen.getByLabelText('field label en'), { target: { value: 'Word' } });
    await fireEvent.input(screen.getByLabelText('field label vi'), { target: { value: 'Từ' } });
    await fireEvent.input(screen.getByLabelText(/field key/i), { target: { value: 'w' } });
    await fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(get(S.project).schemas[0].fields[0].label).toEqual({ en: 'Word', vi: 'Từ' });
  });
  it('backfills a blank label to the typed key on save', async () => {
    render(SchemaEditorModal);
    S.schemaEditorOpen.set('__new__');
    await screen.findByText(/schema name/i);
    await fireEvent.click(screen.getByRole('button', { name: /add field/i }));
    await fireEvent.input(screen.getByLabelText(/field key/i), { target: { value: 'w' } });
    await fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(get(S.project).schemas[0].fields[0].label).toBe('w');
  });
```

### Step 2: Run the tests, verify they fail

Run: `npm test -- SchemaEditorModal.test.ts`
Expected: FAIL — `getByLabelText('field label en')` / `('field label vi')` find nothing (the
component still renders a single `aria-label="field label"` input).

### Step 3: Replace the single label input with a per-locale block

Before (`src/lib/modules/flashcards/components/SchemaEditorModal.svelte:1-7`):
```svelte
<script lang="ts">
  import Plus from 'lucide-svelte/icons/plus';
  import X from 'lucide-svelte/icons/x';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import { confirm } from '@tauri-apps/plugin-dialog';
  import { project, schemaEditorOpen, addSchema, updateSchema, deleteSchema } from '../stores';
  import { uid, type SchemaField } from '../model';
```
After:
```svelte
<script lang="ts">
  import Plus from 'lucide-svelte/icons/plus';
  import X from 'lucide-svelte/icons/x';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import { confirm } from '@tauri-apps/plugin-dialog';
  import { project, schemaEditorOpen, addSchema, updateSchema, deleteSchema } from '../stores';
  import { labelLocaleValue, setLabelLocale } from '../lib/card-render';
  import { uid, type SchemaField } from '../model';
```

Before (`src/lib/modules/flashcards/components/SchemaEditorModal.svelte:41-47`):
```ts
  function close() { schemaEditorOpen.set(null); }
  function save() {
    // Fill blank keys/labels defensively so records can address fields.
    const clean = fields.map((f, i) => ({
      ...f,
      key: f.key.trim() || `field${i + 1}`,
      label: f.label.trim() || f.key.trim() || `Field ${i + 1}`,
    }));
```
After:
```ts
  function close() { schemaEditorOpen.set(null); }
  /** True when every locale of a label (or a plain string label) is blank. Local to this
   *  modal's save-time defensiveness — a field must always have SOME label. */
  function isLabelBlank(label: SchemaField['label']): boolean {
    if (typeof label === 'object') return Object.values(label).every((v) => !v || !v.trim());
    return !label || !label.trim();
  }
  function save() {
    // Fill blank keys/labels defensively so records can address fields.
    const clean = fields.map((f, i) => {
      const key = f.key.trim() || `field${i + 1}`;
      const label = isLabelBlank(f.label) ? (f.key.trim() || `Field ${i + 1}`) : f.label;
      return { ...f, key, label };
    });
```

Before (`src/lib/modules/flashcards/components/SchemaEditorModal.svelte:85-106`):
```svelte
        {#each fields as f, i (f.id)}
          <div class="field-row">
            <input aria-label="field key" placeholder="key" bind:value={f.key}
              oninput={(e) => patchField(i, { key: (e.target as HTMLInputElement).value })} />
            <input aria-label="field label" placeholder="label" bind:value={f.label}
              oninput={(e) => patchField(i, { label: (e.target as HTMLInputElement).value })} />
            <select aria-label="field type" value={f.type}
              onchange={(e) => patchField(i, { type: (e.target as HTMLSelectElement).value as SchemaField['type'] })}>
              <option value="text">text</option>
              <option value="text-long">text-long</option>
              <option value="image">image</option>
            </select>
            <label class="ml" title="multilingual">
              <input type="checkbox" checked={f.multilingual !== false}
                disabled={f.type === 'image'}
                onchange={(e) => patchField(i, { multilingual: (e.target as HTMLInputElement).checked })} /> ML
            </label>
            <button type="button" aria-label="move up" onclick={() => moveField(i, -1)}>↑</button>
            <button type="button" aria-label="move down" onclick={() => moveField(i, 1)}>↓</button>
            <button type="button" aria-label="remove field" onclick={() => removeField(i)}><X size={13} /></button>
          </div>
        {/each}
```
After:
```svelte
        {#each fields as f, i (f.id)}
          <div class="field-row">
            <input aria-label="field key" placeholder="key" bind:value={f.key}
              oninput={(e) => patchField(i, { key: (e.target as HTMLInputElement).value })} />
            <div class="label-locales">
              {#each $project.locales as loc (loc)}
                <div class="loc-row">
                  <span class="loc-tag">{loc.toUpperCase()}</span>
                  <input class="txt" aria-label={`field label ${loc}`} placeholder="label"
                    value={labelLocaleValue(f.label, loc, $project.locales[0])}
                    oninput={(e) => patchField(i, { label: setLabelLocale(f.label, loc, (e.target as HTMLInputElement).value, $project.locales[0]) })} />
                </div>
              {/each}
            </div>
            <select aria-label="field type" value={f.type}
              onchange={(e) => patchField(i, { type: (e.target as HTMLSelectElement).value as SchemaField['type'] })}>
              <option value="text">text</option>
              <option value="text-long">text-long</option>
              <option value="image">image</option>
            </select>
            <label class="ml" title="multilingual">
              <input type="checkbox" checked={f.multilingual !== false}
                disabled={f.type === 'image'}
                onchange={(e) => patchField(i, { multilingual: (e.target as HTMLInputElement).checked })} /> ML
            </label>
            <button type="button" aria-label="move up" onclick={() => moveField(i, -1)}>↑</button>
            <button type="button" aria-label="move down" onclick={() => moveField(i, 1)}>↓</button>
            <button type="button" aria-label="remove field" onclick={() => removeField(i)}><X size={13} /></button>
          </div>
        {/each}
```

Update the `.field-row` layout so the (now potentially multi-line) label block doesn't force
the single-line key/select cells off-center, and add the new classes. Before
(`src/lib/modules/flashcards/components/SchemaEditorModal.svelte:137-143`):
```css
  .field-row { display:flex; align-items:center; gap:6px; }
  .field-row input:not([type]), .field-row select { padding:5px 7px;
    border:1px solid var(--border); border-radius:6px; background:var(--bg); color:var(--text); font:inherit; font-size:13px; }
  .field-row > input { flex:1; min-width:0; }
  .field-row > button { border:1px solid var(--border); background:transparent; color:var(--text-muted);
    border-radius:6px; padding:4px 7px; font:inherit; }
  .ml { display:inline-flex; align-items:center; gap:3px; font-size:11px; color:var(--text-muted); }
```
After:
```css
  .field-row { display:flex; align-items:flex-start; gap:6px; }
  .field-row input:not([type]), .field-row select { padding:5px 7px;
    border:1px solid var(--border); border-radius:6px; background:var(--bg); color:var(--text); font:inherit; font-size:13px; }
  .field-row > input { flex:1; min-width:0; }
  .field-row > button { border:1px solid var(--border); background:transparent; color:var(--text-muted);
    border-radius:6px; padding:4px 7px; font:inherit; margin-top:2px; }
  .label-locales { flex:1; min-width:0; display:flex; flex-direction:column; gap:4px; }
  .loc-row { display:flex; align-items:center; gap:6px; }
  .loc-tag { font-size:10px; font-weight:600; color:var(--accent); min-width:20px; flex:none; }
  .ml { display:inline-flex; align-items:center; gap:3px; font-size:11px; color:var(--text-muted); margin-top:5px; }
```

### Step 4: Run the tests, verify they pass

Run: `npm test -- SchemaEditorModal.test.ts`
Expected: PASS (all cases, including the pre-existing "creates a new schema with a field on
save" test — its field has no label typed, so it still backfills to the key, `'title'`).

### Step 5: Run `npm run check`, `npm test`, `npm run build`

Run: `npm run check`
Expected: FAIL with exactly 1 remaining error — `SchemaLibraryModal.svelte:183`
(`bind:value={f.label}`), fixed in Task 3. `SchemaEditorModal.svelte` must now show 0 errors.

Run: `npm test`
Expected: PASS (full suite green; re-run once on a transient Windows `EBUSY`).

Run: `npm run build`
Expected: PASS.

### Step 6: Commit

```bash
git add src/lib/modules/flashcards/components/SchemaEditorModal.svelte tests/SchemaEditorModal.test.ts
git commit -m "feat: per-locale field label input in SchemaEditorModal"
```

---

## Task 3: Schema Library fields-editor per-locale label input

Same treatment as Task 2, inside `SchemaLibraryModal.svelte`'s fields editor. This file has no
save-time blank-label backfill (fields commit immediately via `commitFields`/`patchField`), so
no `isLabelBlank` helper is needed here.

**Files:**
- Modify: `src/lib/modules/flashcards/components/SchemaLibraryModal.svelte`
- Test: `tests/SchemaLibraryModal.test.ts`

**Interfaces:**
- Consumes: `labelLocaleValue`, `setLabelLocale` from
  `src/lib/modules/flashcards/lib/card-render.ts` (Task 1).

### Step 1: Write the failing tests

Add to `tests/SchemaLibraryModal.test.ts`, inside `describe('SchemaLibraryModal', ...)` (after
its existing `it`s):
```ts
  it('seeds a per-locale label input from the entry\'s fields, showing a legacy string label under the first locale only', async () => {
    S.addToLibrary({
      name: 'Verbs',
      schema: { name: 'Verbs', fields: [{ id: 'f1', key: 'w', label: 'Word', type: 'text', multilingual: true }], cardTemplates: [] },
      settings: DEFAULT_SETTINGS,
    });
    S.schemaLibraryOpen.set(true);
    render(SchemaLibraryModal);
    await fireEvent.click(screen.getByRole('button', { name: /toggle details/i }));
    expect((screen.getByLabelText('field label en') as HTMLInputElement).value).toBe('Word');
    expect((screen.getByLabelText('field label vi') as HTMLInputElement).value).toBe('');
  });

  it('editing a locale label commits a LocalizedText object without clobbering the other locale', async () => {
    const id = S.addToLibrary({
      name: 'Verbs',
      schema: { name: 'Verbs', fields: [{ id: 'f1', key: 'w', label: 'Word', type: 'text', multilingual: true }], cardTemplates: [] },
      settings: DEFAULT_SETTINGS,
    });
    S.schemaLibraryOpen.set(true);
    render(SchemaLibraryModal);
    await fireEvent.click(screen.getByRole('button', { name: /toggle details/i }));
    await fireEvent.input(screen.getByLabelText('field label vi'), { target: { value: 'Từ' } });
    const entry = get(S.schemaLibrary).find((e) => e.id === id)!;
    expect(entry.schema.fields[0].label).toEqual({ en: 'Word', vi: 'Từ' });
  });
```

### Step 2: Run the tests, verify they fail

Run: `npm test -- SchemaLibraryModal.test.ts`
Expected: FAIL — `getByLabelText('field label en')` / `('field label vi')` find nothing (the
component still renders a single `aria-label="field label"` input).

### Step 3: Replace the single label input with a per-locale block

Before (`src/lib/modules/flashcards/components/SchemaLibraryModal.svelte:18-20`):
```svelte
  import { serializeSchemaExport, type SchemaLibraryEntry } from '../io/schemaIO';
  import { viewLabel } from '../cardMapping';
  import { uid, type SchemaField, type Schema } from '../model';
```
After:
```svelte
  import { serializeSchemaExport, type SchemaLibraryEntry } from '../io/schemaIO';
  import { viewLabel } from '../cardMapping';
  import { labelLocaleValue, setLabelLocale } from '../lib/card-render';
  import { uid, type SchemaField, type Schema } from '../model';
```

Before (`src/lib/modules/flashcards/components/SchemaLibraryModal.svelte:180-197`):
```svelte
                  {#each fieldsDraft as f, i (f.id)}
                    <div class="field-row">
                      <input aria-label="field key" placeholder="key" bind:value={f.key} oninput={commitFields} />
                      <input aria-label="field label" placeholder="label" bind:value={f.label} oninput={commitFields} />
                      <select aria-label="field type" value={f.type}
                        onchange={(e) => patchField(i, { type: (e.target as HTMLSelectElement).value as SchemaField['type'] })}>
                        <option value="text">text</option>
                        <option value="text-long">text-long</option>
                        <option value="image">image</option>
                      </select>
                      <label class="ml" title="multilingual">
                        <input type="checkbox" checked={f.multilingual !== false}
                          disabled={f.type === 'image'}
                          onchange={(e) => patchField(i, { multilingual: (e.target as HTMLInputElement).checked })} /> ML
                      </label>
                      <button type="button" aria-label="remove field" onclick={() => removeField(i)}><X size={13} /></button>
                    </div>
                  {/each}
```
After:
```svelte
                  {#each fieldsDraft as f, i (f.id)}
                    <div class="field-row">
                      <input aria-label="field key" placeholder="key" bind:value={f.key} oninput={commitFields} />
                      <div class="label-locales">
                        {#each $project.locales as loc (loc)}
                          <div class="loc-row">
                            <span class="loc-tag">{loc.toUpperCase()}</span>
                            <input class="txt" aria-label={`field label ${loc}`} placeholder="label"
                              value={labelLocaleValue(f.label, loc, $project.locales[0])}
                              oninput={(e) => patchField(i, { label: setLabelLocale(f.label, loc, (e.target as HTMLInputElement).value, $project.locales[0]) })} />
                          </div>
                        {/each}
                      </div>
                      <select aria-label="field type" value={f.type}
                        onchange={(e) => patchField(i, { type: (e.target as HTMLSelectElement).value as SchemaField['type'] })}>
                        <option value="text">text</option>
                        <option value="text-long">text-long</option>
                        <option value="image">image</option>
                      </select>
                      <label class="ml" title="multilingual">
                        <input type="checkbox" checked={f.multilingual !== false}
                          disabled={f.type === 'image'}
                          onchange={(e) => patchField(i, { multilingual: (e.target as HTMLInputElement).checked })} /> ML
                      </label>
                      <button type="button" aria-label="remove field" onclick={() => removeField(i)}><X size={13} /></button>
                    </div>
                  {/each}
```

Update the CSS the same way as Task 2. Before
(`src/lib/modules/flashcards/components/SchemaLibraryModal.svelte:265-272`):
```css
  .field-row { display:flex; align-items:center; gap:6px; }
  .field-row input:not([type]), .field-row select { padding:5px 7px;
    border:1px solid var(--border); border-radius:6px; background:var(--bg); color:var(--text); font:inherit; font-size:13px; }
  .field-row > input { flex:1; min-width:0; }
  .field-row > button { border:1px solid var(--border); background:transparent; color:var(--text-muted);
    border-radius:6px; padding:4px 7px; font:inherit; }
  .field-row > button:hover { color:var(--danger); border-color:var(--danger-border); background:var(--danger-weak); }
  .ml { display:inline-flex; align-items:center; gap:3px; font-size:11px; color:var(--text-muted); }
```
After:
```css
  .field-row { display:flex; align-items:flex-start; gap:6px; }
  .field-row input:not([type]), .field-row select { padding:5px 7px;
    border:1px solid var(--border); border-radius:6px; background:var(--bg); color:var(--text); font:inherit; font-size:13px; }
  .field-row > input { flex:1; min-width:0; }
  .field-row > button { border:1px solid var(--border); background:transparent; color:var(--text-muted);
    border-radius:6px; padding:4px 7px; font:inherit; margin-top:2px; }
  .field-row > button:hover { color:var(--danger); border-color:var(--danger-border); background:var(--danger-weak); }
  .label-locales { flex:1; min-width:0; display:flex; flex-direction:column; gap:4px; }
  .loc-row { display:flex; align-items:center; gap:6px; }
  .loc-tag { font-size:10px; font-weight:600; color:var(--accent); min-width:20px; flex:none; }
  .ml { display:inline-flex; align-items:center; gap:3px; font-size:11px; color:var(--text-muted); margin-top:5px; }
```

### Step 4: Run the tests, verify they pass

Run: `npm test -- SchemaLibraryModal.test.ts`
Expected: PASS (all cases, including the pre-existing `'opening an entry shows its fields...'`
test, which only asserts on the `'field key'` input and is unaffected by the label change).

### Step 5: Run `npm run check`, `npm test`, `npm run build` — the whole gate is clean now

Run: `npm run check`
Expected: PASS — 0 errors (both files Task 1 flagged are now fixed).

Run: `npm test`
Expected: PASS (full suite green; re-run once on a transient Windows `EBUSY`).

Run: `npm run build`
Expected: PASS.

### Step 6: Commit

```bash
git add src/lib/modules/flashcards/components/SchemaLibraryModal.svelte tests/SchemaLibraryModal.test.ts
git commit -m "feat: per-locale field label input in SchemaLibraryModal fields editor"
```

---

## Task 4: Whole-branch review (note only)

No new files or code changes of its own — this task is a final verification pass over
everything Tasks 1–3 touched, before the branch is considered done.

- [ ] **Step 1: Re-run every gate from a clean state**

Run: `npm run check` — expect 0 errors.
Run: `npm test` — expect the full suite green (re-run once if a transient Windows `EBUSY`
appears on the vitest cache).
Run: `npm run build` — expect success.

- [ ] **Step 2: Diff-review the whole feature branch**

Run: `git log --oneline` (confirm the 3 commits from Tasks 1–3 are present) and
`git diff main...HEAD` (or the appropriate base) to review the full changeset in one pass.
Check specifically for:
- Every reader of `SchemaField.label` identified during planning is resolved through
  `resolveLabel` (or, for the two editors, `labelLocaleValue`/`setLabelLocale`) — grep the diff
  for `\.label\b` and confirm no remaining raw read of a `SchemaField.label` slipped through.
- `CardSection.label` (already `LocalizedText` pre-existing, resolved via `resolveLocale` in
  `card-render.ts`) was NOT touched — it was never in scope.
- `CardTemplate.name` / `Schema.name` remain plain strings — confirm no test or code change
  treats them as `LocalizedText` (out of scope per the spec).
- No hardcoded hex colors were introduced in the new `.label-locales`/`.loc-row`/`.loc-tag` CSS
  — only `var(--*)` tokens.
- `parseProject`/`serializeProject` in `model.ts` were NOT modified (backward-compat
  constraint) — confirm via `git diff` on that file showing only the one-line `SchemaField`
  type change.

- [ ] **Step 3: Confirm nothing unintended is staged for the final review**

Run: `git status` and confirm no `.gitignore`, `package.json`, `src-tauri/SIGNING.md`,
`src-tauri/signing/`, or `src-tauri/tauri.signing.conf.json.example` changes are present in
any of the 3 commits.

This task produces no commit of its own unless the review surfaces a fix — if it does, make
that fix as a normal small commit following the same TDD steps as the task whose code it
touches.
