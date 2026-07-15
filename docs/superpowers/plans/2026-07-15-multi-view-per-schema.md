# Multi-view per schema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let one schema's record set be rendered through several independent "views" (e.g. Image / Label / Content), each with its own layout, manually-selected fields, and style — previewed side by side and printed as separate decks, with same-layout leftover pages merged on export.

**Architecture:** A "view" *is* a `CardTemplate` entry in `Schema.cardTemplates[]` (no new entity). `CardTemplate` gains `name?`/`fields?`; `recordToCard` filters `schema.fields` by `template.fields` before its existing title/sections/images logic. Every per-template store setter (`setTemplateLayout`, `setTemplateStyle`, `clearStyleOverride`, `resetScopeStyle`) is retargeted from a hardcoded `cardTemplates[0]` to an explicit `templateId`, defaulting to a new UI-only `activeViewId` store. Packing keys a `Card` by `(recordId, templateId)` — one card per record per view. `collectPrintSheets` iterates every view per schema (grouped-by-view order) and a new pure `mergeLeftoverSheets` re-tiles same-layout trailing partial pages across views on export.

**Tech Stack:** Svelte 5 (runes), TypeScript, vitest + @testing-library/svelte. No new dependencies.

## Global Constraints

- Everything under `src/lib/modules/flashcards/`. Module isolation — the flashcards module owns its own stores/history; nothing bypasses the `TomoeModule` contract.
- Svelte 5 runes only (`$state`/`$derived`/`$derived.by`/`$effect`) — **no** `$:` reactive statements.
- `lucide-svelte` icons — subpath imports only (`lucide-svelte/icons/x`), never the barrel import.
- Card interior rendering (`buildCardHTML`/`buildSheetHTML`, the `.fc-*` classes) uses fixed print colors (`white`, explicit hex from `Settings`/`StyleOverrides`) — never `var(--*)` tokens. Chrome (toolbars, view bar, tabs, StyleControls, CardGallery/CardPreview UI) styles with Calm Paper tokens (`var(--accent)`, `var(--bg)`, `var(--border)`, `var(--text)`, `var(--text-muted)`, `var(--surface)`, `var(--sidebar)`, `var(--accent-weak)`) — never a hardcoded hex in chrome CSS.
- Pure logic (`model.ts`, `cardMapping.ts`, `cardOps.ts`, `lib/printCards.ts`, `lib/style.ts`) is immutable — never mutate an input `Project`/`Schema`/`Card`/`Sheet`; always return a new object. TDD: write the failing test first for every pure function and every store action.
- `Schema.cardTemplates[]` is now the schema's ordered list of views. No migration needed — a file with `cardTemplates.length <= 1` previews/prints exactly as before (single implicit view); `parseProject`'s existing `migrateTemplate` mapping already carries any extra templates through untouched.
- Views spanning multiple schemas, a shared view library/presets, per-view locale, drag-to-arrange field→slot mapping, and reordering views by drag are **out of scope** (add/delete/rename only; order = insertion order).
- Gates per task: `npm run check` → 0 errors · `npm test` → green, 0 unhandled (Windows sometimes throws a transient `EBUSY` on the vitest cache — re-run once for a clean count) · `npm run build` → OK. Do not move to the next task until all three are green.
- Commit only the files you changed for that task (`git add <exact paths>`, never `git add -A`/`.`). **Never** stage the repo's uncommitted code-signing files — `.gitignore`, `package.json`, `src-tauri/SIGNING.md`, `src-tauri/signing/`, `src-tauri/tauri.signing.conf.json.example` — they are intentionally outside this work.
- Commit message style (this repo, no ticket prefix): `feat(flashcards): <description>` / `fix(flashcards): <description>` / `refactor(flashcards): <description>` / `test(flashcards): <description>`, lowercase, imperative.

---

## Task 1: Model + `recordToCard` field-selection + `viewLabel`

**Files:**
- Modify: `src/lib/modules/flashcards/model.ts:28` (`CardTemplate` interface)
- Modify: `src/lib/modules/flashcards/cardMapping.ts:1-61` (`recordToCard`; new `viewLabel`)
- Test: `tests/cardMapping.test.ts`

**Interfaces:**
- Consumes: existing `CardTemplate`, `Schema`, `RecordItem`, `Settings` (`model.ts`); existing `deriveAutoTemplate` (`cardMapping.ts`).
- Produces: `CardTemplate.name?: string`, `CardTemplate.fields?: string[]` (consumed by Tasks 2–6); `recordToCard(record, schema, template, settings, locale): Card` (signature unchanged, new field-filtering behavior — consumed by Tasks 3, 4, 6); `viewLabel(template: CardTemplate, schema: Schema, index: number): string` (consumed by Tasks 3, 4, 5).

- [ ] **Step 1: Add `name`/`fields` to `CardTemplate`.**

In `src/lib/modules/flashcards/model.ts:28`, change:

```ts
export interface CardTemplate { id: string; templateType: 'single'|'compound'; layout: string; locale?: string; size?: string|null; orientation?: string; imageHeightPercent?: number; hideTitle?: boolean; hideSectionLabels?: boolean; cardClass?: string|null; cardConfig?: Record<string, unknown>; cardsPerPage?: number; autoFit?: boolean; cardSize?: 'A4'|'A5'|'A6'|'A7'|'A8'|'Letter'; style?: StyleOverrides; mapping: { titleSlot?: string; labelSlot?: string; textSlot?: string; imageSlot?: string; imageSlots?: string[]; sections?: string[] } }
```

to (adds `name?`/`fields?` — a "view" is one `CardTemplate`; `name` is an explicit user-set label, usually unset; `fields` is the record field keys this view includes, in order — empty/undefined ⇒ all fields, today's behavior):

```ts
export interface CardTemplate { id: string; templateType: 'single'|'compound'; layout: string; locale?: string; size?: string|null; orientation?: string; imageHeightPercent?: number; hideTitle?: boolean; hideSectionLabels?: boolean; cardClass?: string|null; cardConfig?: Record<string, unknown>; cardsPerPage?: number; autoFit?: boolean; cardSize?: 'A4'|'A5'|'A6'|'A7'|'A8'|'Letter'; style?: StyleOverrides; /** explicit view name (rename), usually unset — see viewLabel */ name?: string; /** selected field keys, in order; empty/undefined = all fields */ fields?: string[]; mapping: { titleSlot?: string; labelSlot?: string; textSlot?: string; imageSlot?: string; imageSlots?: string[]; sections?: string[] } }
```

No migration code is needed: `migrateTemplate` in `model.ts:62-74` already spreads `t`/`out` through unchanged, so any `name`/`fields` present in a saved file survive `parseProject` automatically.

- [ ] **Step 2: Run the existing model suite to confirm this is a non-breaking type-only change.**

Run: `npm test -- flashcards-model`
Expected: PASS (all existing cases green; nothing references `name`/`fields` yet).

- [ ] **Step 3: Write the failing `recordToCard` field-selection tests.**

In `tests/cardMapping.test.ts`, add below the existing `describe('recordToCard', ...)` block:

```ts
describe('recordToCard — field selection (views)', () => {
  const rec: RecordItem = { id: 'r1', schemaId: 's1', fieldsHash: '', fields: {
    title: { en: 'Owl', vi: 'Cú' }, def: { en: 'a bird', vi: 'con chim' }, pic: 'http://x/o.png',
  } };
  it('template.fields=["pic"] with a fullimage layout includes only the image, no title/sections', () => {
    const t = { ...deriveAutoTemplate(schema()), layout: 'fullimage', fields: ['pic'] };
    const c = recordToCard(rec, schema(), t, DEFAULT_SETTINGS, 'en');
    expect(c.images[0]).toMatchObject({ slot: 0, url: 'http://x/o.png' });
    expect(c.title).toBe('');
    expect(c.sections).toHaveLength(0);
  });
  it('template.fields=["def"] with fulltext includes only that field, as the title (the one remaining text field)', () => {
    const t = { ...deriveAutoTemplate(schema()), layout: 'fulltext', fields: ['def'] };
    const c = recordToCard(rec, schema(), t, DEFAULT_SETTINGS, 'en');
    expect(c.title).toBe('a bird');
    expect(c.sections).toHaveLength(0);
    expect(c.images).toHaveLength(0);
  });
  it('template.fields in a custom order puts the FIRST listed text field as the title', () => {
    const t = { ...deriveAutoTemplate(schema()), layout: 'fulltext', fields: ['def', 'title'] };
    const c = recordToCard(rec, schema(), t, DEFAULT_SETTINGS, 'en');
    expect(c.title).toBe('a bird');
    expect(c.sections).toHaveLength(1);
    expect(c.sections[0].label).toBe('Title');
    expect(c.sections[0].content).toBe('Owl');
  });
  it('an empty fields array behaves like undefined — all fields, unchanged', () => {
    const t = { ...deriveAutoTemplate(schema()), fields: [] };
    const c = recordToCard(rec, schema(), t, DEFAULT_SETTINGS, 'en');
    expect(c.title).toBe('Owl');
    expect(c.sections).toHaveLength(1);
    expect(c.images).toHaveLength(1);
  });
});

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

Update the file's import line to also pull in `viewLabel`:

```ts
import { deriveAutoTemplate, recordToCard, applySettings, applyTemplatePatch, chunkRecords, viewLabel } from '../src/lib/modules/flashcards/cardMapping';
```

- [ ] **Step 4: Run the tests to verify they fail.**

Run: `npm test -- cardMapping`
Expected: FAIL — `viewLabel` is not exported, and the field-selection assertions fail (recordToCard ignores `template.fields` today).

- [ ] **Step 5: Implement field-selection in `recordToCard` and add `viewLabel`.**

In `src/lib/modules/flashcards/cardMapping.ts`, change the import line to add `SchemaField`:

```ts
import { uid, type Project, type Schema, type CardTemplate, type RecordItem, type Card, type CardSection, type CardImage, type Settings, type StyleOverrides, type SchemaField } from './model';
```

Change `recordToCard` (lines 30-61) from:

```ts
export function recordToCard(
  record: RecordItem, schema: Schema, template: CardTemplate, settings: Settings, locale: string,
): Card {
  const orientation = template.style?.orientation ?? template.orientation ?? settings.orientation;
  const textFields = schema.fields.filter((f) => f.type !== 'image');
  const imageFields = schema.fields.filter((f) => f.type === 'image');
```

to:

```ts
export function recordToCard(
  record: RecordItem, schema: Schema, template: CardTemplate, settings: Settings, locale: string,
): Card {
  const orientation = template.style?.orientation ?? template.orientation ?? settings.orientation;
  // A view (template.fields) selects + orders a subset of the schema's fields; empty/undefined = all.
  const activeFields: SchemaField[] = template.fields?.length
    ? template.fields.map((k) => schema.fields.find((f) => f.key === k)).filter((f): f is SchemaField => !!f)
    : schema.fields;
  const textFields = activeFields.filter((f) => f.type !== 'image');
  const imageFields = activeFields.filter((f) => f.type === 'image');
```

(the rest of the function — `titleField`, `sectionFields`, `slotCount`, `images`, `sections`, the returned `Card` — is unchanged, since it already only reads from `textFields`/`imageFields`).

Then add, after `recordToCard` (before `applySettings`):

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

- [ ] **Step 6: Run the tests to verify they pass.**

Run: `npm test -- cardMapping`
Expected: PASS (all `recordToCard` + `viewLabel` cases green).

- [ ] **Step 7: Full gates + commit.**

Run: `npm run check` (0 errors) → `npm test` (full suite green, 0 unhandled) → `npm run build` (OK).

```bash
git add src/lib/modules/flashcards/model.ts src/lib/modules/flashcards/cardMapping.ts tests/cardMapping.test.ts
git commit -m "feat(flashcards): CardTemplate name/fields + recordToCard field-selection + viewLabel"
```

---

## Task 2: Store view actions + retarget per-template setters to `templateId`

**Files:**
- Modify: `src/lib/modules/flashcards/cardMapping.ts` (`applyTemplatePatch`/`applyTemplateStyle` signature; new `addView`/`renameView`/`deleteView`/`setViewFields`)
- Modify: `src/lib/modules/flashcards/stores.ts` (new `activeViewId`/`selectView`; retargeted setters; new view action wrappers)
- Test: `tests/cardMapping.test.ts` (update existing `applyTemplatePatch` test; new tests)
- Test: `tests/flashcards-views.test.ts` (new)

**Interfaces:**
- Consumes: `viewLabel`, `recordToCard`, `deriveAutoTemplate` (Task 1); `Project`, `Schema`, `CardTemplate`, `StyleOverrides` (`model.ts`); `mergeStyle` (`lib/style.ts`).
- Produces (pure, `cardMapping.ts`): `applyTemplatePatch(p, schemaId, templateId: string|null, patch): Project`; `applyTemplateStyle(p, schemaId, templateId: string|null, patch): Project`; `addView(p, schemaId): { project: Project; id: string|null }`; `renameView(p, schemaId, templateId, name): Project`; `deleteView(p, schemaId, templateId): Project` (no-ops when `cardTemplates.length <= 1`); `setViewFields(p, schemaId, templateId, keys: string[]): Project`.
- Produces (store, `stores.ts`): `activeViewId: Writable<string|null>`; `selectView(id: string|null): void`; `setTemplateLayout(schemaId, patch, templateId?): void`; `setTemplateStyle(schemaId, patch, templateId?): void`; `clearStyleOverride(scope, id, key, templateId?): void`; `resetScopeStyle(scope, id, templateId?): void`; `addView(schemaId): void`; `renameView(schemaId, templateId, name): void`; `deleteView(schemaId, templateId): void`; `setViewFields(schemaId, templateId, keys): void` — all consumed by Tasks 4/5.

- [ ] **Step 1: Update the existing `applyTemplatePatch` test for the new `templateId` param; write failing tests for the new signature + view ops.**

In `tests/cardMapping.test.ts`, change the import line to:

```ts
import { deriveAutoTemplate, recordToCard, applySettings, applyTemplatePatch, applyTemplateStyle, chunkRecords, viewLabel, addView, renameView, deleteView, setViewFields } from '../src/lib/modules/flashcards/cardMapping';
```

Replace the `applyTemplatePatch` test in `describe('applySettings / applyTemplatePatch', ...)`:

```ts
it('applyTemplatePatch creates the schema template then patches it', () => {
  const p = newProject(); p.schemas.push(schema());
  const p2 = applyTemplatePatch(p, 's1', { layout: '2x2' });
  expect(p2.schemas[0].cardTemplates[0].layout).toBe('2x2');
  const p3 = applyTemplatePatch(p2, 's1', { orientation: 'landscape' });
  expect(p3.schemas[0].cardTemplates[0].layout).toBe('2x2'); // preserved
  expect(p3.schemas[0].cardTemplates[0].orientation).toBe('landscape');
});
```

with:

```ts
it('applyTemplatePatch(templateId=null) creates the schema\'s first template then patches it', () => {
  const p = newProject(); p.schemas.push(schema());
  const p2 = applyTemplatePatch(p, 's1', null, { layout: '2x2' });
  expect(p2.schemas[0].cardTemplates[0].layout).toBe('2x2');
  const p3 = applyTemplatePatch(p2, 's1', null, { orientation: 'landscape' });
  expect(p3.schemas[0].cardTemplates[0].layout).toBe('2x2'); // preserved
  expect(p3.schemas[0].cardTemplates[0].orientation).toBe('landscape');
});
it('applyTemplatePatch targets a specific templateId, leaving other views untouched', () => {
  const p = newProject();
  const s = schema();
  s.cardTemplates = [
    { id: 't1', templateType: 'single', layout: 'fulltext', mapping: {} },
    { id: 't2', templateType: 'single', layout: 'fullimage', mapping: {} },
  ];
  p.schemas.push(s);
  const p2 = applyTemplatePatch(p, 's1', 't2', { hideTitle: true });
  expect(p2.schemas[0].cardTemplates[0]).toMatchObject({ layout: 'fulltext' }); // t1 untouched
  expect(p2.schemas[0].cardTemplates[1]).toMatchObject({ layout: 'fullimage', hideTitle: true });
});
it('applyTemplatePatch with a stale/unknown templateId falls back to the first view (no duplicate created)', () => {
  const p = newProject(); const s = schema();
  s.cardTemplates = [{ id: 't1', templateType: 'single', layout: 'fulltext', mapping: {} }];
  p.schemas.push(s);
  const p2 = applyTemplatePatch(p, 's1', 'not-a-real-id', { hideTitle: true });
  expect(p2.schemas[0].cardTemplates).toHaveLength(1);
  expect(p2.schemas[0].cardTemplates[0]).toMatchObject({ layout: 'fulltext', hideTitle: true });
});

describe('applyTemplateStyle (templateId)', () => {
  it('targets a specific templateId', () => {
    const p = newProject();
    const s = schema();
    s.cardTemplates = [
      { id: 't1', templateType: 'single', layout: 'fulltext', mapping: {} },
      { id: 't2', templateType: 'single', layout: 'fullimage', mapping: {} },
    ];
    p.schemas.push(s);
    const p2 = applyTemplateStyle(p, 's1', 't2', { border: { width: 9 } });
    expect(p2.schemas[0].cardTemplates[0].style).toBeUndefined();
    expect(p2.schemas[0].cardTemplates[1].style?.border?.width).toBe(9);
  });
});

describe('views (addView/renameView/deleteView/setViewFields)', () => {
  it('addView on a virgin schema (no persisted templates) materializes the implicit view 1, then appends view 2', () => {
    const p = newProject(); p.schemas.push(schema()); // schema().cardTemplates === []
    const { project: p2, id } = addView(p, 's1');
    expect(id).toBeTruthy();
    expect(p2.schemas[0].cardTemplates).toHaveLength(2); // baseline (materialized) + the new one
    expect(p2.schemas[0].cardTemplates[1].id).toBe(id);  // the new view is the 2nd
  });
  it('addView on a schema that already has views just appends one more', () => {
    const p = newProject();
    const s = schema();
    s.cardTemplates = [{ id: 't1', templateType: 'single', layout: 'fulltext', mapping: {} }];
    p.schemas.push(s);
    const { project: p2, id } = addView(p, 's1');
    expect(p2.schemas[0].cardTemplates).toHaveLength(2);
    expect(p2.schemas[0].cardTemplates[0].id).toBe('t1'); // untouched
    expect(p2.schemas[0].cardTemplates[1].id).toBe(id);
  });
  it('addView on a missing schema is a no-op', () => {
    const p = newProject();
    const { project: p2, id } = addView(p, 'missing');
    expect(id).toBeNull();
    expect(p2).toBe(p);
  });
  it('renameView sets an explicit name on the addressed template only', () => {
    const p = newProject();
    const s = schema();
    s.cardTemplates = [
      { id: 't1', templateType: 'single', layout: 'fulltext', mapping: {} },
      { id: 't2', templateType: 'single', layout: 'fullimage', mapping: {} },
    ];
    p.schemas.push(s);
    const p2 = renameView(p, 's1', 't2', 'Cover');
    expect(p2.schemas[0].cardTemplates[0].name).toBeUndefined();
    expect(p2.schemas[0].cardTemplates[1].name).toBe('Cover');
  });
  it('deleteView removes the addressed template when more than one view exists', () => {
    const p = newProject();
    const s = schema();
    s.cardTemplates = [
      { id: 't1', templateType: 'single', layout: 'fulltext', mapping: {} },
      { id: 't2', templateType: 'single', layout: 'fullimage', mapping: {} },
    ];
    p.schemas.push(s);
    const p2 = deleteView(p, 's1', 't1');
    expect(p2.schemas[0].cardTemplates).toHaveLength(1);
    expect(p2.schemas[0].cardTemplates[0].id).toBe('t2');
  });
  it('deleteView refuses to delete the last remaining view', () => {
    const p = newProject();
    const s = schema();
    s.cardTemplates = [{ id: 't1', templateType: 'single', layout: 'fulltext', mapping: {} }];
    p.schemas.push(s);
    const p2 = deleteView(p, 's1', 't1');
    expect(p2.schemas[0].cardTemplates).toHaveLength(1);
    expect(p2).toBe(p); // unchanged reference — refused
  });
  it('setViewFields sets the selected field keys on the addressed template', () => {
    const p = newProject();
    const s = schema();
    s.cardTemplates = [{ id: 't1', templateType: 'single', layout: 'fulltext', mapping: {} }];
    p.schemas.push(s);
    const p2 = setViewFields(p, 's1', 't1', ['def']);
    expect(p2.schemas[0].cardTemplates[0].fields).toEqual(['def']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail.**

Run: `npm test -- cardMapping`
Expected: FAIL — `applyTemplatePatch`/`applyTemplateStyle` still take 3 args (schemaId, patch) not 4; `addView`/`renameView`/`deleteView`/`setViewFields` are not exported.

- [ ] **Step 3: Implement the retargeted setters + view ops in `cardMapping.ts`.**

Replace `applyTemplatePatch` and `applyTemplateStyle` (lines 74-88) with:

```ts
/** Index of the addressed template within a schema's cardTemplates: the exact templateId if
 *  found; the first view (index 0) if templateId is null/stale/unknown but the schema already
 *  has views; -1 only when the schema has NO views yet (the caller then creates the first one). */
function templateIndex(s: Schema, templateId: string | null): number {
  if (!s.cardTemplates.length) return -1;
  if (!templateId) return 0;
  const idx = s.cardTemplates.findIndex((t) => t.id === templateId);
  return idx === -1 ? 0 : idx;
}

export function applyTemplatePatch(p: Project, schemaId: string, templateId: string | null, patch: Partial<CardTemplate>): Project {
  return { ...p, schemas: p.schemas.map((s) => {
    if (s.id !== schemaId) return s;
    const idx = templateIndex(s, templateId);
    if (idx === -1) return { ...s, cardTemplates: [{ ...deriveAutoTemplate(s), ...patch }, ...s.cardTemplates] };
    const cardTemplates = s.cardTemplates.slice();
    cardTemplates[idx] = { ...cardTemplates[idx], ...patch };
    return { ...s, cardTemplates };
  }) };
}

export function applyTemplateStyle(p: Project, schemaId: string, templateId: string | null, patch: StyleOverrides): Project {
  return { ...p, schemas: p.schemas.map((s) => {
    if (s.id !== schemaId) return s;
    const idx = templateIndex(s, templateId);
    if (idx === -1) {
      const created = deriveAutoTemplate(s);
      return { ...s, cardTemplates: [{ ...created, style: mergeStyle(created.style, patch) }, ...s.cardTemplates] };
    }
    const cardTemplates = s.cardTemplates.slice();
    cardTemplates[idx] = { ...cardTemplates[idx], style: mergeStyle(cardTemplates[idx].style, patch) };
    return { ...s, cardTemplates };
  }) };
}

// ── Views (multi-view per schema): a "view" is one entry in Schema.cardTemplates ──
/** Adds one more view than the schema currently shows. A virgin schema (cardTemplates: []) only
 *  ever DISPLAYS one synthetic auto-derived view (see deriveAutoTemplate) — it is never persisted
 *  until something writes to it. So "add a view" here first MATERIALIZES that baseline view as a
 *  real, persisted cardTemplates[0], then appends the new one after it — the user goes from
 *  "View 1" (implicit) to "View 1" + "View 2" (both real), not from nothing to a single view. */
export function addView(p: Project, schemaId: string): { project: Project; id: string | null } {
  const schema = p.schemas.find((s) => s.id === schemaId);
  if (!schema) return { project: p, id: null };
  const baseline = schema.cardTemplates.length ? schema.cardTemplates : [deriveAutoTemplate(schema)];
  const created: CardTemplate = { ...deriveAutoTemplate(schema), id: uid('tpl') };
  const project = { ...p, schemas: p.schemas.map((s) => (s.id === schemaId ? { ...s, cardTemplates: [...baseline, created] } : s)) };
  return { project, id: created.id };
}

export function renameView(p: Project, schemaId: string, templateId: string, name: string): Project {
  return { ...p, schemas: p.schemas.map((s) => (s.id !== schemaId ? s : {
    ...s, cardTemplates: s.cardTemplates.map((t) => (t.id === templateId ? { ...t, name } : t)),
  })) };
}

/** Refuses to delete a schema's last remaining view — a schema must always keep >=1 once it has any. */
export function deleteView(p: Project, schemaId: string, templateId: string): Project {
  const schema = p.schemas.find((s) => s.id === schemaId);
  if (!schema || schema.cardTemplates.length <= 1) return p;
  return { ...p, schemas: p.schemas.map((s) => (s.id !== schemaId ? s : {
    ...s, cardTemplates: s.cardTemplates.filter((t) => t.id !== templateId),
  })) };
}

export function setViewFields(p: Project, schemaId: string, templateId: string, keys: string[]): Project {
  return { ...p, schemas: p.schemas.map((s) => (s.id !== schemaId ? s : {
    ...s, cardTemplates: s.cardTemplates.map((t) => (t.id === templateId ? { ...t, fields: keys } : t)),
  })) };
}
```

- [ ] **Step 4: Run the tests to verify they pass.**

Run: `npm test -- cardMapping`
Expected: PASS.

- [ ] **Step 5: Write the failing store-level tests.**

Create `tests/flashcards-views.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import * as S from '../src/lib/modules/flashcards/stores';

beforeEach(() => { S.initProject(); });

function seedSchema() {
  const sid = S.addSchema('Words');
  S.updateSchema(sid, { fields: [
    { id: 'f1', key: 'title', label: 'Title', type: 'text', multilingual: true },
    { id: 'f2', key: 'pic', label: 'Pic', type: 'image' },
  ] });
  return sid;
}

describe('view stores', () => {
  it('addView appends a view and makes it the active view', () => {
    const sid = seedSchema();
    S.setTemplateLayout(sid, { layout: 'fulltext' }); // creates the first (implicit) view
    S.addView(sid);
    const tpls = get(S.project).schemas[0].cardTemplates;
    expect(tpls).toHaveLength(2);
    expect(get(S.activeViewId)).toBe(tpls[1].id);
    expect(get(S.dirty)).toBe(true);
  });

  it('renameView sets an explicit name, read back by the addressed template', () => {
    const sid = seedSchema();
    S.setTemplateLayout(sid, { layout: 'fulltext' });
    const t1 = get(S.project).schemas[0].cardTemplates[0].id;
    S.renameView(sid, t1, 'Cover');
    expect(get(S.project).schemas[0].cardTemplates[0].name).toBe('Cover');
  });

  it('deleteView refuses the last view; succeeds once a 2nd exists, reassigning activeViewId off the deleted one', () => {
    const sid = seedSchema();
    S.setTemplateLayout(sid, { layout: 'fulltext' });
    const t1 = get(S.project).schemas[0].cardTemplates[0].id;
    S.selectView(t1);
    S.deleteView(sid, t1); // refused — only view
    expect(get(S.project).schemas[0].cardTemplates).toHaveLength(1);

    S.addView(sid);
    const t2 = get(S.project).schemas[0].cardTemplates[1].id;
    S.selectView(t1);
    S.deleteView(sid, t1); // now allowed
    expect(get(S.project).schemas[0].cardTemplates).toHaveLength(1);
    expect(get(S.project).schemas[0].cardTemplates[0].id).toBe(t2);
    expect(get(S.activeViewId)).toBe(t2); // reassigned off the deleted active view
  });

  it('setViewFields commits the selected field keys onto the addressed template', () => {
    const sid = seedSchema();
    S.setTemplateLayout(sid, { layout: 'fulltext' });
    const t1 = get(S.project).schemas[0].cardTemplates[0].id;
    S.setViewFields(sid, t1, ['pic']);
    expect(get(S.project).schemas[0].cardTemplates[0].fields).toEqual(['pic']);
  });

  it('setTemplateLayout/setTemplateStyle default to the active view, not always cardTemplates[0]', () => {
    const sid = seedSchema();
    S.setTemplateLayout(sid, { layout: 'fulltext' });
    S.addView(sid); // active view is now the 2nd template
    const [t1, t2] = get(S.project).schemas[0].cardTemplates.map((t) => t.id);
    S.setTemplateLayout(sid, { layout: 'fullimage' });
    S.setTemplateStyle(sid, { border: { width: 9 } });
    const tpls = get(S.project).schemas[0].cardTemplates;
    expect(tpls.find((t) => t.id === t2)?.layout).toBe('fullimage');
    expect(tpls.find((t) => t.id === t2)?.style?.border?.width).toBe(9);
    expect(tpls.find((t) => t.id === t1)?.layout).toBe('fulltext'); // untouched
  });

  it('setTemplateLayout/setTemplateStyle accept an explicit templateId, overriding the active view', () => {
    const sid = seedSchema();
    S.setTemplateLayout(sid, { layout: 'fulltext' });
    S.addView(sid);
    const [t1, t2] = get(S.project).schemas[0].cardTemplates.map((t) => t.id);
    S.setTemplateLayout(sid, { layout: '2x2' }, t1); // active view is t2, but we address t1 explicitly
    const tpls = get(S.project).schemas[0].cardTemplates;
    expect(tpls.find((t) => t.id === t1)?.layout).toBe('2x2');
    expect(tpls.find((t) => t.id === t2)?.layout).not.toBe('2x2');
  });

  it('clearStyleOverride/resetScopeStyle at "schema" scope target the active view\'s template', () => {
    const sid = seedSchema();
    S.setTemplateLayout(sid, { layout: 'fulltext' });
    S.addView(sid);
    const t2 = get(S.activeViewId)!;
    S.setTemplateStyle(sid, { border: { width: 9 }, margin: 10 });
    S.clearStyleOverride('schema', sid, 'border');
    let tpls = get(S.project).schemas[0].cardTemplates;
    expect(tpls.find((t) => t.id === t2)?.style?.border).toBeUndefined();
    expect(tpls.find((t) => t.id === t2)?.style?.margin).toBe(10);
    S.resetScopeStyle('schema', sid);
    tpls = get(S.project).schemas[0].cardTemplates;
    expect(tpls.find((t) => t.id === t2)?.style).toBeUndefined();
  });
});
```

- [ ] **Step 6: Run the new test file to verify it fails.**

Run: `npm test -- flashcards-views`
Expected: FAIL — `S.activeViewId`, `S.selectView`, `S.addView`, `S.renameView`, `S.deleteView`, `S.setViewFields` don't exist yet; `setTemplateLayout`/`setTemplateStyle`/`clearStyleOverride`/`resetScopeStyle` don't accept a `templateId`.

- [ ] **Step 7: Implement the store layer in `stores.ts`.**

Change the model import line (add `Schema`):

```ts
import { newProject, type Project, type Schema, type SchemaField, type RecordItem, type Settings, type CardTemplate, type StyleOverrides } from './model';
```

In the `// ── UI-only state (not in history) ──` block, add `activeViewId`:

```ts
export const selectedRecordId = writable<string | null>(null);
export const activeSchemaId = writable<string | null>(null);
export const schemaEditorOpen = writable<string | '__new__' | null>(null);
export const cardEditorOpen = writable<string | null>(null);
export const activeViewId: Writable<string | null> = writable(null);

export function selectView(id: string | null): void { activeViewId.set(id); }
```

Reset it in `initProject`/`loadProject`:

```ts
export function initProject(): void {
  history.set(H.createHistory(newProject()));
  filePath.set(null); dirty.set(false);
  selectedRecordId.set(null); activeSchemaId.set(null); schemaEditorOpen.set(null); cardEditorOpen.set(null);
  activeViewId.set(null);
}
export function loadProject(p: Project, path: string | null): void {
  history.set(H.createHistory(p));
  filePath.set(path); dirty.set(false);
  selectedRecordId.set(null);
  activeSchemaId.set(p.schemas[0]?.id ?? null);
  schemaEditorOpen.set(null);
  cardEditorOpen.set(null);
  activeViewId.set(null);
}
```

Replace the `// ── Card/settings actions ──` block's `setTemplateLayout`/`setTemplateStyle`/`resetScopeStyle`/`clearStyleOverride` with:

```ts
function resolveTemplateId(schemaId: string, templateId?: string): string | null {
  if (templateId) return templateId;
  const active = get(activeViewId);
  if (active) return active;
  return get(project).schemas.find((s) => s.id === schemaId)?.cardTemplates[0]?.id ?? null;
}

export function setTemplateLayout(schemaId: string, patch: Partial<CardTemplate>, templateId?: string): void {
  commit(cardMapping.applyTemplatePatch(get(project), schemaId, resolveTemplateId(schemaId, templateId), patch));
}
export function setTemplateStyle(schemaId: string, patch: StyleOverrides, templateId?: string): void {
  commit(cardMapping.applyTemplateStyle(get(project), schemaId, resolveTemplateId(schemaId, templateId), patch));
}
export function setCardStyle(cardId: string, patch: StyleOverrides): void {
  const p = get(project);
  commit({ ...p, cards: p.cards.map((c) => (c.id === cardId ? { ...c, style: mergeStyle(c.style, patch) } : c)) });
}
/** Drop ALL style overrides at the given scope in a single undo step (schema template.style / card.style → undefined). */
export function resetScopeStyle(scope: 'schema' | 'card', id: string, templateId?: string): void {
  const p = get(project);
  if (scope === 'schema') {
    const tid = resolveTemplateId(id, templateId);
    commit({ ...p, schemas: p.schemas.map((s) => {
      if (s.id !== id) return s;
      const idx = s.cardTemplates.findIndex((t) => t.id === tid);
      if (idx === -1 || !s.cardTemplates[idx].style) return s;
      const cardTemplates = s.cardTemplates.slice();
      cardTemplates[idx] = { ...cardTemplates[idx], style: undefined };
      return { ...s, cardTemplates };
    }) });
  } else {
    commit({ ...p, cards: p.cards.map((c) => (c.id === id && c.style ? { ...c, style: undefined } : c)) });
  }
}
/** Remove one override key at the given scope's style object; if the resulting style is empty, set it to undefined. */
export function clearStyleOverride(scope: 'schema' | 'card', id: string, key: keyof StyleOverrides, templateId?: string): void {
  const p = get(project);
  if (scope === 'schema') {
    const tid = resolveTemplateId(id, templateId);
    commit({ ...p, schemas: p.schemas.map((s) => {
      if (s.id !== id) return s;
      const idx = s.cardTemplates.findIndex((t) => t.id === tid);
      if (idx === -1 || !s.cardTemplates[idx].style) return s;
      const existing = s.cardTemplates[idx];
      const { [key]: _drop, ...rest } = existing.style!;
      const style = Object.keys(rest).length ? rest : undefined;
      const cardTemplates = s.cardTemplates.slice();
      cardTemplates[idx] = { ...existing, style };
      return { ...s, cardTemplates };
    }) });
  } else {
    commit({ ...p, cards: p.cards.map((c) => {
      if (c.id !== id || !c.style) return c;
      const { [key]: _drop, ...rest } = c.style;
      const style = Object.keys(rest).length ? rest : undefined;
      return { ...c, style };
    }) });
  }
}

// ── View (multi-view per schema) actions ────────────────────────────────
export function addView(schemaId: string): void {
  const { project: np, id } = cardMapping.addView(get(project), schemaId);
  if (!id) return;
  commit(np);
  activeViewId.set(id);
}
export function renameView(schemaId: string, templateId: string, name: string): void {
  commit(cardMapping.renameView(get(project), schemaId, templateId, name));
}
export function deleteView(schemaId: string, templateId: string): void {
  const before = get(project).schemas.find((s) => s.id === schemaId)?.cardTemplates.length ?? 0;
  commit(cardMapping.deleteView(get(project), schemaId, templateId));
  const after = get(project).schemas.find((s) => s.id === schemaId)?.cardTemplates ?? [];
  if (after.length < before && get(activeViewId) === templateId) activeViewId.set(after[0]?.id ?? null);
}
export function setViewFields(schemaId: string, templateId: string, keys: string[]): void {
  commit(cardMapping.setViewFields(get(project), schemaId, templateId, keys));
}
```

- [ ] **Step 8: Run the tests to verify they pass.**

Run: `npm test -- flashcards-views`
Expected: PASS.

- [ ] **Step 9: Run the full suite (existing callers of the retargeted setters must still pass unchanged, since `templateId` is optional).**

Run: `npm test`
Expected: green, 0 unhandled (re-run once if a transient Windows `EBUSY` appears). In particular `tests/flashcards-stores.test.ts` and `tests/flashcards-cardstores.test.ts` (which call `setTemplateLayout`/`setTemplateStyle`/`clearStyleOverride`/`resetScopeStyle` with no `templateId`) must be unaffected.

- [ ] **Step 10: Full gates + commit.**

Run: `npm run check` (0 errors) → `npm run build` (OK).

```bash
git add src/lib/modules/flashcards/cardMapping.ts src/lib/modules/flashcards/stores.ts tests/cardMapping.test.ts tests/flashcards-views.test.ts
git commit -m "feat(flashcards): view store actions (add/rename/delete/setFields) + retarget per-template setters to templateId"
```

---

## Task 3: Pack + gallery per (record × view)

**Files:**
- Modify: `src/lib/modules/flashcards/cardOps.ts` (`packRecords`/`packAllForSchema`, `regenerateCard`, new `templateForCard`, `applyCardToRecords`)
- Modify: `src/lib/modules/flashcards/components/CardGallery.svelte`
- Test: `tests/cardOps.test.ts`
- Test: `tests/CardGallery.test.ts`

**Interfaces:**
- Consumes: `recordToCard`, `deriveAutoTemplate`, `viewLabel` (Task 1); `Project`, `Schema`, `CardTemplate`, `Card` (`model.ts`); `hashFields` (`lib/hash.ts`).
- Produces: `templateForCard(project, card): CardTemplate | null` (resolves a card's own view via `card.templateId`, falling back to the schema's first view) — consumed by Task 4/5 if needed, and internally by `regenerateCard`/`applyCardToRecords`. `packRecords`/`packAllForSchema` now build one `Card` per `(recordId, templateId)` pair, keyed by that pair (unchanged public signature).

- [ ] **Step 1: Write failing multi-view pack/regenerate tests.**

In `tests/cardOps.test.ts`, add a second schema-with-views helper and new describe blocks after the existing `packRecords / packAllForSchema` block:

```ts
function projMultiView(): Project {
  const p = newProject();
  const schema: Schema = { id: 's1', name: 'Words', cardTemplates: [
    { id: 'tText', templateType: 'single', layout: 'fulltext', size: null, hideTitle: false, hideSectionLabels: false, mapping: {} },
    { id: 'tImg', templateType: 'single', layout: 'fullimage', size: null, hideTitle: false, hideSectionLabels: false, mapping: {}, fields: ['pic'] },
  ], fields: [
    { id: 'f1', key: 'title', label: 'Title', type: 'text', multilingual: true },
    { id: 'f2', key: 'pic', label: 'Pic', type: 'image' },
  ] };
  p.schemas.push(schema);
  for (let i = 0; i < 3; i++) p.records.push({ id: 'r' + i, schemaId: 's1', fieldsHash: '', fields: { title: { en: 'W' + i, vi: '' }, pic: 'http://x/' + i + '.png' } });
  return p;
}

describe('packAllForSchema — multi-view', () => {
  it('packs one card per (record x view)', () => {
    const p = ops.packAllForSchema(projMultiView(), 's1');
    expect(p.cards).toHaveLength(6); // 3 records x 2 views
    expect(p.cards.filter((c) => c.templateId === 'tText')).toHaveLength(3);
    expect(p.cards.filter((c) => c.templateId === 'tImg')).toHaveLength(3);
  });
  it('the "tImg" view\'s cards only include the image (field-selection honored)', () => {
    const p = ops.packAllForSchema(projMultiView(), 's1');
    const imgCard = p.cards.find((c) => c.templateId === 'tImg' && c.recordId === 'r0')!;
    expect(imgCard.layout).toBe('fullimage');
    expect(imgCard.title).toBe('');
    expect(imgCard.images[0]?.url).toBe('http://x/0.png');
  });
  it('re-packing replaces each (record, view) pair without duplicating or touching other views', () => {
    const once = ops.packAllForSchema(projMultiView(), 's1');
    const twice = ops.packAllForSchema(once, 's1');
    expect(twice.cards).toHaveLength(6);
  });
});

describe('regenerateCard — resolves the card\'s OWN view via templateId', () => {
  it('regenerating a "tImg" card rebuilds it through the image view, not the schema\'s first view', () => {
    let p = ops.packAllForSchema(projMultiView(), 's1');
    const imgCard = p.cards.find((c) => c.templateId === 'tImg' && c.recordId === 'r0')!;
    p = { ...p, records: p.records.map((r) => r.id === 'r0' ? { ...r, fields: { ...r.fields, pic: 'http://x/CHANGED.png' } } : r) };
    p = ops.regenerateCard(p, imgCard.id);
    const rebuilt = p.cards.find((c) => c.id === imgCard.id)!;
    expect(rebuilt.layout).toBe('fullimage'); // still the image view's layout
    expect(rebuilt.title).toBe('');           // still field-filtered (no title)
    expect(rebuilt.images[0]?.url).toBe('http://x/CHANGED.png');
  });
});

describe('isCardStale — independent per (record, view) card', () => {
  it('editing a record marks BOTH its views\' cards stale independently; regenerating one leaves the other stale', () => {
    let p = ops.packAllForSchema(projMultiView(), 's1');
    const textCard = p.cards.find((c) => c.templateId === 'tText' && c.recordId === 'r0')!;
    const imgCard = p.cards.find((c) => c.templateId === 'tImg' && c.recordId === 'r0')!;
    p = { ...p, records: p.records.map((r) => r.id === 'r0' ? { ...r, fields: { ...r.fields, title: { en: 'CHANGED', vi: '' } } } : r) };
    expect(ops.isCardStale(p.cards.find((c) => c.id === textCard.id)!, p)).toBe(true);
    expect(ops.isCardStale(p.cards.find((c) => c.id === imgCard.id)!, p)).toBe(true);
    p = ops.regenerateCard(p, textCard.id);
    expect(ops.isCardStale(p.cards.find((c) => c.id === textCard.id)!, p)).toBe(false); // regenerated
    expect(ops.isCardStale(p.cards.find((c) => c.id === imgCard.id)!, p)).toBe(true);   // still stale — untouched
  });
});

describe('templateForCard', () => {
  it('resolves via the card\'s own templateId', () => {
    const p = ops.packAllForSchema(projMultiView(), 's1');
    const imgCard = p.cards.find((c) => c.templateId === 'tImg')!;
    expect(ops.templateForCard(p, imgCard)?.id).toBe('tImg');
  });
  it('falls back to the schema\'s first view when the card\'s templateId no longer exists', () => {
    let p = ops.packAllForSchema(projMultiView(), 's1');
    const card = p.cards.find((c) => c.templateId === 'tImg')!;
    p = { ...p, cards: p.cards.map((c) => (c.id === card.id ? { ...c, templateId: 'gone' } : c)) };
    expect(ops.templateForCard(p, p.cards.find((c) => c.id === card.id)!)?.id).toBe('tText');
  });
  it('returns null when the card\'s source record was deleted', () => {
    let p = ops.packAllForSchema(projMultiView(), 's1');
    const card = p.cards.find((c) => c.recordId === 'r0')!;
    p = { ...p, records: p.records.filter((r) => r.id !== 'r0') };
    expect(ops.templateForCard(p, card)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail.**

Run: `npm test -- cardOps`
Expected: FAIL — packing still yields 3 cards (one per record, first view only); `ops.templateForCard` is not exported.

- [ ] **Step 3: Implement per-view packing in `cardOps.ts`.**

Replace the top of the file (imports + `templateFor` + `packRecords`/`packAllForSchema`/`regenerateCard`) — from:

```ts
import { uid, type Project, type Card, type Schema, type CardTemplate, type CardSection, type CardImage } from './model';
import { deriveAutoTemplate, recordToCard } from './cardMapping';
import { hashFields } from './lib/hash';
import { LAYOUT_SLOTS } from './lib/layouts';

function templateFor(schema: Schema): CardTemplate {
  return schema.cardTemplates[0] ?? deriveAutoTemplate(schema);
}

/** Resolve a card's schema via its source record. */
export function schemaForCard(project: Project, card: Card): Schema | null {
  const rec = project.records.find((r) => r.id === card.recordId);
  if (!rec) return null;
  return project.schemas.find((s) => s.id === rec.schemaId) ?? null;
}

/** Persist one Card per requested record (replacing any existing card for that record). */
export function packRecords(project: Project, schemaId: string, recordIds: string[]): Project {
  const schema = project.schemas.find((s) => s.id === schemaId);
  if (!schema) return project;
  const template = templateFor(schema);

  const wanted = new Set(recordIds);
  const idOrder = project.records.filter((r) => r.schemaId === schemaId && wanted.has(r.id)).map((r) => r.id);

  // Replace existing cards for these specific records.
  const kept = project.cards.filter((c) => !(c.recordId && wanted.has(c.recordId)));

  const newCards: Card[] = idOrder.map((id) => {
    const rec = project.records.find((r) => r.id === id)!;
    const built = recordToCard(rec, schema, template, project.settings, project.activeLocale);
    return { ...built, id: uid('card'), recordId: id, sourceHash: hashFields(project, [id]) };
  });

  return { ...project, cards: [...kept, ...newCards] };
}

export function packAllForSchema(project: Project, schemaId: string): Project {
  const ids = project.records.filter((r) => r.schemaId === schemaId).map((r) => r.id);
  return packRecords(project, schemaId, ids);
}

export function regenerateCard(project: Project, cardId: string): Project {
  const card = project.cards.find((c) => c.id === cardId);
  if (!card || !card.recordId) return project;
  const schema = schemaForCard(project, card);
  if (!schema) return project;
  const template = templateFor(schema);
  const rec = project.records.find((r) => r.id === card.recordId);
  if (!rec) return project;
  const rebuilt = recordToCard(rec, schema, template, project.settings, project.activeLocale);
  const next: Card = { ...rebuilt, id: card.id, sourceHash: hashFields(project, [card.recordId]), edited: false };
  return { ...project, cards: project.cards.map((c) => (c.id === cardId ? next : c)) };
}
```

to:

```ts
import { uid, type Project, type Card, type Schema, type CardTemplate, type CardSection, type CardImage } from './model';
import { deriveAutoTemplate, recordToCard } from './cardMapping';
import { hashFields } from './lib/hash';
import { LAYOUT_SLOTS } from './lib/layouts';

/** A schema's views, in order — its real cardTemplates, or a single derived one if it has none yet. */
function viewsFor(schema: Schema): CardTemplate[] {
  return schema.cardTemplates.length ? schema.cardTemplates : [deriveAutoTemplate(schema)];
}

/** Resolve a card's schema via its source record. */
export function schemaForCard(project: Project, card: Card): Schema | null {
  const rec = project.records.find((r) => r.id === card.recordId);
  if (!rec) return null;
  return project.schemas.find((s) => s.id === rec.schemaId) ?? null;
}

/** Resolve the view (CardTemplate) a card was built from, via its own `templateId`; falls back to
 *  the schema's first view if that id no longer names one of the schema's current views. */
export function templateForCard(project: Project, card: Card): CardTemplate | null {
  const schema = schemaForCard(project, card);
  if (!schema) return null;
  const views = viewsFor(schema);
  return views.find((t) => t.id === card.templateId) ?? views[0];
}

/** Persist one Card per (requested record x schema view) pair, replacing any existing card for that pair. */
export function packRecords(project: Project, schemaId: string, recordIds: string[]): Project {
  const schema = project.schemas.find((s) => s.id === schemaId);
  if (!schema) return project;
  const views = viewsFor(schema);

  const wanted = new Set(recordIds);
  const idOrder = project.records.filter((r) => r.schemaId === schemaId && wanted.has(r.id)).map((r) => r.id);
  const viewIds = new Set(views.map((t) => t.id));

  // Replace existing cards for these records, across any of this schema's views.
  const kept = project.cards.filter((c) => !(c.recordId && wanted.has(c.recordId) && c.templateId && viewIds.has(c.templateId)));

  const newCards: Card[] = [];
  for (const template of views) {
    for (const id of idOrder) {
      const rec = project.records.find((r) => r.id === id)!;
      const built = recordToCard(rec, schema, template, project.settings, project.activeLocale);
      newCards.push({ ...built, id: uid('card'), recordId: id, templateId: template.id, sourceHash: hashFields(project, [id]) });
    }
  }

  return { ...project, cards: [...kept, ...newCards] };
}

export function packAllForSchema(project: Project, schemaId: string): Project {
  const ids = project.records.filter((r) => r.schemaId === schemaId).map((r) => r.id);
  return packRecords(project, schemaId, ids);
}

export function regenerateCard(project: Project, cardId: string): Project {
  const card = project.cards.find((c) => c.id === cardId);
  if (!card || !card.recordId) return project;
  const schema = schemaForCard(project, card);
  if (!schema) return project;
  const template = templateForCard(project, card);
  if (!template) return project;
  const rec = project.records.find((r) => r.id === card.recordId);
  if (!rec) return project;
  const rebuilt = recordToCard(rec, schema, template, project.settings, project.activeLocale);
  const next: Card = { ...rebuilt, id: card.id, templateId: template.id, sourceHash: hashFields(project, [card.recordId]), edited: false };
  return { ...project, cards: project.cards.map((c) => (c.id === cardId ? next : c)) };
}
```

Then in `applyCardToRecords` (further down the file), change:

```ts
  const template = schema.cardTemplates[0] ?? deriveAutoTemplate(schema);
  const capturedImageSlots = LAYOUT_SLOTS[card.layout] ?? LAYOUT_SLOTS[template.layout] ?? imageFields.length;
```

to (resolve the fallback layout through the card's own view, not always the schema's first one):

```ts
  const template = templateForCard(project, card) ?? deriveAutoTemplate(schema);
  const capturedImageSlots = LAYOUT_SLOTS[card.layout] ?? LAYOUT_SLOTS[template.layout] ?? imageFields.length;
```

- [ ] **Step 4: Run the tests to verify they pass.**

Run: `npm test -- cardOps`
Expected: PASS.

- [ ] **Step 5: Run the full suite (existing single-view pack/regenerate/apply tests must be unaffected).**

Run: `npm test`
Expected: green, 0 unhandled.

- [ ] **Step 6: Gates + commit (pack layer).**

Run: `npm run check` (0 errors) → `npm run build` (OK).

```bash
git add src/lib/modules/flashcards/cardOps.ts tests/cardOps.test.ts
git commit -m "feat(flashcards): pack one card per (record x view); regenerate/apply resolve the card's own view"
```

- [ ] **Step 7: Write failing CardGallery multi-view tests.**

In `tests/CardGallery.test.ts`, add:

```ts
describe('CardGallery — multi-view', () => {
  it('shows a view-group per view, each with one thumb per record, when a schema has multiple views', () => {
    const sid = seed('1top-1bot', 3);
    S.addView(sid);
    const { container } = render(CardGallery, { onOpen: vi.fn() });
    const viewGroups = container.querySelectorAll('.view-group');
    expect(viewGroups).toHaveLength(2);
    viewGroups.forEach((vg) => expect(vg.querySelectorAll('.thumb')).toHaveLength(3));
  });
  it('a single-view schema shows no view-name heading (back-compat, unchanged look)', () => {
    seed('1top-1bot', 2);
    const { container } = render(CardGallery, { onOpen: vi.fn() });
    expect(container.querySelector('.view-name')).not.toBeInTheDocument();
  });
  it('Pack all packs every record for every view of the schema', async () => {
    const sid = seed('1top-1bot', 2);
    S.addView(sid);
    const { getByRole } = render(CardGallery, { onOpen: vi.fn() });
    await fireEvent.click(getByRole('button', { name: /pack all/i }));
    expect(get(S.project).cards.length).toBe(4); // 2 records x 2 views
  });
});
```

- [ ] **Step 8: Run the new tests to verify they fail.**

Run: `npm test -- CardGallery`
Expected: FAIL — no `.view-group` elements exist yet (the gallery only ever reads `schema.cardTemplates[0]`).

- [ ] **Step 9: Restructure `CardGallery.svelte` into per-schema groups of per-view subgroups.**

Change the imports line to add `viewLabel`:

```ts
import { deriveAutoTemplate, recordToCard, viewLabel } from '../cardMapping';
```

Replace the `groups` derived (script section) — from:

```ts
  const groups = $derived($project.schemas.map((schema) => {
    const template = schema.cardTemplates[0] ?? deriveAutoTemplate(schema);
    const recs = $project.records.filter((r) => r.schemaId === schema.id);
    const packed = $project.cards.filter((c) => c.recordId && recs.some((r) => r.id === c.recordId));
    const packedIds = new Set(packed.map((c) => c.recordId));
    const autoRecs = recs.filter((r) => !packedIds.has(r.id));
    const schemaEff = resolveStyle($project.settings, template.style);
    const lay = sheetLayout(template, schemaEff.paperSize, schemaEff.orientation);
    const cell = { w: lay.cellW, h: lay.cellH };
    const scale = Math.min(1, THUMB_W / cell.w) * zoom;
    return { schema, template, recs, packed, autoRecs, cell, scale };
  }));
```

to:

```ts
  // Per schema, per VIEW (a schema with no views yet behaves as one auto-derived view — back-compat).
  const groups = $derived($project.schemas.map((schema) => {
    const views = schema.cardTemplates.length ? schema.cardTemplates : [deriveAutoTemplate(schema)];
    const recs = $project.records.filter((r) => r.schemaId === schema.id);
    const viewGroups = views.map((template, i) => {
      const packed = $project.cards.filter((c) => c.templateId === template.id && c.recordId && recs.some((r) => r.id === c.recordId));
      const packedIds = new Set(packed.map((c) => c.recordId));
      const autoRecs = recs.filter((r) => !packedIds.has(r.id));
      const schemaEff = resolveStyle($project.settings, template.style);
      const lay = sheetLayout(template, schemaEff.paperSize, schemaEff.orientation);
      const cell = { w: lay.cellW, h: lay.cellH };
      const scale = Math.min(1, THUMB_W / cell.w) * zoom;
      return { template, viewName: viewLabel(template, schema, i), packed, autoRecs, cell, scale };
    });
    const totalCards = viewGroups.reduce((n, v) => n + v.packed.length + v.autoRecs.length, 0);
    return { schema, recs, views: viewGroups, totalCards };
  }));
```

Replace the gallery markup section — from:

```svelte
    {#each groups as g (g.schema.id)}
      <section class="group">
        <header class="group-head">
          <span class="group-name">{g.schema.name}</span>
          <span class="count">{g.packed.length + g.autoRecs.length} card{g.packed.length + g.autoRecs.length === 1 ? '' : 's'}</span>
          {#if g.recs.length > 0}
            <button type="button" class="pack-all" onclick={() => packAllForSchema(g.schema.id)}>
              <Package size={13} /> Pack all
            </button>
          {/if}
        </header>

        {#if g.packed.length === 0 && g.autoRecs.length === 0}
          <p class="hint">No records in this schema yet.</p>
        {:else}
          <div class="grid">
            <!-- Persisted packed cards (snapshots) -->
            {#each g.packed as card (card.id)}
              {@const stale = isCardStale(card, $project)}
              {@const edited = !!card.edited}
              <div class="thumb packed">
                <button type="button" class="thumb-open" title={packedCaption(card)}
                  onclick={() => card.recordId && onOpen(card.recordId)}>
                  <div class="thumb-frame" style={`width:${Math.round(g.cell.w * g.scale)}px;height:${Math.round(g.cell.h * g.scale)}px;`}>
                    <div class="thumb-scaler" style={`transform:scale(${g.scale});width:${g.cell.w}px;height:${g.cell.h}px;`}>
                      {@html packedHtml(card, g.template, g.cell)}
                    </div>
                  </div>
                </button>
                <div class="thumb-meta">
                  <span class="badge {edited ? 'edited' : stale ? 'stale' : 'synced'}">{edited ? 'Edited' : stale ? 'Stale' : 'Synced'}</span>
                  <button type="button" class="icon-act" aria-label="edit card" title="Edit card"
                    onclick={() => cardEditorOpen.set(card.id)}><Pencil size={13} /></button>
                  {#if edited}
                    <button type="button" class="icon-act" aria-label="apply to records" title="Apply to records"
                      onclick={() => onApply(card.id)}><Upload size={13} /></button>
                  {/if}
                  {#if stale || edited}
                    <button type="button" class="icon-act" aria-label="regenerate" title="Regenerate from records"
                      onclick={() => regenerateCard(card.id)}><RefreshCw size={13} /></button>
                  {/if}
                  <button type="button" class="icon-act danger" aria-label="delete" title="Delete card"
                    onclick={() => deleteCard(card.id)}><Trash2 size={13} /></button>
                </div>
              </div>
            {/each}
            <!-- Auto-derived cards for records not yet packed -->
            {#each g.autoRecs as rec (rec.id)}
              <button type="button" class="thumb auto" title={caption(rec, g.schema)} onclick={() => onOpen(rec.id)}>
                <div class="thumb-frame" style={`width:${Math.round(g.cell.w * g.scale)}px;height:${Math.round(g.cell.h * g.scale)}px;`}>
                  <div class="thumb-scaler" style={`transform:scale(${g.scale});width:${g.cell.w}px;height:${g.cell.h}px;`}>
                    {@html autoHtml(rec, g.schema, g.template, g.cell)}
                  </div>
                </div>
                <span class="thumb-cap">{caption(rec, g.schema)}</span>
              </button>
            {/each}
          </div>
        {/if}
      </section>
    {/each}
```

to:

```svelte
    {#each groups as g (g.schema.id)}
      <section class="group">
        <header class="group-head">
          <span class="group-name">{g.schema.name}</span>
          <span class="count">{g.totalCards} card{g.totalCards === 1 ? '' : 's'}</span>
          {#if g.recs.length > 0}
            <button type="button" class="pack-all" onclick={() => packAllForSchema(g.schema.id)}>
              <Package size={13} /> Pack all
            </button>
          {/if}
        </header>

        {#if g.recs.length === 0}
          <p class="hint">No records in this schema yet.</p>
        {:else}
          {#each g.views as v (v.template.id)}
            <div class="view-group">
              {#if g.views.length > 1}<h4 class="view-name">{v.viewName}</h4>{/if}
              <div class="grid">
                <!-- Persisted packed cards (snapshots) -->
                {#each v.packed as card (card.id)}
                  {@const stale = isCardStale(card, $project)}
                  {@const edited = !!card.edited}
                  <div class="thumb packed">
                    <button type="button" class="thumb-open" title={packedCaption(card)}
                      onclick={() => card.recordId && onOpen(card.recordId)}>
                      <div class="thumb-frame" style={`width:${Math.round(v.cell.w * v.scale)}px;height:${Math.round(v.cell.h * v.scale)}px;`}>
                        <div class="thumb-scaler" style={`transform:scale(${v.scale});width:${v.cell.w}px;height:${v.cell.h}px;`}>
                          {@html packedHtml(card, v.template, v.cell)}
                        </div>
                      </div>
                    </button>
                    <div class="thumb-meta">
                      <span class="badge {edited ? 'edited' : stale ? 'stale' : 'synced'}">{edited ? 'Edited' : stale ? 'Stale' : 'Synced'}</span>
                      <button type="button" class="icon-act" aria-label="edit card" title="Edit card"
                        onclick={() => cardEditorOpen.set(card.id)}><Pencil size={13} /></button>
                      {#if edited}
                        <button type="button" class="icon-act" aria-label="apply to records" title="Apply to records"
                          onclick={() => onApply(card.id)}><Upload size={13} /></button>
                      {/if}
                      {#if stale || edited}
                        <button type="button" class="icon-act" aria-label="regenerate" title="Regenerate from records"
                          onclick={() => regenerateCard(card.id)}><RefreshCw size={13} /></button>
                      {/if}
                      <button type="button" class="icon-act danger" aria-label="delete" title="Delete card"
                        onclick={() => deleteCard(card.id)}><Trash2 size={13} /></button>
                    </div>
                  </div>
                {/each}
                <!-- Auto-derived cards for records not yet packed (for this view) -->
                {#each v.autoRecs as rec (rec.id)}
                  <button type="button" class="thumb auto" title={caption(rec, g.schema)} onclick={() => onOpen(rec.id)}>
                    <div class="thumb-frame" style={`width:${Math.round(v.cell.w * v.scale)}px;height:${Math.round(v.cell.h * v.scale)}px;`}>
                      <div class="thumb-scaler" style={`transform:scale(${v.scale});width:${v.cell.w}px;height:${v.cell.h}px;`}>
                        {@html autoHtml(rec, g.schema, v.template, v.cell)}
                      </div>
                    </div>
                    <span class="thumb-cap">{caption(rec, g.schema)}</span>
                  </button>
                {/each}
              </div>
            </div>
          {/each}
        {/if}
      </section>
    {/each}
```

Add CSS for the new heading (near the existing `.group`/`.group-head` rules):

```css
  .view-group { display:flex; flex-direction:column; gap:8px; }
  .view-name { margin:0; font-size:11px; font-weight:700; letter-spacing:.04em; text-transform:uppercase;
    color:var(--text-muted); }
```

- [ ] **Step 10: Run the tests to verify they pass.**

Run: `npm test -- CardGallery`
Expected: PASS.

- [ ] **Step 11: Run the full suite + gates + commit.**

Run: `npm test` (green, 0 unhandled) → `npm run check` (0 errors) → `npm run build` (OK).

```bash
git add src/lib/modules/flashcards/components/CardGallery.svelte tests/CardGallery.test.ts
git commit -m "feat(flashcards): CardGallery groups cards by (schema x view)"
```

---

## Task 4: Preview — all views side by side + view bar + active view

**Files:**
- Modify: `src/lib/modules/flashcards/components/CardPreview.svelte`
- Test: `tests/CardPreview.test.ts`

**Interfaces:**
- Consumes: `activeViewId`, `selectView`, `setTemplateLayout`, `addView` (Task 2, `stores.ts`); `viewLabel`, `deriveAutoTemplate`, `recordToCard`, `chunkRecords` (Task 1/existing, `cardMapping.ts`); `buildCardHTML`, `buildSheetHTML`, `sheetLayout`, `getPaperPx` (`lib/card-render.ts`); `resolveStyle` (`lib/style.ts`).
- Produces: no new exports (leaf component) — its `onLayout`/view-bar wiring is the reference pattern Task 5 (StyleControls) mirrors for resolving "the active view".

- [ ] **Step 1: Write failing CardPreview view tests.**

In `tests/CardPreview.test.ts`, add:

```ts
describe('CardPreview — views', () => {
  it('shows a "View 1" chip by default (single implicit view) and exactly one .fc-card', () => {
    const { container } = render(CardPreview);
    expect(screen.getByRole('tab', { name: 'View 1' })).toBeInTheDocument();
    expect(container.querySelectorAll('.fc-card')).toHaveLength(1);
  });

  it('Add view (+) adds a 2nd view, shown side by side, and makes it active', async () => {
    const { container } = render(CardPreview);
    await fireEvent.click(screen.getByRole('button', { name: 'Add view' }));
    expect(container.querySelectorAll('.fc-card')).toHaveLength(2);
    expect(screen.getByRole('tab', { name: 'View 2' })).toHaveAttribute('aria-selected', 'true');
  });

  it('clicking a view chip makes it active; the layout dropdown then targets that view only', async () => {
    const sid = get(S.project).schemas[0].id;
    render(CardPreview);
    await fireEvent.click(screen.getByRole('button', { name: 'Add view' })); // active view is now View 2
    await fireEvent.click(screen.getByRole('tab', { name: 'View 1' }));       // switch back to View 1
    await fireEvent.change(screen.getByLabelText(/layout/i), { target: { value: '2x2' } });
    const tpls = get(S.project).schemas.find((s) => s.id === sid)!.cardTemplates;
    expect(tpls[0].layout).toBe('2x2');
    expect(tpls[1].layout).not.toBe('2x2');
  });

  it('Sheet mode shows exactly one sheet (the active view\'s), even with 2 views', async () => {
    render(CardPreview);
    await fireEvent.click(screen.getByRole('button', { name: 'Add view' }));
    await fireEvent.click(screen.getByRole('tab', { name: 'Sheet' }));
    expect(document.querySelectorAll('.fc-sheet')).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail.**

Run: `npm test -- CardPreview`
Expected: FAIL — no view bar/chips exist yet.

- [ ] **Step 3: Implement the view bar + multi-column card row + active-view targeting.**

Change the imports:

```ts
import '../lib/card-render.css';
import Palette from 'lucide-svelte/icons/palette';
import ImageIcon from 'lucide-svelte/icons/image';
import Plus from 'lucide-svelte/icons/plus';
import { project, selectedRecordId, activeViewId, selectView, setSettings, setTemplateLayout, addView } from '../stores';
import { deriveAutoTemplate, recordToCard, chunkRecords, viewLabel } from '../cardMapping';
import { buildCardHTML, buildSheetHTML, getPaperPx, sheetLayout } from '../lib/card-render';
import { resolveStyle } from '../lib/style';
import { LAYOUTS } from '../lib/layouts';
import { zoomStep } from '../lib/zoom';
import StyleControls from './StyleControls.svelte';
import EmptyState from './EmptyState.svelte';
import type { Card } from '../model';
```

Replace the `record`..`cardHtml` derived block (lines 22-80) with:

```ts
  const record = $derived($project.records.find((r) => r.id === $selectedRecordId) ?? null);
  const schema = $derived(record ? ($project.schemas.find((s) => s.id === record.schemaId) ?? null) : null);
  // Every view of the schema (>=1 — auto-derived if the schema has no cardTemplates yet).
  const views = $derived(schema ? (schema.cardTemplates.length ? schema.cardTemplates : [deriveAutoTemplate(schema)]) : []);
  // The view every control below targets. Falls back to the schema's first view whenever the stored
  // id doesn't name one of THIS schema's views (fresh project, or the record just switched schema).
  const resolvedActiveId = $derived(views.find((v) => v.id === $activeViewId)?.id ?? views[0]?.id ?? null);
  const template = $derived(views.find((v) => v.id === resolvedActiveId) ?? null);

  const selectedCard = $derived(record && template ? ($project.cards.find((c) => c.recordId === record.id && c.templateId === template.id) ?? null) : null);
  const schemaEff = $derived(template ? resolveStyle($project.settings, template.style) : $project.settings);
  const eff = $derived(template ? resolveStyle(schemaEff, selectedCard?.style) : $project.settings);
  const orient = $derived(eff.orientation);
  const lay = $derived(template ? sheetLayout(template, eff.paperSize, orient) : null);

  // A single card is one CELL of the sheet — its real cut size (e.g. A4/3 for a 3-up sheet),
  // NOT the full sheet. cellW/cellH come from `lay`; for cardsPerPage=1 the cell IS the full sheet.
  const cellPx = $derived(lay ? { w: lay.cellW, h: lay.cellH } : getPaperPx(template?.size || eff.paperSize, orient));
  // Sheet-mode frame sizes from `lay` (single source of truth, consistent with the grid);
  // card mode from the cell size, so what you see is the actual card you'll cut out.
  const paper = $derived(mode === 'sheet' && lay ? { w: lay.sheetW, h: lay.sheetH } : cellPx);
  const fitScale = $derived(Math.max(0.05, Math.min(1, (paneW - 40) / paper.w)));
  const scale = $derived(userZoom ?? fitScale);
```

Keep `zoomPan(node)` exactly as-is. After it, replace the old `cardHtml`/`schemaCards`/`sheetChunk`/`sheetHtml`/`displayHtml`/`onLayout` block with:

```ts
  // One rendered card per view, side by side — each at ITS OWN resolved style/cell size (so an
  // Image-only view and a Content-only view keep their real proportions, not the active view's).
  const viewCards = $derived.by(() => {
    if (!record || !schema) return [] as { id: string; label: string; html: string; cellPx: { w: number; h: number } }[];
    return views.map((v, i) => {
      const vCard = $project.cards.find((c) => c.recordId === record.id && c.templateId === v.id) ?? null;
      const vSchemaEff = resolveStyle($project.settings, v.style);
      const vEff = resolveStyle(vSchemaEff, vCard?.style);
      const vLay = sheetLayout(v, vEff.paperSize, vEff.orientation);
      const vCellPx = { w: vLay.cellW, h: vLay.cellH };
      const html = buildCardHTML(recordToCard(record, schema, v, $project.settings, $project.activeLocale), vEff, $project.activeLocale, false, vCellPx);
      return { id: v.id, label: viewLabel(v, schema, i), html, cellPx: vCellPx };
    });
  });
  // Each column fits within an equal share of the pane's width; explicit userZoom overrides all columns.
  const colBudget = $derived(Math.max(80, (paneW - 40 - Math.max(0, views.length - 1) * 16) / Math.max(1, views.length)));
  function colScale(cellW: number): number { return Math.max(0.05, Math.min(1, colBudget / cellW)); }

  // Sheet mode: every record of the schema mapped through the ACTIVE view (packed-or-derived, same
  // as collectPrintSheets does per view), chunked by that view's resolved per-page count.
  const schemaCards = $derived.by(() => {
    if (!schema || !template) return [] as Card[];
    return $project.records
      .filter((r) => r.schemaId === schema.id)
      .map((r) => $project.cards.find((c) => c.recordId === r.id && c.templateId === template.id) ??
        recordToCard(r, schema, template, $project.settings, $project.activeLocale));
  });
  const sheetChunk = $derived.by(() => {
    if (!lay || !record) return [] as Card[];
    const chunks = chunkRecords(schemaCards, lay.perPage);
    return chunks.find((chunk) => chunk.some((c) => c.recordId === record.id)) ?? chunks[0] ?? [];
  });
  const sheetHtml = $derived.by(() => {
    if (!lay) return '';
    return buildSheetHTML(sheetChunk, lay, schemaEff, $project.activeLocale);
  });

  function onLayout(e: Event) {
    if (schema && template) setTemplateLayout(schema.id, { layout: (e.target as HTMLSelectElement).value }, template.id);
  }
  function onAddView() {
    if (schema) addView(schema.id);
  }
```

Replace the template (from `<div class="preview" bind:clientWidth={paneW}>` through the closing `</div>` of that root) with:

```svelte
<div class="preview" bind:clientWidth={paneW}>
  <header class="preview-toolbar">
    <label>Layout
      <select value={template?.layout ?? 'fulltext'} onchange={onLayout} disabled={!schema}>
        {#each LAYOUTS as l (l.id)}<option value={l.id}>{l.label}</option>{/each}
      </select>
    </label>
    <label>Paper
      <select value={$project.settings.paperSize} onchange={(e) => setSettings({ paperSize: (e.target as HTMLSelectElement).value as any })}>
        {#each ['A4','A5','A6','Letter'] as p (p)}<option value={p}>{p}</option>{/each}
      </select>
    </label>
    <button type="button" class:on={$project.settings.orientation === 'landscape'}
      onclick={() => setSettings({ orientation: $project.settings.orientation === 'portrait' ? 'landscape' : 'portrait' })}>
      {$project.settings.orientation === 'landscape' ? 'Landscape' : 'Portrait'}
    </button>
    <button type="button" class="style-toggle" class:on={showStyle} aria-label="style" onclick={() => (showStyle = !showStyle)}>
      <Palette size={15} />
    </button>
  </header>

  {#if schema}
    <div class="view-bar" role="tablist" aria-label="Views">
      {#each views as v, i (v.id)}
        <button type="button" role="tab" aria-selected={v.id === resolvedActiveId} class:on={v.id === resolvedActiveId}
          onclick={() => selectView(v.id)}>{viewLabel(v, schema, i)}</button>
      {/each}
      <button type="button" class="add-view" aria-label="Add view" onclick={onAddView}><Plus size={13} /></button>
    </div>
  {/if}

  {#if showStyle}<StyleControls />{/if}

  {#if record && schema}
    {#if mode === 'card'}
      <div class="preview-scroll views-row" class:panable={userZoom !== null} class:grabbing={dragging} use:zoomPan
        title="Ctrl/⌘ + scroll to zoom · drag to pan · double-click to fit">
        {#each viewCards as vc (vc.id)}
          {@const vScale = userZoom ?? colScale(vc.cellPx.w)}
          <div class="view-col">
            <span class="view-col-label">{vc.label}</span>
            <div class="preview-frame" style={`width:${Math.round(vc.cellPx.w * vScale)}px;height:${Math.round(vc.cellPx.h * vScale)}px;`}>
              <div class="preview-scaler" style={`transform:scale(${vScale});width:${vc.cellPx.w}px;height:${vc.cellPx.h}px;`}>
                {@html vc.html}
              </div>
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <div class="preview-scroll" class:panable={userZoom !== null} class:grabbing={dragging} use:zoomPan
        title="Ctrl/⌘ + scroll to zoom · drag to pan · double-click to fit">
        <div class="preview-frame" style={`width:${Math.round(paper.w * scale)}px;height:${Math.round(paper.h * scale)}px;`}>
          <div class="preview-scaler" style={`transform:scale(${scale});width:${paper.w}px;height:${paper.h}px;`}>
            {@html sheetHtml}
          </div>
        </div>
      </div>
    {/if}
    <footer class="preview-statusbar">
      <div class="seg" role="tablist" aria-label="Preview mode">
        <button type="button" role="tab" aria-selected={mode === 'card'} class:on={mode === 'card'} onclick={() => (mode = 'card')}>Card</button>
        <button type="button" role="tab" aria-selected={mode === 'sheet'} class:on={mode === 'sheet'} onclick={() => (mode = 'sheet')}>Sheet</button>
      </div>
      <span class="sb-info" title="{mode === 'sheet' ? 'Sheet' : 'Card'} size at 100%">
        {eff.paperSize} · {orient === 'landscape' ? 'landscape' : 'portrait'} · {paper.w}×{paper.h}px
      </span>
      <div class="zoom-controls" role="group" aria-label="Zoom">
        <button type="button" aria-label="Zoom out" onclick={() => (userZoom = zoomStep(scale, 1))}>−</button>
        <button type="button" class="zoom-pct" class:auto={userZoom === null}
          title="Fit to pane" aria-label="Fit to pane" onclick={() => (userZoom = null)}>{Math.round(scale * 100)}%</button>
        <button type="button" aria-label="Zoom in" onclick={() => (userZoom = zoomStep(scale, -1))}>+</button>
      </div>
    </footer>
  {:else}
    <EmptyState icon={ImageIcon} title="No card to preview"
      hint="Select a record on the left to see its card here." />
  {/if}
</div>
```

Add CSS (near the existing `.preview-toolbar` rules):

```css
  .view-bar { display:flex; align-items:center; gap:4px; flex-wrap:wrap; padding:6px 12px;
    background:var(--surface); border-bottom:1px solid var(--border); }
  .view-bar button[role=tab] { border:1px solid var(--border); background:var(--bg); color:var(--text-muted);
    border-radius:999px; padding:3px 10px; font:inherit; font-size:11px; cursor:pointer;
    transition:background .12s ease, color .12s ease, border-color .12s ease; }
  .view-bar button[role=tab]:hover:not(.on) { background:var(--accent-weak); color:var(--accent); }
  .view-bar button[role=tab].on { background:var(--accent); color:#fff; border-color:var(--accent); }
  .view-bar button[role=tab]:focus-visible { outline:2px solid var(--accent); outline-offset:1px; }
  .add-view { border:1px dashed var(--border); background:transparent; color:var(--text-muted);
    border-radius:999px; width:22px; height:22px; display:inline-flex; align-items:center; justify-content:center;
    cursor:pointer; transition:border-color .12s ease, color .12s ease; }
  .add-view:hover { border-color:var(--accent); color:var(--accent); }
  .add-view:focus-visible { outline:2px solid var(--accent); outline-offset:1px; }

  .preview-scroll.views-row { flex-wrap:wrap; gap:16px; justify-content:flex-start; }
  .view-col { display:flex; flex-direction:column; align-items:center; gap:6px; }
  .view-col-label { font-size:11px; font-weight:600; color:var(--text-muted); }
```

- [ ] **Step 4: Run the tests to verify they pass.**

Run: `npm test -- CardPreview`
Expected: PASS — including the pre-existing tests (`'renders a card for the selected record'`, `'Sheet toggle renders a .fc-sheet'`, `'Fixed: changing Cards/page...'`, etc.), since with a single implicit view `views.length === 1` and `template` resolves to that one view exactly as `cardTemplates[0]` did before.

- [ ] **Step 5: Run the full suite + gates + commit.**

Run: `npm test` (green, 0 unhandled) → `npm run check` (0 errors) → `npm run build` (OK).

```bash
git add src/lib/modules/flashcards/components/CardPreview.svelte tests/CardPreview.test.ts
git commit -m "feat(flashcards): CardPreview shows all views side by side with a view bar (add/select)"
```

---

## Task 5: StyleControls "This view" + field-selection checklist

**Files:**
- Modify: `src/lib/modules/flashcards/components/StyleControls.svelte`
- Test: `tests/StyleControls.test.ts`

**Interfaces:**
- Consumes: `activeViewId`, `setTemplateLayout`, `setTemplateStyle`, `clearStyleOverride`, `resetScopeStyle`, `setViewFields` (Task 2, `stores.ts`); `viewLabel`, `deriveAutoTemplate` (Task 1, `cardMapping.ts`).
- Produces: no new exports (leaf component).

- [ ] **Step 1: Rename "This type" → "This view" everywhere in the test file.**

In `tests/StyleControls.test.ts`, replace every occurrence of the string `'This type'` with `'This view'` (8 occurrences: the two disabled-tab checks, the 3 `fireEvent.click(screen.getByRole('tab', { name: 'This type' }))` calls in the reset / scope-hint / reset-all tests, the `'This type — Border width...'` test title, and the `'Reset all This type overrides'` aria-label lookup). For example:

```ts
it('This type / This card are disabled until a schema / packed card exist', () => {
  render(StyleControls);
  expect(screen.getByRole('tab', { name: 'This type' })).toBeDisabled();
  expect(screen.getByRole('tab', { name: 'This card' })).toBeDisabled();
});
```

becomes:

```ts
it('This view / This card are disabled until a schema / packed card exist', () => {
  render(StyleControls);
  expect(screen.getByRole('tab', { name: 'This view' })).toBeDisabled();
  expect(screen.getByRole('tab', { name: 'This card' })).toBeDisabled();
});
```

and:

```ts
const resetAll = screen.getByRole('button', { name: 'Reset all This type overrides' });
```

becomes:

```ts
const resetAll = screen.getByRole('button', { name: 'Reset all This view overrides' });
```

Apply the same rename to the `'This type — Border width writes to template.style, not settings'` test title (→ `'This view — ...'`) and every `getByRole('tab', { name: 'This type' })` call inside the `'reset at This type scope...'`, `'the scope hint names the active type...'`, and `'reset-all is disabled...'` tests.

- [ ] **Step 2: Write the failing field-selection + multi-view-targeting tests.**

Append to `tests/StyleControls.test.ts`:

```ts
describe('StyleControls — Fields checklist (per view)', () => {
  it('a per-schema field checklist toggles the active view\'s template.fields', async () => {
    const sid = S.addSchema('Words');
    S.updateSchema(sid, { fields: [
      { id: 'f1', key: 'title', label: 'Title', type: 'text', multilingual: true },
      { id: 'f2', key: 'def', label: 'Def', type: 'text', multilingual: true },
    ] });
    S.addRecord(sid);
    render(StyleControls);
    await tab('Fields');
    await fireEvent.click(screen.getByLabelText('Def'));
    const tpl = get(S.project).schemas[0].cardTemplates[0];
    expect(tpl.fields).toEqual(['title']); // unchecking Def from "all" leaves Title only
  });

  it('re-checking a field adds it back to the explicit selection', async () => {
    const sid = S.addSchema('Words');
    S.updateSchema(sid, { fields: [
      { id: 'f1', key: 'title', label: 'Title', type: 'text', multilingual: true },
      { id: 'f2', key: 'def', label: 'Def', type: 'text', multilingual: true },
    ] });
    S.addRecord(sid);
    render(StyleControls);
    await tab('Fields');
    await fireEvent.click(screen.getByLabelText('Def'));   // -> ['title']
    await fireEvent.click(screen.getByLabelText('Def'));   // re-check -> ['title', 'def']
    expect(get(S.project).schemas[0].cardTemplates[0].fields).toEqual(['title', 'def']);
  });

  it('the field checklist targets the active view, leaving other views\' selection untouched', async () => {
    const sid = S.addSchema('Words');
    S.updateSchema(sid, { fields: [
      { id: 'f1', key: 'title', label: 'Title', type: 'text', multilingual: true },
      { id: 'f2', key: 'def', label: 'Def', type: 'text', multilingual: true },
    ] });
    S.addRecord(sid);
    S.setTemplateLayout(sid, { layout: 'fulltext' }); // creates view 1
    S.addView(sid);                                   // view 2, becomes active
    render(StyleControls);
    await tab('Fields');
    await fireEvent.click(screen.getByLabelText('Def'));
    const tpls = get(S.project).schemas[0].cardTemplates;
    expect(tpls[1].fields).toEqual(['title']); // active (view 2) changed
    expect(tpls[0].fields).toBeUndefined();    // view 1 untouched
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail.**

Run: `npm test -- StyleControls`
Expected: FAIL — `'This type'` no longer matches any rendered tab (already renamed in the test file, not yet in the component); no `Def`/`Title` field checkboxes exist in the Fields tab.

- [ ] **Step 4: Retarget `StyleControls.svelte` to the active view + add the field checklist.**

Change the store import to add `activeViewId`/`setViewFields`:

```ts
import {
  project, selectedRecordId, activeViewId, setSettings, setTemplateLayout,
  setTemplateStyle, setCardStyle, clearStyleOverride, resetScopeStyle, setViewFields,
} from '../stores';
import { deriveAutoTemplate, viewLabel } from '../cardMapping';
```

Replace the `record`/`schema`/`template`/`card` derived block:

```ts
  const record = $derived($project.records.find((r) => r.id === $selectedRecordId) ?? null);
  const schema = $derived(record ? ($project.schemas.find((x) => x.id === record.schemaId) ?? null) : null);
  const template = $derived(schema ? (schema.cardTemplates[0] ?? deriveAutoTemplate(schema)) : null);
  const card = $derived(record ? ($project.cards.find((c) => c.recordId === record.id) ?? null) : null);
```

with:

```ts
  const record = $derived($project.records.find((r) => r.id === $selectedRecordId) ?? null);
  const schema = $derived(record ? ($project.schemas.find((x) => x.id === record.schemaId) ?? null) : null);
  // Every view of the schema, and the one this panel edits — same fallback rule CardPreview uses,
  // so both stay in sync via the shared activeViewId store.
  const views = $derived(schema ? (schema.cardTemplates.length ? schema.cardTemplates : [deriveAutoTemplate(schema)]) : []);
  const template = $derived(views.find((v) => v.id === $activeViewId) ?? views[0] ?? null);
  const activeViewName = $derived(schema && template ? viewLabel(template, schema, Math.max(0, views.findIndex((v) => v.id === template!.id))) : '');
  // The selected record's packed card FOR THE ACTIVE VIEW — style overrides can only be written
  // onto a real card, so "This card" scope is only available once one exists for this view.
  const card = $derived(record && template ? ($project.cards.find((c) => c.recordId === record.id && c.templateId === template.id) ?? null) : null);
```

Update `write`/`resetOverride`/`resetScope` to pass `template.id`:

```ts
  function write(patch: StyleOverrides): void {
    if (scope === 'global') setSettings(patch);
    else if (scope === 'schema' && schema && template) setTemplateStyle(schema.id, patch, template.id);
    else if (scope === 'card' && card) setCardStyle(card.id, patch);
  }
```

```ts
  function resetOverride(key: keyof StyleOverrides): void {
    if (scope === 'schema' && schema && template) clearStyleOverride('schema', schema.id, key, template.id);
    else if (scope === 'card' && card) clearStyleOverride('card', card.id, key);
  }
```

```ts
  function resetScope(): void {
    if (scope === 'schema' && schema && template) resetScopeStyle('schema', schema.id, template.id);
    else if (scope === 'card' && card) resetScopeStyle('card', card.id);
  }
```

Update `scopeHint` (schema branch names the view, or "schema · view" once there's more than one):

```ts
  const scopeHint = $derived(
    scope === 'global'
      ? 'Base style — applies to every card.'
      : scope === 'schema'
        ? `“${schema ? (views.length > 1 ? `${schema.name} · ${activeViewName}` : schema.name) : 'this view'}” · blank fields inherit Global`
        : 'This card only · blank fields inherit its view',
  );
```

Update `onImageHeight`/`onAutoFitMode`/`onCardsPerPage`/`onCardSize`/`onShowTitle`/`onShowLabels` to pass `template.id` and guard on `template`:

```ts
  function onImageHeight(e: Event) {
    if (!schema || !template) return;
    const v = Math.round(Number((e.target as HTMLInputElement).value)) || 50;
    setTemplateLayout(schema.id, { imageHeightPercent: Math.min(95, Math.max(5, v)) }, template.id);
  }
```
```ts
  function onAutoFitMode(autoFit: boolean) {
    if (schema && template) setTemplateLayout(schema.id, { autoFit }, template.id);
  }
  function onCardsPerPage(e: Event) {
    if (schema && template) setTemplateLayout(schema.id, { cardsPerPage: Number((e.target as HTMLSelectElement).value), autoFit: false }, template.id);
  }
  function onCardSize(e: Event) {
    if (schema && template) setTemplateLayout(schema.id, { cardSize: (e.target as HTMLSelectElement).value as any, autoFit: true }, template.id);
  }
  function onShowTitle(e: Event) {
    if (schema && template) setTemplateLayout(schema.id, { hideTitle: !(e.target as HTMLInputElement).checked }, template.id);
  }
  function onShowLabels(e: Event) {
    if (schema && template) setTemplateLayout(schema.id, { hideSectionLabels: !(e.target as HTMLInputElement).checked }, template.id);
  }
  function onToggleField(key: string): void {
    if (!schema || !template) return;
    const allKeys = schema.fields.map((f) => f.key);
    const cur = template.fields?.length ? template.fields : allKeys;
    const next = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key];
    setViewFields(schema.id, template.id, next);
  }
```

Rename the "This type" tab button:

```svelte
      <button type="button" role="tab" aria-selected={scope === 'schema'} class:on={scope === 'schema'}
        disabled={!schema} onclick={() => (scope = 'schema')}><Layers size={13} />This view</button>
```

Update the "Reset all" aria-label:

```svelte
        aria-label={`Reset all ${scope === 'schema' ? 'This view' : 'This card'} overrides`}
```

Add the field checklist to the Fields tab panel — from:

```svelte
    {:else}
      <div class="toolbar">
        <label class="tool" title="Show the card title (the record's first text field)">
          <input type="checkbox" aria-label="Show title" checked={!template?.hideTitle} disabled={!schema} onchange={onShowTitle} /> Title
        </label>
        <label class="tool" title="Show the “• label:” prefix before each field's value">
          <input type="checkbox" aria-label="Show field labels" checked={!template?.hideSectionLabels} disabled={!schema} onchange={onShowLabels} /> Labels
        </label>
      </div>
    {/if}
```

to:

```svelte
    {:else}
      <div class="toolbar">
        <label class="tool" title="Show the card title (the record's first text field)">
          <input type="checkbox" aria-label="Show title" checked={!template?.hideTitle} disabled={!schema} onchange={onShowTitle} /> Title
        </label>
        <label class="tool" title="Show the “• label:” prefix before each field's value">
          <input type="checkbox" aria-label="Show field labels" checked={!template?.hideSectionLabels} disabled={!schema} onchange={onShowLabels} /> Labels
        </label>
      </div>
      {#if schema}
        <div class="field-checklist" role="group" aria-label="Fields in this view">
          <span class="field-checklist-label">Fields in this view</span>
          <div class="toolbar">
            {#each schema.fields as f (f.key)}
              <label class="tool">
                <input type="checkbox" aria-label={f.label}
                  checked={(template?.fields?.length ?? 0) === 0 ? true : template!.fields!.includes(f.key)}
                  onchange={() => onToggleField(f.key)} /> {f.label}
              </label>
            {/each}
          </div>
        </div>
      {/if}
    {/if}
```

Add CSS (near `.scope-hint`):

```css
  .field-checklist { padding:8px 10px 0; border-top:1px solid var(--border); margin-top:8px; }
  .field-checklist-label { display:block; font-size:10px; font-weight:700; letter-spacing:.06em;
    text-transform:uppercase; color:var(--text-muted); margin-bottom:6px; }
```

- [ ] **Step 5: Run the tests to verify they pass.**

Run: `npm test -- StyleControls`
Expected: PASS.

- [ ] **Step 6: Run the full suite (CardPreview embeds StyleControls — verify no regression there) + gates + commit.**

Run: `npm test` (green, 0 unhandled) → `npm run check` (0 errors) → `npm run build` (OK).

```bash
git add src/lib/modules/flashcards/components/StyleControls.svelte tests/StyleControls.test.ts
git commit -m "feat(flashcards): StyleControls 'This view' scope + per-view field-selection checklist"
```

---

## Task 6: Print/PDF grouped-by-view + leftover-page merge

**Files:**
- Modify: `src/lib/modules/flashcards/lib/printCards.ts`
- Test: `tests/printCards.test.ts`

**Interfaces:**
- Consumes: `deriveAutoTemplate`, `recordToCard`, `chunkRecords` (Task 1/existing, `cardMapping.ts`); `sheetLayout` (`lib/card-render.ts`); `resolveStyle` (`lib/style.ts`).
- Produces: `collectPrintCards(project): Card[]` (now record x view, unchanged signature); `collectPrintSheets(project): Sheet[]` (now grouped-by-view + leftover-merged, unchanged signature — `components/PrintView.svelte` and `lib/pdfExport.ts` need **no code changes**, since both only call `collectPrintSheets`); new pure `mergeLeftoverSheets(sheets: Sheet[]): Sheet[]`.

- [ ] **Step 1: Write the failing tests — multi-view grouping, leftover merge, and a direct unit test of `mergeLeftoverSheets`.**

In `tests/printCards.test.ts`, add a views-per-schema fixture and new describe blocks after the existing ones:

```ts
import { collectPrintCards, collectPrintSheets, mergeLeftoverSheets, type Sheet } from '../src/lib/modules/flashcards/lib/printCards';
import { sheetLayout } from '../src/lib/modules/flashcards/lib/card-render';

function projViews(views: Array<Partial<CardTemplate> & { layout: string }>, n: number): Project {
  const p = newProject();
  const schema: Schema = {
    id: 's1', name: 'W',
    cardTemplates: views.map((v, i) => ({ id: 't' + i, templateType: 'single', size: null, orientation: undefined,
      hideTitle: false, hideSectionLabels: false, mapping: {}, ...v })),
    fields: [{ id: 'f1', key: 'title', label: 'T', type: 'text', multilingual: true }],
  };
  p.schemas.push(schema);
  for (let i = 0; i < n; i++) p.records.push({ id: 'r' + i, schemaId: 's1', fieldsHash: '', fields: { title: { en: 'W' + i, vi: '' } } });
  return p;
}

function schemaWithCardsPerPage(id: string, cardsPerPage: number): Schema {
  return {
    id, name: id,
    cardTemplates: [{ id: id + '-t', templateType: 'single', layout: 'fulltext', size: null, cardsPerPage, mapping: {} }],
    fields: [{ id: 'f1', key: 'title', label: 'T', type: 'text', multilingual: true }],
  };
}

describe('collectPrintCards — multi-view', () => {
  it('one card per (record x view), grouped by view then record', () => {
    const p = projViews([{ layout: 'fulltext' }, { layout: 'fullimage' }], 3);
    const cards = collectPrintCards(p);
    expect(cards).toHaveLength(6);
    expect(cards.slice(0, 3).every((c) => c.layout === 'fulltext')).toBe(true);
    expect(cards.slice(3, 6).every((c) => c.layout === 'fullimage')).toBe(true);
  });
});

describe('collectPrintSheets — grouped by view', () => {
  it('emits all of view 1\'s sheets before any of view 2\'s (no leftover merge needed — both evenly divide)', () => {
    const p = projViews([
      { layout: 'fulltext', cardsPerPage: 2 },
      { layout: 'fullimage', cardsPerPage: 2 },
    ], 4); // each view: 4 records / 2 per page = 2 full sheets, no partials
    const sheets = collectPrintSheets(p);
    expect(sheets).toHaveLength(4);
    expect(sheets[0].cards.every((c) => c.layout === 'fulltext')).toBe(true);
    expect(sheets[1].cards.every((c) => c.layout === 'fulltext')).toBe(true);
    expect(sheets[2].cards.every((c) => c.layout === 'fullimage')).toBe(true);
    expect(sheets[3].cards.every((c) => c.layout === 'fullimage')).toBe(true);
  });

  it('merges same-layout trailing partials from two views into fewer combined pages', () => {
    const p = newProject();
    p.schemas.push(schemaWithCardsPerPage('sA', 4), schemaWithCardsPerPage('sB', 4));
    for (let i = 0; i < 5; i++) p.records.push({ id: 'a' + i, schemaId: 'sA', fieldsHash: '', fields: { title: { en: 'A' + i, vi: '' } } });
    for (let i = 0; i < 3; i++) p.records.push({ id: 'b' + i, schemaId: 'sB', fieldsHash: '', fields: { title: { en: 'B' + i, vi: '' } } });
    const sheets = collectPrintSheets(p);
    // sA: 5/4 -> 1 full(4) + 1 partial(1). sB: 3/4 -> 1 partial(3). Same layout key (fulltext/A5/portrait/4-up).
    expect(sheets).toHaveLength(2);
    expect(sheets[0].cards).toHaveLength(4); // sA's own full sheet — untouched, unreshuffled
    expect(sheets[1].cards).toHaveLength(4); // merged partial page: 1 (sA leftover) + 3 (sB)
  });

  it('does not merge partials with a different layout (different cardsPerPage)', () => {
    const p = newProject();
    p.schemas.push(schemaWithCardsPerPage('sA', 4), schemaWithCardsPerPage('sB', 6));
    for (let i = 0; i < 3; i++) p.records.push({ id: 'a' + i, schemaId: 'sA', fieldsHash: '', fields: { title: { en: 'A' + i, vi: '' } } });
    for (let i = 0; i < 3; i++) p.records.push({ id: 'b' + i, schemaId: 'sB', fieldsHash: '', fields: { title: { en: 'B' + i, vi: '' } } });
    const sheets = collectPrintSheets(p);
    expect(sheets).toHaveLength(2); // lone partials, different layout keys — kept separate
    expect(sheets.some((s) => s.cards.length === 3 && s.lay.perPage === 4)).toBe(true);
    expect(sheets.some((s) => s.cards.length === 3 && s.lay.perPage === 6)).toBe(true);
  });
});

function fakeCard(id: string): Card { return { id, layout: 'fulltext', imageHeightPercent: 50, images: [], title: id, sections: [] }; }
function fakeSheet(cards: Card[], perPage: number): Sheet {
  const lay = sheetLayout({ cardsPerPage: perPage }, 'A5', 'portrait');
  return { cards, lay, settings: DEFAULT_SETTINGS };
}

describe('mergeLeftoverSheets (pure)', () => {
  it('leaves a full sheet untouched and in place', () => {
    const full = fakeSheet([fakeCard('c1'), fakeCard('c2')], 2);
    expect(mergeLeftoverSheets([full])).toEqual([full]);
  });
  it('re-tiles two same-layout partials into one combined page', () => {
    const p1 = fakeSheet([fakeCard('c1')], 4);
    const p2 = fakeSheet([fakeCard('c2'), fakeCard('c3'), fakeCard('c4')], 4);
    const out = mergeLeftoverSheets([p1, p2]);
    expect(out).toHaveLength(1);
    expect(out[0].cards.map((c) => c.id)).toEqual(['c1', 'c2', 'c3', 'c4']);
  });
  it('a lone partial with a unique layout keeps its own page, after the full sheets', () => {
    const full = fakeSheet([fakeCard('c1'), fakeCard('c2')], 2);
    const p1 = fakeSheet([fakeCard('c3')], 4);
    const out = mergeLeftoverSheets([full, p1]);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual(full);
    expect(out[1].cards.map((c) => c.id)).toEqual(['c3']);
  });
  it('is pure — does not mutate its input', () => {
    const p1 = fakeSheet([fakeCard('c1')], 4);
    const p2 = fakeSheet([fakeCard('c2'), fakeCard('c3'), fakeCard('c4')], 4);
    const input = [p1, p2];
    mergeLeftoverSheets(input);
    expect(input).toEqual([p1, p2]);
  });
});
```

Also update the top-of-file `model.ts` import line (already imports `CardTemplate`) to add `DEFAULT_SETTINGS` and `Card`:

```ts
import { newProject, DEFAULT_SETTINGS, type Project, type Schema, type CardTemplate, type Card } from '../src/lib/modules/flashcards/model';
```

- [ ] **Step 2: Run the tests to verify they fail.**

Run: `npm test -- printCards`
Expected: FAIL — `mergeLeftoverSheets` is not exported; `collectPrintCards`/`collectPrintSheets` still only read `schema.cardTemplates[0]`.

- [ ] **Step 3: Implement grouped-by-view collection + the leftover merge in `printCards.ts`.**

Replace the whole file with:

```ts
import type { Project, Card, Schema, Settings } from '../model';
import { deriveAutoTemplate, recordToCard, chunkRecords } from '../cardMapping';
import { sheetLayout } from './card-render';
import { resolveStyle } from './style';

/** A schema's views, in order — its real cardTemplates, or a single derived one if it has none yet. */
function viewsFor(schema: Schema) {
  return schema.cardTemplates.length ? schema.cardTemplates : [deriveAutoTemplate(schema)];
}

/** Every card the Cards gallery shows, in schema -> view -> record order — one card per
 *  (record x view): the persisted (packed) card if one exists, else an auto-derived one. Pure. */
export function collectPrintCards(project: Project): Card[] {
  const out: Card[] = [];
  for (const schema of project.schemas) {
    const recs = project.records.filter((r) => r.schemaId === schema.id);
    for (const template of viewsFor(schema)) {
      for (const rec of recs) {
        const packed = project.cards.find((c) => c.recordId === rec.id && c.templateId === template.id);
        out.push(packed ?? recordToCard(rec, schema, template, project.settings, project.activeLocale));
      }
    }
  }
  return out;
}

export interface Sheet { cards: Card[]; lay: ReturnType<typeof sheetLayout>; settings: Settings; }

/** Every printed sheet, grouped by view (all of view 1's sheets, then view 2's, ...), each in the
 *  view's own resolved N-up layout. Pure — collectPrintSheets applies the leftover merge on top. */
function sheetsByView(project: Project): Sheet[] {
  const out: Sheet[] = [];
  for (const schema of project.schemas) {
    const recs = project.records.filter((r) => r.schemaId === schema.id);
    for (const template of viewsFor(schema)) {
      const schemaEff = resolveStyle(project.settings, template.style);
      const orient = schemaEff.orientation;
      const lay = sheetLayout(template, schemaEff.paperSize, orient);
      const cards = recs.map((r) =>
        project.cards.find((c) => c.recordId === r.id && c.templateId === template.id) ??
        recordToCard(r, schema, template, project.settings, project.activeLocale));
      for (const chunk of chunkRecords(cards, lay.perPage)) out.push({ cards: chunk, lay, settings: schemaEff });
    }
  }
  return out;
}

/** Layout "bucket" key — sheets only merge with others sharing the exact same paper + grid geometry. */
function layoutKey(s: Sheet): string {
  return `${s.settings.paperSize}|${s.lay.orient}|${s.lay.cols}|${s.lay.rows}|${s.lay.cellW}|${s.lay.cellH}`;
}

/** Re-tile trailing partial (not-full) sheets that share the same paper/grid layout into fewer,
 *  more-filled pages, appended after every view's full sheets. A partial sheet whose layout key is
 *  unique among the partials keeps its own page. Full sheets are never reshuffled or reordered.
 *  Deterministic: iteration/merge order follows the input `sheets` order (i.e. schema -> view order). Pure. */
export function mergeLeftoverSheets(sheets: Sheet[]): Sheet[] {
  const full: Sheet[] = [];
  const partials: Sheet[] = [];
  for (const s of sheets) {
    if (s.cards.length >= s.lay.perPage) full.push(s);
    else partials.push(s);
  }
  if (!partials.length) return full;

  const buckets = new Map<string, Sheet[]>();
  const order: string[] = [];
  for (const p of partials) {
    const key = layoutKey(p);
    if (!buckets.has(key)) { buckets.set(key, []); order.push(key); }
    buckets.get(key)!.push(p);
  }

  const merged: Sheet[] = [];
  for (const key of order) {
    const group = buckets.get(key)!;
    if (group.length === 1) { merged.push(group[0]); continue; }
    const perPage = group[0].lay.perPage;
    const allCards = group.flatMap((s) => s.cards);
    for (const chunk of chunkRecords(allCards, perPage)) merged.push({ cards: chunk, lay: group[0].lay, settings: group[0].settings });
  }
  return [...full, ...merged];
}

/** Every printed sheet -- grouped by view, with each group's trailing partial page merged across
 *  same-layout views (fewer, fuller pages on export/print). Pure. */
export function collectPrintSheets(project: Project): Sheet[] {
  return mergeLeftoverSheets(sheetsByView(project));
}
```

- [ ] **Step 4: Run the tests to verify they pass.**

Run: `npm test -- printCards`
Expected: PASS.

- [ ] **Step 5: Run the full suite — `PrintView.svelte`/`pdfExport.ts` need no changes since they only call `collectPrintSheets`; confirm their existing tests still pass unmodified.**

Run: `npm test`
Expected: green, 0 unhandled (re-run once if a transient Windows `EBUSY` appears). In particular `tests/PrintView.test.ts` and `tests/pdfExport.test.ts` must be unaffected — neither imports anything from `printCards.ts` beyond `collectPrintSheets`/`Sheet`.

- [ ] **Step 6: Full gates + commit.**

Run: `npm run check` (0 errors) → `npm run build` (OK).

```bash
git add src/lib/modules/flashcards/lib/printCards.ts tests/printCards.test.ts
git commit -m "feat(flashcards): print/PDF sheets grouped by view + merge same-layout leftover pages"
```

---

## Task 7: Whole-branch review + visual pass

Review the full diff across Tasks 1-6 together (model, cardMapping, cardOps, stores, printCards, and the three components) for cross-task consistency — naming (`templateId` vs `viewId` used consistently as `templateId`), the "falls back to the schema's first view" rule applied identically in `CardPreview.svelte`/`StyleControls.svelte`/`cardOps.templateForCard`/`printCards.viewsFor`, and that a single-view project (`cardTemplates.length <= 1`) renders/packs/prints pixel-identically to before this feature (per the spec's back-compat requirement). Manually run the app (`npm run tauri dev`) against a multi-view schema — add a 2nd and 3rd view, verify the view bar, field checklist, per-view style overrides, Cards gallery per-view sections, and a Print/Export with mismatched trailing partials to confirm the merge visually. No fixed step list — this is an end-of-branch code-review + exploratory-testing pass, not new functionality.

---
