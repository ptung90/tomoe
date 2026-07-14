# Flashcards Cards Gallery + Layout Chunking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Records ⇄ Cards view toggle with a Cards gallery that renders every record as its card, and make `3card` pack 3 records per page — both the gallery and the live preview treat a "page" as a chunk of records (single layouts = 1/page, `3card` = 3/page). Cards are derived on the fly (auto-synced), not persisted.

**Architecture:** Extend the pure `cardMapping.ts` with `cardsPerPage`, `chunkRecords`, and `recordsToCard` (generalizes `recordToCard` to N records; `recordToCard` becomes the 1-record wrapper). `CardPreview` renders the chunk containing the selected record; a new `CardGallery` renders one thumbnail per chunk grouped by schema; `Workspace` adds the view toggle. Everything reads `$project` and builds cards via spec #3's `buildCardHTML`.

**Tech Stack:** Svelte 5 (runes), TypeScript, Vite 5, vitest + @testing-library/svelte.

## Global Constraints

- Everything under `src/lib/modules/flashcards/`. Module isolation; no shared/global state added.
- Cards are **derived**, not persisted this spec — do NOT write to `project.cards`.
- Card interior colors are FIXED print colors (from `card-render.css`); pane/gallery CHROME uses Calm Paper tokens (`var(--bg)`/`--surface`/`--sidebar`/`--border`/`--text`/`--text-muted`/`--accent`/`--accent-weak`); `#fff` on accent is accepted; no danger token exists.
- lucide-svelte icons: subpath imports only (`lucide-svelte/icons/<name>`).
- Pure functions in `cardMapping.ts` stay pure (no Svelte/DOM); immutability preserved.
- `recordToCard(record, …)` must keep its exact current output (existing tests + callers depend on it) — implement it as `recordsToCard([record], …)` with the single branch producing identical results.
- Only `3card` is a compound layout in scope; all single layouts chunk at size 1.
- Gates: `npm run check` 0 errors · `npm test` green, 0 unhandled · `npm run build` OK. TDD: failing test first for pure logic. Commit per task.

## File map

```
src/lib/modules/flashcards/
  cardMapping.ts               # MODIFY: cardsPerPage, chunkRecords, recordsToCard (+ recordToCard delegates)
  components/
    CardPreview.svelte         # MODIFY: preview the chunk containing the selected record
    CardGallery.svelte         # NEW: thumbnail grid of chunk-cards, grouped by schema
  Workspace.svelte             # MODIFY: Records ⇄ Cards view toggle
tests/
  cardMapping.test.ts          # extend
  CardPreview.test.ts          # extend
  CardGallery.test.ts          # NEW
  flashcards-workspace.test.ts # extend
```

Model reference (`model.ts`): `Card` (requires `id, layout, imageHeightPercent, images, title, sections`; optional `orientation, hideTitle, hideSectionLabels, recordId, templateId, packedRecordIds`), `CardSection` (`id, label: LocalizedText, content: LocalizedText`), `CardImage` (`slot, url`), `RecordItem`, `Schema`, `CardTemplate`, `Settings`, `uid`.

---

## Task 1: cardMapping — cardsPerPage + chunkRecords + recordsToCard

**Files:**
- Modify: `src/lib/modules/flashcards/cardMapping.ts`
- Test: `tests/cardMapping.test.ts` (add a describe block)

**Interfaces:**
- Consumes: existing `recordToCard` body logic, `resolveLocale`, `LAYOUT_SLOTS`, model types + `uid`.
- Produces:
  - `cardsPerPage(layout: string): number`
  - `chunkRecords<T>(items: T[], size: number): T[][]`
  - `recordsToCard(records: RecordItem[], schema: Schema, template: CardTemplate, settings: Settings, locale: string): Card`
  - `recordToCard(record, schema, template, settings, locale): Card` — now delegates to `recordsToCard([record], …)` (unchanged output).

- [ ] **Step 1: Write the failing test**

Append to `tests/cardMapping.test.ts`:
```ts
import { cardsPerPage, chunkRecords, recordsToCard } from '../src/lib/modules/flashcards/cardMapping';

describe('cardsPerPage / chunkRecords', () => {
  it('3card is 3 per page, single layouts are 1', () => {
    expect(cardsPerPage('3card')).toBe(3);
    expect(cardsPerPage('1top-1bot')).toBe(1);
    expect(cardsPerPage('fulltext')).toBe(1);
    expect(cardsPerPage('2x2')).toBe(1);
  });
  it('chunkRecords splits into consecutive chunks', () => {
    expect(chunkRecords([1, 2, 3, 4], 3)).toEqual([[1, 2, 3], [4]]);
    expect(chunkRecords([1, 2], 1)).toEqual([[1], [2]]);
    expect(chunkRecords([], 3)).toEqual([]);
    expect(chunkRecords([1, 2], 0)).toEqual([[1], [2]]); // size<1 → 1
  });
});

describe('recordsToCard', () => {
  function schema3(): Schema {
    return { id: 's1', name: 'Words', cardTemplates: [], fields: [
      { id: 'f1', key: 'title', label: 'Title', type: 'text', multilingual: true },
      { id: 'f2', key: 'def', label: 'Def', type: 'text', multilingual: true },
      { id: 'f3', key: 'pic', label: 'Pic', type: 'image' },
    ] };
  }
  const tpl = (layout: string): CardTemplate => ({ id: 'tpl1', templateType: layout === '3card' ? 'compound' : 'single', layout, size: null, orientation: undefined, hideTitle: false, hideSectionLabels: false, mapping: {} });
  const rec = (id: string, t: string, d: string, p = ''): RecordItem =>
    ({ id, schemaId: 's1', fieldsHash: '', fields: { title: { en: t, vi: '' }, def: { en: d, vi: '' }, pic: p } });

  it('single layout matches recordToCard for one record', () => {
    const s = schema3();
    const r = rec('r1', 'Owl', 'a bird', 'http://x/o.png');
    const single = recordsToCard([r], s, tpl('1top-1bot'), DEFAULT_SETTINGS, 'en');
    expect(single.title).toBe('Owl');
    expect(single.sections.map((x) => x.content)).toEqual(['a bird']);
    expect(single.images[0]).toMatchObject({ slot: 0, url: 'http://x/o.png' });
    expect(single.recordId).toBe('r1');
  });
  it('3card maps 3 records to 3 labelled cells + images', () => {
    const s = schema3();
    const card = recordsToCard(
      [rec('r1', 'Cat', 'meow', 'http://x/1.png'), rec('r2', 'Dog', 'woof', 'http://x/2.png'), rec('r3', 'Cow', 'moo')],
      s, tpl('3card'), DEFAULT_SETTINGS, 'en',
    );
    expect(card.layout).toBe('3card');
    expect(card.sections).toHaveLength(3);
    expect(card.sections.map((x) => x.label)).toEqual(['Cat', 'Dog', 'Cow']);
    expect(card.sections.map((x) => x.content)).toEqual(['meow', 'woof', 'moo']);
    expect(card.images.map((im) => im.url)).toEqual(['http://x/1.png', 'http://x/2.png']); // r3 has no pic
    expect(card.packedRecordIds).toEqual(['r1', 'r2', 'r3']);
  });
  it('3card pads to 3 cells when the chunk is short', () => {
    const s = schema3();
    const card = recordsToCard([rec('r1', 'Cat', 'meow')], s, tpl('3card'), DEFAULT_SETTINGS, 'en');
    expect(card.sections).toHaveLength(3);
    expect(card.sections[1]).toMatchObject({ label: '', content: '' });
    expect(card.packedRecordIds).toEqual(['r1']);
  });
});
```
(Ensure `DEFAULT_SETTINGS`, `type Schema`, `type CardTemplate`, `type RecordItem` are imported at the top of the test file — some may already be imported from `../src/lib/modules/flashcards/model`; add what's missing.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- cardMapping`
Expected: FAIL — `cardsPerPage` / `recordsToCard` not exported.

- [ ] **Step 3: Implement**

In `src/lib/modules/flashcards/cardMapping.ts`, add a compound-layout set + the new functions, and refactor `recordToCard` to delegate. Replace the existing `recordToCard` (lines ~21-54) with the following (keep `deriveAutoTemplate`, `applySettings`, `applyTemplatePatch`, `DEFAULT_IMAGE_HEIGHT`, and the imports as-is; add `chunkRecords` needs no new import):
```ts
const COMPOUND_LAYOUTS = new Set(['3card']);

export function cardsPerPage(layout: string): number {
  return COMPOUND_LAYOUTS.has(layout) ? (LAYOUT_SLOTS[layout] ?? 1) : 1;
}

export function chunkRecords<T>(items: T[], size: number): T[][] {
  const n = Math.max(1, size);
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n));
  return out;
}

/** Build one Card from a chunk of records. Single layouts use records[0]
 *  (identical to the former recordToCard); compound (3card) maps each record
 *  to one cell (label=first text field, content=second, image=first image). */
export function recordsToCard(
  records: RecordItem[], schema: Schema, template: CardTemplate, settings: Settings, locale: string,
): Card {
  const orientation = template.orientation ?? settings.orientation;
  if (!COMPOUND_LAYOUTS.has(template.layout)) {
    const record = records[0];
    const textFields = schema.fields.filter((f) => f.type !== 'image');
    const imageFields = schema.fields.filter((f) => f.type === 'image');
    const titleField = textFields[0] ?? null;
    const sectionFields = titleField ? textFields.slice(1) : textFields;
    const slotCount = LAYOUT_SLOTS[template.layout] ?? 0;
    const images: CardImage[] = [];
    if (record) {
      for (let i = 0; i < Math.min(slotCount, imageFields.length); i++) {
        const url = resolveLocale(record.fields[imageFields[i].key], locale);
        if (url) images.push({ slot: i, url });
      }
    }
    const sections: CardSection[] = record
      ? sectionFields.map((f) => ({ id: uid('sec'), label: f.label, content: resolveLocale(record.fields[f.key], locale) }))
      : [];
    return {
      id: 'preview_' + (record?.id ?? 'empty'),
      layout: template.layout,
      imageHeightPercent: DEFAULT_IMAGE_HEIGHT,
      images,
      title: record && titleField ? resolveLocale(record.fields[titleField.key], locale) : '',
      sections,
      orientation,
      hideTitle: template.hideTitle,
      hideSectionLabels: template.hideSectionLabels,
      ...(record ? { recordId: record.id } : {}),
      templateId: template.id,
    };
  }

  // Compound (3card): each record → one cell.
  const textFields = schema.fields.filter((f) => f.type !== 'image');
  const imageFields = schema.fields.filter((f) => f.type === 'image');
  const labelField = textFields[0] ?? null;
  const contentField = textFields[1] ?? null;
  const imageField = imageFields[0] ?? null;
  const slots = LAYOUT_SLOTS[template.layout] ?? 3;
  const cells = records.slice(0, slots);

  const sections: CardSection[] = cells.map((rec) => ({
    id: uid('sec'),
    label: labelField ? resolveLocale(rec.fields[labelField.key], locale) : '',
    content: contentField ? resolveLocale(rec.fields[contentField.key], locale) : '',
  }));
  while (sections.length < slots) sections.push({ id: uid('sec'), label: '', content: '' });

  const images: CardImage[] = [];
  cells.forEach((rec, i) => {
    if (!imageField) return;
    const url = resolveLocale(rec.fields[imageField.key], locale);
    if (url) images.push({ slot: i, url });
  });

  return {
    id: 'preview_' + (cells[0]?.id ?? 'empty'),
    layout: template.layout,
    imageHeightPercent: DEFAULT_IMAGE_HEIGHT,
    images,
    title: '',
    sections,
    orientation,
    hideTitle: template.hideTitle,
    hideSectionLabels: template.hideSectionLabels,
    templateId: template.id,
    packedRecordIds: cells.map((r) => r.id),
  };
}

export function recordToCard(
  record: RecordItem, schema: Schema, template: CardTemplate, settings: Settings, locale: string,
): Card {
  return recordsToCard([record], schema, template, settings, locale);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- cardMapping`
Expected: PASS — new tests + all pre-existing `cardMapping` tests (recordToCard delegation is output-identical). `npm run check` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/modules/flashcards/cardMapping.ts tests/cardMapping.test.ts
git commit -m "feat(flashcards): recordsToCard + cardsPerPage + chunkRecords (3card packs 3 records)"
```

---

## Task 2: CardPreview — preview the chunk containing the selected record

**Files:**
- Modify: `src/lib/modules/flashcards/components/CardPreview.svelte`
- Test: `tests/CardPreview.test.ts` (add a case)

**Interfaces:**
- Consumes: `recordsToCard`, `cardsPerPage`, `chunkRecords` from `../cardMapping` (Task 1); existing `buildCardHTML`, `getPaperPx`, stores.

- [ ] **Step 1: Write the failing test**

Append a case to `tests/CardPreview.test.ts` (inside the existing describe or a new one; reuse its `beforeEach`/imports, add `get` if missing):
```ts
it('3card preview shows the whole 3-record page, not just the selected record', () => {
  // seed: schema with 3card layout + 3 records
  S.initProject();
  const sid = S.addSchema('Words');
  S.updateSchema(sid, { fields: [
    { id: 'f1', key: 'title', label: 'Title', type: 'text', multilingual: true },
    { id: 'f2', key: 'def', label: 'Def', type: 'text', multilingual: true },
  ] });
  S.setTemplateLayout(sid, { layout: '3card' });
  S.addRecord(sid); S.addRecord(sid); S.addRecord(sid);
  const recs = get(S.project).records;
  S.setField(recs[0].id, 'title', 'Cat', 'en');
  S.setField(recs[1].id, 'title', 'Dog', 'en');
  S.setField(recs[2].id, 'title', 'Cow', 'en');
  S.selectRecord(recs[0].id);
  const { container } = render(CardPreview);
  const text = container.textContent ?? '';
  expect(text).toContain('Cat');
  expect(text).toContain('Dog'); // a neighbour in the same page — proves the chunk renders
  expect(text).toContain('Cow');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- CardPreview`
Expected: FAIL — current preview renders only the selected record (a degenerate 3card of `recs[0]`), so "Dog"/"Cow" aren't present.

- [ ] **Step 3: Implement the chunk-based derivation**

In `CardPreview.svelte`, update the import from `../cardMapping` to include the new helpers and replace the `cardHtml` derivation so it renders the chunk containing the selected record:
```ts
  import { deriveAutoTemplate, recordsToCard, cardsPerPage, chunkRecords } from '../cardMapping';
```
Replace the existing `const cardHtml = $derived(...)` with:
```ts
  const cardHtml = $derived.by(() => {
    if (!record || !schema || !template) return '';
    const schemaRecords = $project.records.filter((r) => r.schemaId === schema.id);
    const chunks = chunkRecords(schemaRecords, cardsPerPage(template.layout));
    const chunk = chunks.find((c) => c.some((r) => r.id === record.id)) ?? [record];
    return buildCardHTML(recordsToCard(chunk, schema, template, $project.settings, $project.activeLocale),
                         $project.settings, $project.activeLocale);
  });
```
Leave everything else (toolbar, layout dropdown incl. all 7 layouts, paper/orientation, StyleControls, scaler, canvas CSS, empty state) unchanged. Remove the now-unused `recordToCard` import if it was imported (it isn't used elsewhere in this file after the change).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- CardPreview`
Expected: PASS (all CardPreview tests). `npm run check` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/modules/flashcards/components/CardPreview.svelte tests/CardPreview.test.ts
git commit -m "feat(flashcards): preview the record's page (chunk) so 3card shows 3 records"
```

---

## Task 3: CardGallery component

**Files:**
- Create: `src/lib/modules/flashcards/components/CardGallery.svelte`
- Test: `tests/CardGallery.test.ts`

**Interfaces:**
- Consumes: `deriveAutoTemplate`, `recordsToCard`, `cardsPerPage`, `chunkRecords` (Task 1); `buildCardHTML`, `getPaperPx` (`../lib/card-render`); stores `project`, `schemaEditorOpen`; `EmptyState`; `../lib/card-render.css`.
- Produces: `<CardGallery onOpen={(recordId: string) => void} />`.

- [ ] **Step 1: Write the failing test**

Create `tests/CardGallery.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { render, fireEvent } from '@testing-library/svelte';
import CardGallery from '../src/lib/modules/flashcards/components/CardGallery.svelte';
import * as S from '../src/lib/modules/flashcards/stores';

function seed(layout: string, n: number) {
  S.initProject();
  const sid = S.addSchema('Words');
  S.updateSchema(sid, { fields: [{ id: 'f1', key: 'title', label: 'Title', type: 'text', multilingual: true }] });
  S.setTemplateLayout(sid, { layout });
  for (let i = 0; i < n; i++) S.addRecord(sid);
}

describe('CardGallery', () => {
  it('renders one thumbnail per record for a single layout', () => {
    seed('1top-1bot', 4);
    const { container } = render(CardGallery, { onOpen: vi.fn() });
    expect(container.querySelectorAll('.thumb').length).toBe(4);
    expect(container.querySelector('.fc-card')).toBeInTheDocument();
  });
  it('chunks 3card into pages of 3 (4 records → 2 thumbnails)', () => {
    seed('3card', 4);
    const { container } = render(CardGallery, { onOpen: vi.fn() });
    expect(container.querySelectorAll('.thumb').length).toBe(2);
  });
  it('clicking a thumbnail calls onOpen with the chunk first record id', async () => {
    seed('1top-1bot', 2);
    const onOpen = vi.fn();
    const { container } = render(CardGallery, { onOpen });
    const firstId = get(S.project).records[0].id;
    await fireEvent.click(container.querySelector('.thumb')!);
    expect(onOpen).toHaveBeenCalledWith(firstId);
  });
  it('shows an empty state when there are no schemas', () => {
    S.initProject();
    const { getByText } = render(CardGallery, { onOpen: vi.fn() });
    expect(getByText(/no cards yet/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- CardGallery`
Expected: FAIL — cannot resolve the component.

- [ ] **Step 3: Implement `CardGallery.svelte`**

Create `src/lib/modules/flashcards/components/CardGallery.svelte`:
```svelte
<script lang="ts">
  import '../lib/card-render.css';
  import Layers from 'lucide-svelte/icons/layers';
  import FilePlus from 'lucide-svelte/icons/file-plus';
  import { project, schemaEditorOpen } from '../stores';
  import { deriveAutoTemplate, recordsToCard, cardsPerPage, chunkRecords } from '../cardMapping';
  import { buildCardHTML, getPaperPx } from '../lib/card-render';
  import type { RecordItem, Schema, CardTemplate } from '../model';
  import EmptyState from './EmptyState.svelte';

  let { onOpen }: { onOpen: (recordId: string) => void } = $props();

  const THUMB_W = 190;

  const groups = $derived($project.schemas.map((schema) => {
    const template = schema.cardTemplates[0] ?? deriveAutoTemplate(schema);
    const recs = $project.records.filter((r) => r.schemaId === schema.id);
    const chunks = chunkRecords(recs, cardsPerPage(template.layout));
    const paper = getPaperPx(template.size || $project.settings.paperSize, template.orientation || $project.settings.orientation);
    const scale = Math.min(1, THUMB_W / paper.w);
    return { schema, template, chunks, paper, scale };
  }));

  const totalRecords = $derived($project.records.length);

  function recLabel(rec: RecordItem, schema: Schema): string {
    const f = schema.fields.find((x) => x.type !== 'image');
    if (!f) return '(untitled)';
    const v = rec.fields[f.key];
    const s = v && typeof v === 'object' ? (v[$project.activeLocale] ?? '') : (typeof v === 'string' ? v : '');
    return s.trim() || '(untitled)';
  }
  function caption(chunk: RecordItem[], schema: Schema): string {
    const first = recLabel(chunk[0], schema);
    return chunk.length > 1 ? `${first} +${chunk.length - 1}` : first;
  }
  function cardHtml(chunk: RecordItem[], schema: Schema, template: CardTemplate): string {
    return buildCardHTML(recordsToCard(chunk, schema, template, $project.settings, $project.activeLocale),
                         $project.settings, $project.activeLocale);
  }
</script>

{#if $project.schemas.length === 0}
  {#snippet createAction()}
    <button type="button" class="cta" onclick={() => schemaEditorOpen.set('__new__')}>Create a schema</button>
  {/snippet}
  <EmptyState icon={Layers} title="No cards yet"
    hint="Create a schema and add records — each one shows up here as a card."
    action={createAction} />
{:else if totalRecords === 0}
  <EmptyState icon={FilePlus} title="No records to show"
    hint="Add records in the Records view — they'll appear here as cards." />
{:else}
  <div class="gallery">
    {#each groups as g (g.schema.id)}
      <section class="group">
        <header class="group-head">
          <span class="group-name">{g.schema.name}</span>
          <span class="count">{g.chunks.length} card{g.chunks.length === 1 ? '' : 's'}</span>
        </header>
        {#if g.chunks.length === 0}
          <p class="hint">No records in this schema yet.</p>
        {:else}
          <div class="grid">
            {#each g.chunks as chunk (chunk[0].id)}
              <button type="button" class="thumb" title={caption(chunk, g.schema)} onclick={() => onOpen(chunk[0].id)}>
                <div class="thumb-frame" style={`width:${Math.round(g.paper.w * g.scale)}px;height:${Math.round(g.paper.h * g.scale)}px;`}>
                  <div class="thumb-scaler" style={`transform:scale(${g.scale});width:${g.paper.w}px;height:${g.paper.h}px;`}>
                    {@html cardHtml(chunk, g.schema, g.template)}
                  </div>
                </div>
                <span class="thumb-cap">{caption(chunk, g.schema)}</span>
              </button>
            {/each}
          </div>
        {/if}
      </section>
    {/each}
  </div>
{/if}

<style>
  .gallery { height:100%; min-height:0; overflow:auto; padding:16px; background:var(--sidebar);
    display:flex; flex-direction:column; gap:20px; }
  .group { display:flex; flex-direction:column; gap:10px; }
  .group-head { display:flex; align-items:center; gap:8px; }
  .group-name { font-weight:600; font-size:13px; color:var(--text); }
  .count { font-size:11px; color:var(--text-muted); background:var(--accent-weak); border-radius:10px; padding:0 7px; }
  .hint { color:var(--text-muted); font-size:12px; margin:0; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(190px, 1fr)); gap:14px; align-items:start; }
  .thumb { display:flex; flex-direction:column; align-items:center; gap:6px; border:none; background:transparent;
    padding:6px; border-radius:10px; cursor:pointer; font:inherit; transition:background .12s ease; }
  .thumb:hover { background:var(--accent-weak); }
  .thumb:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
  .thumb-frame { flex:none; border-radius:2px; box-shadow:0 1px 2px rgba(0,0,0,.08), 0 6px 18px rgba(0,0,0,.12); overflow:hidden; }
  .thumb-scaler { transform-origin:top left; }
  .thumb-cap { font-size:12px; color:var(--text); max-width:190px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .cta { border:1px solid var(--accent); background:var(--accent); color:#fff; font-weight:600;
    border-radius:6px; padding:6px 14px; font:inherit; font-size:12px; cursor:pointer; }
  .cta:hover { opacity:.92; }
  .cta:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- CardGallery`
Expected: PASS (4 tests). `npm run check` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/modules/flashcards/components/CardGallery.svelte tests/CardGallery.test.ts
git commit -m "feat(flashcards): CardGallery — thumbnail grid of chunk-cards per schema"
```

---

## Task 4: Workspace Records ⇄ Cards view toggle + gates

**Files:**
- Modify: `src/lib/modules/flashcards/Workspace.svelte`
- Test: `tests/flashcards-workspace.test.ts` (add a case)

**Interfaces:**
- Consumes: `CardGallery` (Task 3); stores `selectRecord`; existing panes.

- [ ] **Step 1: Write the failing test**

Add to `tests/flashcards-workspace.test.ts` (inside the existing describe; its `beforeEach` seeds a schema + record):
```ts
  it('toggles between Records and Cards views', async () => {
    const { getByRole, container } = render(Workspace);
    // default: Records view shows the detail form field
    expect(screen.getByText('Title')).toBeInTheDocument();
    await fireEvent.click(getByRole('tab', { name: /cards/i }));
    // Cards view shows gallery thumbnails
    expect(container.querySelector('.thumb')).toBeInTheDocument();
    await fireEvent.click(getByRole('tab', { name: /records/i }));
    expect(screen.getByText('Title')).toBeInTheDocument();
  });
```
(Ensure `fireEvent` and `screen` are imported in this test file; add if missing.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- flashcards-workspace`
Expected: FAIL — no Cards tab / no `.thumb`.

- [ ] **Step 3: Add the view toggle to `Workspace.svelte`**

In `src/lib/modules/flashcards/Workspace.svelte`:
- import: `import { project, setProjectName, selectRecord } from './stores';` and `import CardGallery from './components/CardGallery.svelte';`
- add state: `let view = $state<'records' | 'cards'>('records');`
- in the `<header>`, after the `.counts` span, add a segmented toggle:
```svelte
    <div class="view-toggle" role="tablist" aria-label="view">
      <button type="button" role="tab" aria-selected={view === 'records'} class:on={view === 'records'}
        onclick={() => (view = 'records')}>Records</button>
      <button type="button" role="tab" aria-selected={view === 'cards'} class:on={view === 'cards'}
        onclick={() => (view = 'cards')}>Cards</button>
    </div>
```
- wrap the existing `.body` grid and add the cards branch:
```svelte
  {#if view === 'records'}
    <div class="body" style={`grid-template-columns:${leftWidth}px 6px 1fr 6px ${rightWidth}px`}>
      … existing panes + dividers unchanged …
    </div>
  {:else}
    <div class="cards-body"><CardGallery onOpen={(id) => { selectRecord(id); view = 'records'; }} /></div>
  {/if}
```
- add styles:
```css
  .view-toggle { margin-left:auto; display:inline-flex; gap:2px; border:1px solid var(--border); border-radius:8px; padding:2px; }
  .view-toggle button { border:none; background:transparent; color:var(--text-muted); font:inherit; font-size:12px;
    padding:3px 12px; border-radius:6px; cursor:pointer; transition:background .12s ease, color .12s ease; }
  .view-toggle button:hover:not(.on) { color:var(--accent); }
  .view-toggle button.on { background:var(--accent); color:#fff; font-weight:600; }
  .view-toggle button:focus-visible { outline:2px solid var(--accent); outline-offset:1px; }
  .cards-body { flex:1; min-height:0; }
```
(The `.counts` span currently may sit with `margin` from the header's `gap`; putting `margin-left:auto` on `.view-toggle` right-aligns the toggle. Keep the header `display:flex; gap:12px` as-is.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- flashcards-workspace`
Expected: PASS.

- [ ] **Step 5: Run all gates**

Run: `npm test` → all green, 0 unhandled (re-run once if transient Windows EBUSY cache noise appears).
Run: `npm run check` → 0 errors (pre-existing `TreeNode` warning may remain).
Run: `npm run build` → OK.

- [ ] **Step 6: Manual verification (`npm run tauri dev`)**

- New Flashcards → schema `Words` (title text, def text, pic image) → add ~4 records with values/images.
- Header shows Records | Cards toggle. Records view unchanged (list/form/preview).
- Set the schema layout to **3card** in the preview toolbar → the live preview now shows a **3-record page** (the selected record plus its page-mates), not one record in 3 columns.
- Switch to **Cards** view → grid of thumbnails grouped by schema; with 3card + 4 records → 2 thumbnails (3 + 1); with a single layout → one thumbnail per record. Editing a record/style updates thumbnails live.
- Click a thumbnail → jumps to Records view with that record selected.
- Ctrl+S then reopen → schema/layout/records restored (cards are derived, nothing new persisted).

- [ ] **Step 7: Commit**

```bash
git add src/lib/modules/flashcards/Workspace.svelte tests/flashcards-workspace.test.ts
git commit -m "feat(flashcards): Records/Cards view toggle + gallery"
```

---

## Self-review notes (author)

- **Spec coverage:** cardsPerPage/chunkRecords/recordsToCard incl. 3card compound + padding (T1), preview renders the record's chunk (T2), CardGallery grouped chunk-thumbnails + click→onOpen (T3), Records⇄Cards toggle wired (T4). Auto-synced/derived — no `project.cards` writes. All mapped.
- **Out of scope** (persist, manual pack, sync status, card edit, apply→record, non-3card compounds) — not implemented.
- **Type/interface consistency:** `recordsToCard(records[], schema, template, settings, locale)`, `cardsPerPage(layout)`, `chunkRecords(items, size)` used identically across cardMapping, CardPreview, CardGallery. `recordToCard` preserved as a 1-record delegate so existing tests/callers are unaffected. Gallery `.thumb`/`.fc-card` selectors match the test assertions.
- **Testing gap (declared):** thumbnails/preview render `buildCardHTML` output (pure string) via `{@html}` — asserted structurally (`.fc-card`, text content, `.thumb` count). Visual fidelity of 3card pages is confirmed in the T4 manual pass. No TipTap is involved in card rendering, so jsdom is fine.
```
