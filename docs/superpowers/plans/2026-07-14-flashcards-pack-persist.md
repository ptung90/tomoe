# Flashcards Pack-all + Persisted Cards + Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user "Pack all" a compound (`3card`) schema's records into persisted `Card` snapshots in `project.cards`, each with a synced/stale status, a Regenerate action, and Delete. Packed records drop out of the auto-derived gallery; single-layout cards stay auto-derived (spec #4a).

**Architecture:** Pure `cardOps.ts` builds/regenerates/deletes packed-card snapshots and reports staleness via a `hashFields` of the source records; `stores.ts` wraps these in `commit` (undoable); `CardGallery.svelte` renders a compound schema's persisted packed cards (status/regen/delete) + a Pack-all button, then auto-chunks the still-unpacked records. Packed cards are associated to a schema via their first `packedRecordId` (robust to template-id drift).

**Tech Stack:** Svelte 5 (runes), TypeScript, Vite 5, vitest + @testing-library/svelte.

## Global Constraints

- Everything under `src/lib/modules/flashcards/`. Module isolation; no new shared/global state.
- Packed cards are **snapshots persisted in `project.cards`** (built once, stored, can diverge). `serializeProject`/`parseProject` already round-trip `Card[]` — do not change serialization format beyond adding `sourceHash`.
- Only compound layouts (`3card`, i.e. `cardsPerPage(layout) > 1`) can be packed. Single-layout cards stay auto-derived — never persisted.
- Associate a packed card to its schema via `schemaForCard` (resolve `packedRecordIds[0]` → record → schema), NOT by matching `templateId` (auto-derived templates get fresh ids each call).
- Pure functions in `cardOps.ts` / `lib/hash.ts` stay pure (no Svelte/DOM), immutable (never mutate the input `Project`).
- Card interior colors are fixed print colors (`card-render.css`); gallery chrome uses Calm Paper tokens (`--sidebar`/`--surface`/`--border`/`--text`/`--text-muted`/`--accent`/`--accent-weak`); `#fff` on accent accepted; no danger token (hardcoded danger red accepted, matching existing components).
- lucide-svelte icons: subpath imports only.
- Gates: `npm run check` 0 errors · `npm test` green, 0 unhandled · `npm run build` OK. TDD: failing test first for pure logic. Commit per task.

## File map

```
src/lib/modules/flashcards/
  model.ts                 # MODIFY: add `sourceHash?: string` to Card
  lib/hash.ts              # NEW: hashFields(project, recordIds) → string
  cardOps.ts               # NEW: schemaForCard, packRecords, packAllForSchema, regenerateCard, deleteCard, isCardStale
  stores.ts                # MODIFY: packAllForSchema, regenerateCard, deleteCard wrappers
  components/
    CardGallery.svelte     # MODIFY: packed cards (status/regen/delete) + Pack all + auto for unpacked
tests/
  hash.test.ts             # NEW
  cardOps.test.ts          # NEW
  flashcards-cardstores.test.ts  # extend
  CardGallery.test.ts      # extend
```

Model (`model.ts`): `Card` currently `{ id, layout, imageHeightPercent, images, title, sections, orientation?, hideTitle?, hideSectionLabels?, recordId?, templateId?, packedRecordIds?, [k:string]:unknown }` — add `sourceHash?: string`. `Project.cards: Card[]`. `RecordItem { id, schemaId, fieldsHash, fields }`. Reuse `recordsToCard`/`cardsPerPage`/`chunkRecords`/`deriveAutoTemplate` from `cardMapping.ts`, `buildCardHTML`/`getPaperPx` from `lib/card-render.ts`, `EmptyState`.

---

## Task 1: model `sourceHash` + hashFields util

**Files:**
- Modify: `src/lib/modules/flashcards/model.ts`
- Create: `src/lib/modules/flashcards/lib/hash.ts`
- Test: `tests/hash.test.ts`

**Interfaces:**
- Produces: `Card.sourceHash?: string`; `hashFields(project: Project, recordIds: string[]): string`.

- [ ] **Step 1: Write the failing test**

Create `tests/hash.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { newProject, type Project } from '../src/lib/modules/flashcards/model';
import { hashFields } from '../src/lib/modules/flashcards/lib/hash';

function proj(): Project {
  const p = newProject();
  p.records.push(
    { id: 'r1', schemaId: 's1', fieldsHash: '', fields: { t: { en: 'Cat', vi: '' } } },
    { id: 'r2', schemaId: 's1', fieldsHash: '', fields: { t: { en: 'Dog', vi: '' } } },
  );
  return p;
}

describe('hashFields', () => {
  it('is deterministic + stable for the same records', () => {
    const p = proj();
    expect(hashFields(p, ['r1', 'r2'])).toBe(hashFields(p, ['r1', 'r2']));
  });
  it('changes when a source field changes', () => {
    const p = proj();
    const before = hashFields(p, ['r1', 'r2']);
    (p.records[0].fields.t as Record<string, string>).en = 'Cow';
    expect(hashFields(p, ['r1', 'r2'])).not.toBe(before);
  });
  it('changes when a source record is missing (deleted)', () => {
    const p = proj();
    const before = hashFields(p, ['r1', 'r2']);
    p.records = p.records.filter((r) => r.id !== 'r2');
    expect(hashFields(p, ['r1', 'r2'])).not.toBe(before);
  });
  it('reflects id order', () => {
    const p = proj();
    expect(hashFields(p, ['r1', 'r2'])).not.toBe(hashFields(p, ['r2', 'r1']));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- hash`
Expected: FAIL — cannot resolve `lib/hash`.

- [ ] **Step 3: Implement**

Add to `Card` in `src/lib/modules/flashcards/model.ts` — insert `sourceHash?: string;` just before the `[k: string]: unknown` index signature:
```ts
  packedRecordIds?: string[]; sourceHash?: string; [k: string]: unknown }
```
Create `src/lib/modules/flashcards/lib/hash.ts`:
```ts
import type { Project } from '../model';

/** Stable non-crypto string hash (ported from flashcard-creator _hashStr). */
function hashStr(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Deterministic hash of the given records' fields, in the given id order.
 *  Missing (deleted) records are skipped, so a deletion changes the hash. */
export function hashFields(project: Project, recordIds: string[]): string {
  const payload = recordIds
    .map((id) => project.records.find((r) => r.id === id))
    .filter((r): r is NonNullable<typeof r> => !!r)
    .map((r) => ({ id: r.id, fields: r.fields }));
  return hashStr(JSON.stringify(payload));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- hash`
Expected: PASS (4 tests). `npm run check` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/modules/flashcards/model.ts src/lib/modules/flashcards/lib/hash.ts tests/hash.test.ts
git commit -m "feat(flashcards): Card.sourceHash + hashFields util"
```

---

## Task 2: cardOps — pack / regenerate / delete / stale

**Files:**
- Create: `src/lib/modules/flashcards/cardOps.ts`
- Test: `tests/cardOps.test.ts`

**Interfaces:**
- Consumes: `deriveAutoTemplate`, `recordsToCard`, `cardsPerPage`, `chunkRecords` (`./cardMapping`); `hashFields` (`./lib/hash`); model types + `uid`.
- Produces:
  - `schemaForCard(project: Project, card: Card): Schema | null`
  - `packRecords(project: Project, schemaId: string, recordIds: string[]): Project`
  - `packAllForSchema(project: Project, schemaId: string): Project`
  - `regenerateCard(project: Project, cardId: string): Project`
  - `deleteCard(project: Project, cardId: string): Project`
  - `isCardStale(card: Card, project: Project): boolean`

- [ ] **Step 1: Write the failing test**

Create `tests/cardOps.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { newProject, type Project, type Schema, type RecordItem } from '../src/lib/modules/flashcards/model';
import * as ops from '../src/lib/modules/flashcards/cardOps';

function proj(layout = '3card', n = 4): Project {
  const p = newProject();
  const schema: Schema = { id: 's1', name: 'Words', cardTemplates: [
    { id: 't1', templateType: 'compound', layout, size: null, orientation: undefined, hideTitle: false, hideSectionLabels: false, mapping: {} },
  ], fields: [
    { id: 'f1', key: 'title', label: 'Title', type: 'text', multilingual: true },
    { id: 'f2', key: 'def', label: 'Def', type: 'text', multilingual: true },
  ] };
  p.schemas.push(schema);
  for (let i = 0; i < n; i++) {
    p.records.push({ id: 'r' + i, schemaId: 's1', fieldsHash: '', fields: { title: { en: 'W' + i, vi: '' }, def: { en: 'D' + i, vi: '' } } });
  }
  return p;
}

describe('packRecords / packAllForSchema', () => {
  it('packs 4 records (3card) into 2 cards with packedRecordIds + sourceHash', () => {
    const p = ops.packAllForSchema(proj('3card', 4), 's1');
    expect(p.cards).toHaveLength(2);
    expect(p.cards[0].packedRecordIds).toEqual(['r0', 'r1', 'r2']);
    expect(p.cards[1].packedRecordIds).toEqual(['r3']);
    expect(p.cards[0].sourceHash).toBeTruthy();
    expect(p.cards[0].layout).toBe('3card');
  });
  it('is a no-op for single layouts', () => {
    expect(ops.packAllForSchema(proj('1top-1bot', 3), 's1').cards).toHaveLength(0);
  });
  it('re-packing replaces this schema\'s packed cards (no accumulation)', () => {
    const once = ops.packAllForSchema(proj('3card', 4), 's1');
    const twice = ops.packAllForSchema(once, 's1');
    expect(twice.cards).toHaveLength(2);
  });
  it('does not mutate the input project', () => {
    const p = proj('3card', 3);
    ops.packAllForSchema(p, 's1');
    expect(p.cards).toHaveLength(0);
  });
});

describe('isCardStale / regenerateCard', () => {
  it('a freshly packed card is not stale', () => {
    const p = ops.packAllForSchema(proj('3card', 3), 's1');
    expect(ops.isCardStale(p.cards[0], p)).toBe(false);
  });
  it('editing a source record makes its card stale; regenerate clears it', () => {
    let p = ops.packAllForSchema(proj('3card', 3), 's1');
    const cardId = p.cards[0].id;
    // edit r0's field
    p = { ...p, records: p.records.map((r) => r.id === 'r0' ? { ...r, fields: { ...r.fields, title: { en: 'CHANGED', vi: '' } } } : r) };
    expect(ops.isCardStale(p.cards[0], p)).toBe(true);
    p = ops.regenerateCard(p, cardId);
    expect(ops.isCardStale(p.cards.find((c) => c.id === cardId)!, p)).toBe(false);
    expect(p.cards.find((c) => c.id === cardId)!.sections[0].content).toBe('D0'); // rebuilt content (2nd text field)
  });
  it('deleting a source record makes the card stale', () => {
    let p = ops.packAllForSchema(proj('3card', 3), 's1');
    p = { ...p, records: p.records.filter((r) => r.id !== 'r1') };
    expect(ops.isCardStale(p.cards[0], p)).toBe(true);
  });
});

describe('deleteCard / schemaForCard', () => {
  it('deleteCard removes the card', () => {
    const p = ops.packAllForSchema(proj('3card', 3), 's1');
    const p2 = ops.deleteCard(p, p.cards[0].id);
    expect(p2.cards).toHaveLength(0);
  });
  it('schemaForCard resolves via the first packed record', () => {
    const p = ops.packAllForSchema(proj('3card', 3), 's1');
    expect(ops.schemaForCard(p, p.cards[0])?.id).toBe('s1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- cardOps`
Expected: FAIL — cannot resolve `cardOps`.

- [ ] **Step 3: Implement `cardOps.ts`**

Create `src/lib/modules/flashcards/cardOps.ts`:
```ts
import { uid, type Project, type Card, type Schema, type CardTemplate, type RecordItem } from './model';
import { deriveAutoTemplate, recordsToCard, cardsPerPage, chunkRecords } from './cardMapping';
import { hashFields } from './lib/hash';

function templateFor(schema: Schema): CardTemplate {
  return schema.cardTemplates[0] ?? deriveAutoTemplate(schema);
}

/** Resolve a packed card's schema via its first packed record (robust to template-id drift). */
export function schemaForCard(project: Project, card: Card): Schema | null {
  const firstId = card.packedRecordIds?.[0];
  if (!firstId) return null;
  const rec = project.records.find((r) => r.id === firstId);
  return rec ? (project.schemas.find((s) => s.id === rec.schemaId) ?? null) : null;
}

export function packRecords(project: Project, schemaId: string, recordIds: string[]): Project {
  const schema = project.schemas.find((s) => s.id === schemaId);
  if (!schema) return project;
  const template = templateFor(schema);
  const size = cardsPerPage(template.layout);
  if (size <= 1) return project; // only compound layouts pack

  // Records in this schema, in project order, limited to the requested ids.
  const wanted = new Set(recordIds);
  const idOrder = project.records.filter((r) => r.schemaId === schemaId && wanted.has(r.id)).map((r) => r.id);
  const chunks = chunkRecords(idOrder, size);

  // Replace this schema's existing packed cards.
  const kept = project.cards.filter((c) => !(c.packedRecordIds?.length && schemaForCard(project, c)?.id === schemaId));

  const newCards: Card[] = chunks.map((chunkIds) => {
    const recs = chunkIds
      .map((id) => project.records.find((r) => r.id === id))
      .filter((r): r is RecordItem => !!r);
    const built = recordsToCard(recs, schema, template, project.settings, project.activeLocale);
    return { ...built, id: uid('card'), sourceHash: hashFields(project, chunkIds) };
  });

  return { ...project, cards: [...kept, ...newCards] };
}

export function packAllForSchema(project: Project, schemaId: string): Project {
  const ids = project.records.filter((r) => r.schemaId === schemaId).map((r) => r.id);
  return packRecords(project, schemaId, ids);
}

export function regenerateCard(project: Project, cardId: string): Project {
  const card = project.cards.find((c) => c.id === cardId);
  if (!card || !card.packedRecordIds?.length) return project;
  const schema = schemaForCard(project, card);
  if (!schema) return project;
  const template = templateFor(schema);
  const recs = card.packedRecordIds
    .map((id) => project.records.find((r) => r.id === id))
    .filter((r): r is RecordItem => !!r);
  const rebuilt = recordsToCard(recs, schema, template, project.settings, project.activeLocale);
  const next: Card = { ...rebuilt, id: card.id, sourceHash: hashFields(project, card.packedRecordIds) };
  return { ...project, cards: project.cards.map((c) => (c.id === cardId ? next : c)) };
}

export function deleteCard(project: Project, cardId: string): Project {
  return { ...project, cards: project.cards.filter((c) => c.id !== cardId) };
}

export function isCardStale(card: Card, project: Project): boolean {
  if (!card.packedRecordIds?.length) return false;
  return hashFields(project, card.packedRecordIds) !== card.sourceHash;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- cardOps`
Expected: PASS (10 tests). `npm run check` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/modules/flashcards/cardOps.ts tests/cardOps.test.ts
git commit -m "feat(flashcards): cardOps — pack/regenerate/delete + staleness"
```

---

## Task 3: store wrappers

**Files:**
- Modify: `src/lib/modules/flashcards/stores.ts`
- Test: `tests/flashcards-cardstores.test.ts` (add a describe block)

**Interfaces:**
- Consumes: `cardOps` (Task 2); existing `project`, `commit`, `get`.
- Produces: `packAllForSchema(schemaId: string): void`, `regenerateCard(cardId: string): void`, `deleteCard(cardId: string): void`.

- [ ] **Step 1: Write the failing test**

Append to `tests/flashcards-cardstores.test.ts`:
```ts
import { get } from 'svelte/store';

describe('card pack stores', () => {
  function seed3card() {
    S.initProject();
    const sid = S.addSchema('Words');
    S.updateSchema(sid, { fields: [
      { id: 'f1', key: 'title', label: 'Title', type: 'text', multilingual: true },
      { id: 'f2', key: 'def', label: 'Def', type: 'text', multilingual: true },
    ] });
    S.setTemplateLayout(sid, { layout: '3card' });
    S.addRecord(sid); S.addRecord(sid); S.addRecord(sid);
    return sid;
  }
  it('packAllForSchema persists cards and is undoable', () => {
    const sid = seed3card();
    S.packAllForSchema(sid);
    expect(get(S.project).cards.length).toBe(1); // 3 records / 3 = 1 card
    expect(get(S.dirty)).toBe(true);
    S.undo();
    expect(get(S.project).cards.length).toBe(0);
  });
  it('deleteCard removes a packed card', () => {
    const sid = seed3card();
    S.packAllForSchema(sid);
    S.deleteCard(get(S.project).cards[0].id);
    expect(get(S.project).cards.length).toBe(0);
  });
});
```
(If `S`/imports differ, match the file's existing import of `* as S` and `get`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- flashcards-cardstores`
Expected: FAIL — `S.packAllForSchema` not a function.

- [ ] **Step 3: Extend `stores.ts`**

Add `import * as cardOps from './cardOps';` (a new import line). Add the wrappers near the other card wrappers:
```ts
export function packAllForSchema(schemaId: string): void {
  commit(cardOps.packAllForSchema(get(project), schemaId));
}
export function regenerateCard(cardId: string): void {
  commit(cardOps.regenerateCard(get(project), cardId));
}
export function deleteCard(cardId: string): void {
  commit(cardOps.deleteCard(get(project), cardId));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- flashcards-cardstores`
Expected: PASS. `npm run check` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/modules/flashcards/stores.ts tests/flashcards-cardstores.test.ts
git commit -m "feat(flashcards): pack/regenerate/delete store wrappers"
```

---

## Task 4: CardGallery — packed cards + Pack all + status/regenerate/delete

**Files:**
- Modify: `src/lib/modules/flashcards/components/CardGallery.svelte`
- Test: `tests/CardGallery.test.ts` (add cases)

**Interfaces:**
- Consumes: `isCardStale`, `schemaForCard` (`../cardOps`); stores `project`, `packAllForSchema`, `regenerateCard`, `deleteCard`; existing `cardsPerPage`/`chunkRecords`/`recordsToCard`/`deriveAutoTemplate`, `buildCardHTML`/`getPaperPx`, `EmptyState`.

- [ ] **Step 1: Write the failing test**

Append to `tests/CardGallery.test.ts`:
```ts
describe('CardGallery — packed cards (compound)', () => {
  function seed3card(n: number) {
    S.initProject();
    const sid = S.addSchema('Words');
    S.updateSchema(sid, { fields: [
      { id: 'f1', key: 'title', label: 'Title', type: 'text', multilingual: true },
      { id: 'f2', key: 'def', label: 'Def', type: 'text', multilingual: true },
    ] });
    S.setTemplateLayout(sid, { layout: '3card' });
    for (let i = 0; i < n; i++) S.addRecord(sid);
    return sid;
  }
  it('Pack all creates persisted cards and excludes those records from the auto section', async () => {
    seed3card(4); // 4 records, 3card → after pack: 2 packed cards, 0 auto (all packed)
    const { container, getByRole } = render(CardGallery, { onOpen: vi.fn() });
    await fireEvent.click(getByRole('button', { name: /pack all/i }));
    expect(get(S.project).cards.length).toBe(2);
    // all 4 records are packed → no auto thumbnails, only the 2 packed thumbnails
    expect(container.querySelectorAll('.thumb.packed').length).toBe(2);
    expect(container.querySelectorAll('.thumb.auto').length).toBe(0);
  });
  it('shows a stale badge after a source record changes, cleared by Regenerate', async () => {
    const sid = seed3card(3);
    S.packAllForSchema(sid);
    S.setField(get(S.project).records[0].id, 'title', 'CHANGED', 'en');
    const { container, getByRole } = render(CardGallery, { onOpen: vi.fn() });
    expect(container.querySelector('.badge.stale')).toBeInTheDocument();
    await fireEvent.click(getByRole('button', { name: /regenerate/i }));
    expect(container.querySelector('.badge.stale')).not.toBeInTheDocument();
  });
  it('Delete removes a packed card', async () => {
    const sid = seed3card(3);
    S.packAllForSchema(sid);
    const { getByRole } = render(CardGallery, { onOpen: vi.fn() });
    await fireEvent.click(getByRole('button', { name: /delete/i }));
    expect(get(S.project).cards.length).toBe(0);
  });
});
```
(Ensure `get`, `fireEvent`, `vi` are imported in this test file; add if missing.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- CardGallery`
Expected: FAIL — no Pack all button / no `.thumb.packed`.

- [ ] **Step 3: Rewrite `CardGallery.svelte`**

Replace `src/lib/modules/flashcards/components/CardGallery.svelte` with:
```svelte
<script lang="ts">
  import '../lib/card-render.css';
  import Layers from 'lucide-svelte/icons/layers';
  import FilePlus from 'lucide-svelte/icons/file-plus';
  import RefreshCw from 'lucide-svelte/icons/refresh-cw';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import Package from 'lucide-svelte/icons/package';
  import { project, schemaEditorOpen, packAllForSchema, regenerateCard, deleteCard } from '../stores';
  import { deriveAutoTemplate, recordsToCard, cardsPerPage, chunkRecords } from '../cardMapping';
  import { isCardStale, schemaForCard } from '../cardOps';
  import { buildCardHTML, getPaperPx } from '../lib/card-render';
  import type { RecordItem, Schema, CardTemplate, Card } from '../model';
  import EmptyState from './EmptyState.svelte';

  let { onOpen }: { onOpen: (recordId: string) => void } = $props();

  const THUMB_W = 190;

  const groups = $derived($project.schemas.map((schema) => {
    const template = schema.cardTemplates[0] ?? deriveAutoTemplate(schema);
    const compound = cardsPerPage(template.layout) > 1;
    const recs = $project.records.filter((r) => r.schemaId === schema.id);
    const packed = compound
      ? $project.cards.filter((c) => c.packedRecordIds?.length && schemaForCard($project, c)?.id === schema.id)
      : [];
    const packedIds = new Set(packed.flatMap((c) => c.packedRecordIds ?? []));
    const autoRecs = recs.filter((r) => !packedIds.has(r.id));
    const autoChunks = chunkRecords(autoRecs, cardsPerPage(template.layout));
    const paper = getPaperPx(template.size || $project.settings.paperSize, template.orientation || $project.settings.orientation);
    const scale = Math.min(1, THUMB_W / paper.w);
    return { schema, template, compound, recs, packed, autoChunks, paper, scale };
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
  function packedCaption(card: Card): string {
    const n = card.packedRecordIds?.length ?? 0;
    const first = card.sections?.[0]?.label;
    const firstStr = first && typeof first === 'object' ? (first[$project.activeLocale] ?? '') : (typeof first === 'string' ? first : '');
    return (firstStr.trim() || 'Card') + (n > 1 ? ` +${n - 1}` : '');
  }
  function autoHtml(chunk: RecordItem[], schema: Schema, template: CardTemplate): string {
    return buildCardHTML(recordsToCard(chunk, schema, template, $project.settings, $project.activeLocale),
                         $project.settings, $project.activeLocale);
  }
  function packedHtml(card: Card): string {
    return buildCardHTML(card, $project.settings, $project.activeLocale); // render the stored snapshot
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
          <span class="count">{g.packed.length + g.autoChunks.length} card{g.packed.length + g.autoChunks.length === 1 ? '' : 's'}</span>
          {#if g.compound && g.recs.length > 0}
            <button type="button" class="pack-all" onclick={() => packAllForSchema(g.schema.id)}>
              <Package size={13} /> Pack all
            </button>
          {/if}
        </header>

        {#if g.packed.length === 0 && g.autoChunks.length === 0}
          <p class="hint">No records in this schema yet.</p>
        {:else}
          <div class="grid">
            <!-- Persisted packed cards (snapshots) -->
            {#each g.packed as card (card.id)}
              {@const stale = isCardStale(card, $project)}
              <div class="thumb packed">
                <button type="button" class="thumb-open" title={packedCaption(card)}
                  onclick={() => card.packedRecordIds?.[0] && onOpen(card.packedRecordIds[0])}>
                  <div class="thumb-frame" style={`width:${Math.round(g.paper.w * g.scale)}px;height:${Math.round(g.paper.h * g.scale)}px;`}>
                    <div class="thumb-scaler" style={`transform:scale(${g.scale});width:${g.paper.w}px;height:${g.paper.h}px;`}>
                      {@html packedHtml(card)}
                    </div>
                  </div>
                </button>
                <div class="thumb-meta">
                  <span class="badge {stale ? 'stale' : 'synced'}">{stale ? 'Stale' : 'Synced'}</span>
                  {#if stale}
                    <button type="button" class="icon-act" aria-label="regenerate" title="Regenerate from records"
                      onclick={() => regenerateCard(card.id)}><RefreshCw size={13} /></button>
                  {/if}
                  <button type="button" class="icon-act danger" aria-label="delete" title="Delete card"
                    onclick={() => deleteCard(card.id)}><Trash2 size={13} /></button>
                </div>
              </div>
            {/each}
            <!-- Auto-derived cards for records not in any packed card -->
            {#each g.autoChunks as chunk (chunk[0].id)}
              <button type="button" class="thumb auto" title={caption(chunk, g.schema)} onclick={() => onOpen(chunk[0].id)}>
                <div class="thumb-frame" style={`width:${Math.round(g.paper.w * g.scale)}px;height:${Math.round(g.paper.h * g.scale)}px;`}>
                  <div class="thumb-scaler" style={`transform:scale(${g.scale});width:${g.paper.w}px;height:${g.paper.h}px;`}>
                    {@html autoHtml(chunk, g.schema, g.template)}
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
  .pack-all { margin-left:auto; display:inline-flex; align-items:center; gap:5px; border:1px solid var(--border);
    background:transparent; color:var(--text); border-radius:6px; padding:4px 10px; font:inherit; font-size:12px;
    cursor:pointer; transition:background .12s ease, color .12s ease; }
  .pack-all:hover { background:var(--accent-weak); color:var(--accent); }
  .pack-all:focus-visible { outline:2px solid var(--accent); outline-offset:1px; }
  .hint { color:var(--text-muted); font-size:12px; margin:0; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(190px, 1fr)); gap:14px; align-items:start; }

  .thumb { display:flex; flex-direction:column; align-items:center; gap:6px; border:none; background:transparent;
    padding:6px; border-radius:10px; font:inherit; }
  .thumb.auto { cursor:pointer; transition:background .12s ease; }
  .thumb.auto:hover { background:var(--accent-weak); }
  .thumb.auto:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
  .thumb-open { border:none; background:transparent; padding:0; cursor:pointer; }
  .thumb-frame { flex:none; border-radius:2px; box-shadow:0 1px 2px rgba(0,0,0,.08), 0 6px 18px rgba(0,0,0,.12);
    overflow:hidden; transition:box-shadow .12s ease, transform .12s ease; }
  .thumb.auto:hover .thumb-frame, .thumb.auto:focus-visible .thumb-frame,
  .thumb-open:hover .thumb-frame, .thumb-open:focus-visible .thumb-frame {
    transform:translateY(-2px); box-shadow:0 0 0 2px var(--accent), 0 10px 24px rgba(0,0,0,.20); }
  .thumb-scaler { transform-origin:top left; }
  .thumb-cap { font-size:12px; color:var(--text); max-width:190px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

  .thumb-meta { display:flex; align-items:center; gap:6px; }
  .badge { font-size:11px; font-weight:600; border-radius:10px; padding:1px 8px; }
  .badge.synced { color:var(--accent); background:var(--accent-weak); }
  .badge.stale { color:#b45309; background:#fef3c7; }
  .icon-act { display:inline-flex; align-items:center; border:1px solid var(--border); background:transparent;
    color:var(--text-muted); border-radius:6px; padding:3px; cursor:pointer; transition:background .12s ease, color .12s ease; }
  .icon-act:hover { background:var(--accent-weak); color:var(--accent); }
  .icon-act.danger:hover { background:#fee; color:#b91c1c; }
  .icon-act:focus-visible { outline:2px solid var(--accent); outline-offset:1px; }

  .cta { border:1px solid var(--accent); background:var(--accent); color:#fff; font-weight:600;
    border-radius:6px; padding:6px 14px; font:inherit; font-size:12px; cursor:pointer; }
  .cta:hover { opacity:.92; }
  .cta:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
</style>
```
(The stale badge uses hardcoded amber `#b45309`/`#fef3c7` and danger red `#fee`/`#b91c1c` — this repo has no warning/danger token, matching the existing precedent in RecordDetail/SchemaEditorModal.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- CardGallery`
Expected: PASS (existing #4a cases + the 3 new ones). `npm run check` → 0 errors.

- [ ] **Step 5: Run all gates**

Run: `npm test` → all green, 0 unhandled (re-run once if transient EBUSY noise).
Run: `npm run check` → 0 errors (pre-existing `TreeNode` warning may remain).
Run: `npm run build` → OK.

- [ ] **Step 6: Manual verification (`npm run tauri dev`)**

- New Flashcards → schema `Words` (title, def) → set layout **3card** in the preview → add ~4 records.
- **Cards view**: the `Words` section shows 2 auto-chunked thumbnails (3 + 1) and a **Pack all** button.
- Click **Pack all** → 2 **packed** cards appear (each with a **Synced** badge + Delete); the auto thumbnails for those records are gone (packed excludes them).
- Edit one of the packed records' text in **Records view** → back in Cards view that card shows a **Stale** badge + a **Regenerate** button; click Regenerate → badge returns to Synced and the thumbnail updates.
- **Delete** a packed card → its records reappear as auto thumbnails.
- **Ctrl+S**, reopen the `.tomoe.json` → packed cards persist; status recomputed (Synced if unchanged).
- Undo/redo covers Pack all / Regenerate / Delete.

- [ ] **Step 7: Commit**

```bash
git add src/lib/modules/flashcards/components/CardGallery.svelte tests/CardGallery.test.ts
git commit -m "feat(flashcards): packed cards in gallery — Pack all, status, regenerate, delete"
```

---

## Self-review notes (author)

- **Spec coverage:** `Card.sourceHash` + `hashFields` (T1); packRecords/packAllForSchema/regenerateCard/deleteCard/isCardStale + `schemaForCard` (T2); store wrappers, undoable (T3); CardGallery Pack all + persisted packed cards with synced/stale badge + Regenerate + Delete, packed records excluded from auto, single unchanged (T4). Persist round-trip via existing serialize (packed cards are plain `Card`s in `project.cards`). All mapped.
- **Out of scope** (manual pack dialog, card content editing/apply→record, persisting singles, non-3card compounds) — not implemented.
- **Type/interface consistency:** `packRecords(project, schemaId, recordIds)`, `packAllForSchema(project, schemaId)`, `regenerateCard(project, cardId)`, `deleteCard(project, cardId)`, `isCardStale(card, project)`, `schemaForCard(project, card)`, `hashFields(project, recordIds)` used identically across cardOps, stores, and CardGallery. Packed cards are associated to schemas via `schemaForCard` everywhere (never by templateId equality).
- **Testing gap (declared):** thumbnails render `buildCardHTML` output (pure string) via `{@html}` — asserted structurally (`.thumb.packed`/`.thumb.auto` counts, `.badge.stale` presence). Snapshot cards render their stored content; a locale switch after packing shows pack-time locale until Regenerate (documented behavior, not covered by a test). Visual fidelity confirmed in the T4 manual pass.
```
