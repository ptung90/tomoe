# Flashcards Escape-hatch Card Edit + Apply card→record Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user edit a persisted packed card's cell content (label + content + image) in a modal, flag it **Edited**, and **Apply to records** (push the edits back into the mapped source-record fields, reverse of the pack auto-map) — or **Regenerate** to discard edits and re-pull from records.

**Architecture:** Pure `cardOps` gains `setCardCell` (edit a cell + set `edited`) and `applyCardToRecords` (reverse-map cell→record fields + restamp `sourceHash` + clear `edited`); `stores` wraps them + a `cardEditorOpen` UI store; a new `CardEditorModal` edits cells (RichText/ImageField); `CardGallery` gets an Edit button, an Apply button (when edited), and an Edited badge.

**Tech Stack:** Svelte 5 (runes), TypeScript, Vite 5, vitest + @testing-library/svelte, Tauri plugin-dialog (confirm).

## Global Constraints

- Everything under `src/lib/modules/flashcards/`. Module isolation; `cardEditorOpen` is UI-only (not in history).
- Only **packed** cards (persisted, from #4b) are editable. Single-layout cards stay auto-derived (edit their record instead).
- Escape-hatch edits **content only**: per cell `label`, `content` (Markdown), `image` (URL). No per-card layout/style/appearance editing (later); no image search/crop (#5 — reuse the existing `ImageField` URL/paste/pick).
- Apply is the exact inverse of the compound auto-map (`recordsToCard`): cell `i` → record `packedRecordIds[i]`; label → first text field, content → second text field, image → first image field. Text written to `activeLocale` when the field value is a multilingual object, else plain string.
- `Card.edited?: boolean`; both Apply and Regenerate return the card to Synced (restamp `sourceHash`, clear `edited`). Badge precedence: `edited ? 'Edited' : isCardStale ? 'Stale' : 'Synced'`.
- Pure `cardOps` stays pure (no Svelte/DOM), immutable (never mutate input `Project`).
- Card interior = fixed print colors (`card-render.css`); chrome = Calm Paper tokens; `#fff` on accent + hardcoded amber(stale)/blue(edited)/red(danger) accepted (no tokens exist; matches existing precedent).
- lucide-svelte icons: subpath imports only.
- Gates: `npm run check` 0 errors · `npm test` green, 0 unhandled · `npm run build` OK. TDD: failing test first for pure logic. Commit per task.

## File map

```
src/lib/modules/flashcards/
  model.ts                 # MODIFY: Card.edited?: boolean
  cardOps.ts               # MODIFY: setCardCell, applyCardToRecords (regenerateCard already clears edited by rebuilding)
  stores.ts                # MODIFY: cardEditorOpen store; setCardCell, applyCardToRecords wrappers
  Workspace.svelte         # MODIFY: mount <CardEditorModal/> (next to SchemaEditorModal) so it's outside CardGallery
  components/
    CardEditorModal.svelte # NEW: per-cell label + content (RichText) + image (ImageField); no jsdom test (mounts TipTap)
    CardGallery.svelte     # MODIFY: Edit button (sets cardEditorOpen), Apply (when edited), Edited badge
tests/
  cardOps.test.ts          # extend
  flashcards-cardstores.test.ts  # extend
  CardGallery.test.ts      # extend
```

Model (`model.ts` line 19): `Card` currently ends `… packedRecordIds?: string[]; sourceHash?: string; [k: string]: unknown }`. Add `edited?: boolean` before the index signature. `CardSection.label/content` are `LocalizedText` but a packed card stores resolved plain strings. `cardOps.ts` current: `schemaForCard`, `packRecords`, `packAllForSchema`, `regenerateCard` (`next = {...rebuilt, id, sourceHash}` — rebuilt has no `edited`, so regenerate already produces a non-edited card), `deleteCard`, `isCardStale`.

---

## Task 1: cardOps — setCardCell + applyCardToRecords

**Files:**
- Modify: `src/lib/modules/flashcards/model.ts` (add `Card.edited?: boolean`)
- Modify: `src/lib/modules/flashcards/cardOps.ts`
- Test: `tests/cardOps.test.ts` (add a describe block)

**Interfaces:**
- Produces:
  - `setCardCell(project: Project, cardId: string, i: number, patch: { label?: string; content?: string; image?: string }): Project`
  - `applyCardToRecords(project: Project, cardId: string): Project`

- [ ] **Step 1: Write the failing test**

Append to `tests/cardOps.test.ts` (reuse the file's existing `proj()` helper + imports; add `setCardCell`, `applyCardToRecords` to the `ops` usage):
```ts
describe('setCardCell / applyCardToRecords', () => {
  it('setCardCell edits a cell and marks the card edited', () => {
    let p = ops.packAllForSchema(proj('3card', 3), 's1');
    const id = p.cards[0].id;
    p = ops.setCardCell(p, id, 0, { label: 'NEWLABEL', content: 'NEWBODY', image: 'http://x/z.png' });
    const c = p.cards[0];
    expect(c.sections[0].label).toBe('NEWLABEL');
    expect(c.sections[0].content).toBe('NEWBODY');
    expect(c.images.find((im) => im.slot === 0)?.url).toBe('http://x/z.png');
    expect(c.edited).toBe(true);
  });
  it('setCardCell with empty image removes that cell image', () => {
    let p = ops.packAllForSchema(proj('3card', 3), 's1');
    const id = p.cards[0].id;
    p = ops.setCardCell(p, id, 0, { image: 'http://x/z.png' });
    p = ops.setCardCell(p, id, 0, { image: '' });
    expect(p.cards[0].images.find((im) => im.slot === 0)).toBeUndefined();
  });
  it('applyCardToRecords writes label→1st text field, content→2nd, image→image field of the mapped record', () => {
    // proj: fields title(text), def(text); add an image field so apply can write it
    let p = proj('3card', 3);
    p.schemas[0].fields.push({ id: 'f3', key: 'pic', label: 'Pic', type: 'image' });
    p.records.forEach((r) => { r.fields.pic = ''; });
    p = ops.packAllForSchema(p, 's1');
    const id = p.cards[0].id;
    p = ops.setCardCell(p, id, 0, { label: 'Owl', content: 'a bird', image: 'http://x/o.png' });
    p = ops.applyCardToRecords(p, id);
    const r0 = p.records.find((r) => r.id === 'r0')!;
    expect((r0.fields.title as Record<string, string>).en).toBe('Owl');   // 1st text field, active locale (en)
    expect((r0.fields.def as Record<string, string>).en).toBe('a bird');  // 2nd text field
    expect(r0.fields.pic).toBe('http://x/o.png');                          // image field (plain string)
    expect(p.cards[0].edited).toBe(false);                                 // cleared
    expect(ops.isCardStale(p.cards[0], p)).toBe(false);                    // restamped → synced
  });
  it('applyCardToRecords skips a cell whose source record was deleted', () => {
    let p = ops.packAllForSchema(proj('3card', 3), 's1');
    const id = p.cards[0].id;
    p = ops.setCardCell(p, id, 1, { label: 'X' });
    p = { ...p, records: p.records.filter((r) => r.id !== 'r1') }; // delete the cell-1 record
    expect(() => ops.applyCardToRecords(p, id)).not.toThrow();
    expect(p.records.find((r) => r.id === 'r1')).toBeUndefined();
  });
  it('regenerateCard clears the edited flag', () => {
    let p = ops.packAllForSchema(proj('3card', 3), 's1');
    const id = p.cards[0].id;
    p = ops.setCardCell(p, id, 0, { label: 'X' });
    expect(p.cards[0].edited).toBe(true);
    p = ops.regenerateCard(p, id);
    expect(p.cards[0].edited).toBeFalsy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- cardOps`
Expected: FAIL — `ops.setCardCell` is not a function.

- [ ] **Step 3: Implement**

Add `edited?: boolean` to `Card` in `model.ts` (before the index signature):
```ts
  packedRecordIds?: string[]; sourceHash?: string; edited?: boolean; [k: string]: unknown }
```
Append to `src/lib/modules/flashcards/cardOps.ts`:
```ts
import type { CardSection, CardImage } from './model';

function asStr(v: unknown): string { return typeof v === 'string' ? v : ''; }

export function setCardCell(
  project: Project, cardId: string, i: number,
  patch: { label?: string; content?: string; image?: string },
): Project {
  const cards = project.cards.map((card) => {
    if (card.id !== cardId) return card;
    let sections: CardSection[] = card.sections;
    if (patch.label !== undefined || patch.content !== undefined) {
      sections = card.sections.map((s, idx) => (idx === i
        ? { ...s,
            ...(patch.label !== undefined ? { label: patch.label } : {}),
            ...(patch.content !== undefined ? { content: patch.content } : {}) }
        : s));
    }
    let images: CardImage[] = card.images;
    if (patch.image !== undefined) {
      const others = card.images.filter((im) => im.slot !== i);
      images = patch.image ? [...others, { slot: i, url: patch.image }] : others;
    }
    return { ...card, sections, images, edited: true };
  });
  return { ...project, cards };
}

export function applyCardToRecords(project: Project, cardId: string): Project {
  const card = project.cards.find((c) => c.id === cardId);
  if (!card || !card.packedRecordIds?.length) return project;
  const schema = schemaForCard(project, card);
  if (!schema) return project;
  const textFields = schema.fields.filter((f) => f.type !== 'image');
  const imageFields = schema.fields.filter((f) => f.type === 'image');
  const labelField = textFields[0] ?? null;
  const contentField = textFields[1] ?? null;
  const imageField = imageFields[0] ?? null;
  const locale = project.activeLocale;
  const ids = card.packedRecordIds;

  const write = (fields: Record<string, unknown>, key: string | undefined, value: string) => {
    if (!key) return;
    const cur = fields[key];
    if (cur && typeof cur === 'object') fields[key] = { ...(cur as Record<string, string>), [locale]: value };
    else fields[key] = value;
  };

  const records = project.records.map((rec) => {
    const idx = ids.indexOf(rec.id);
    if (idx < 0) return rec;
    const section = card.sections[idx];
    const image = card.images.find((im) => im.slot === idx);
    const fields: Record<string, unknown> = { ...rec.fields };
    if (section) {
      write(fields, labelField?.key, asStr(section.label));
      write(fields, contentField?.key, asStr(section.content));
    }
    if (imageField) write(fields, imageField.key, image?.url ?? '');
    return { ...rec, fields: fields as RecordItem['fields'] };
  });

  const updated = { ...project, records };
  const restamped: Card = { ...card, sourceHash: hashFields(updated, ids), edited: false };
  return { ...updated, cards: project.cards.map((c) => (c.id === cardId ? restamped : c)) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- cardOps`
Expected: PASS (existing + 5 new). `npm run check` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/modules/flashcards/model.ts src/lib/modules/flashcards/cardOps.ts tests/cardOps.test.ts
git commit -m "feat(flashcards): Card.edited + setCardCell + applyCardToRecords"
```

---

## Task 2: store wrappers + cardEditorOpen

**Files:**
- Modify: `src/lib/modules/flashcards/stores.ts`
- Test: `tests/flashcards-cardstores.test.ts` (add a describe block)

**Interfaces:**
- Consumes: `cardOps.setCardCell`, `cardOps.applyCardToRecords` (Task 1); existing `project`, `commit`, `get`.
- Produces: `cardEditorOpen: Writable<string | null>`; `setCardCell(cardId, i, patch): void`; `applyCardToRecords(cardId): void`.

- [ ] **Step 1: Write the failing test**

Append to `tests/flashcards-cardstores.test.ts`:
```ts
describe('card edit stores', () => {
  function seed3cardImg() {
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
  it('setCardCell edits + marks edited (undoable); applyCardToRecords writes back', () => {
    const sid = seed3cardImg();
    S.packAllForSchema(sid);
    const cardId = get(S.project).cards[0].id;
    const r0 = get(S.project).cards[0].packedRecordIds![0];
    S.setCardCell(cardId, 0, { label: 'Owl', content: 'a bird' });
    expect(get(S.project).cards[0].edited).toBe(true);
    S.applyCardToRecords(cardId);
    const rec = get(S.project).records.find((r) => r.id === r0)!;
    expect((rec.fields.title as Record<string, string>).en).toBe('Owl');
    expect(get(S.project).cards[0].edited).toBe(false);
    S.undo(); // undo the apply
    expect(get(S.project).cards[0].edited).toBe(true);
  });
  it('cardEditorOpen toggles', () => {
    S.cardEditorOpen.set('abc');
    expect(get(S.cardEditorOpen)).toBe('abc');
    S.cardEditorOpen.set(null);
    expect(get(S.cardEditorOpen)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- flashcards-cardstores`
Expected: FAIL — `S.setCardCell` / `S.cardEditorOpen` undefined.

- [ ] **Step 3: Extend `stores.ts`**

Add the UI store near the other UI-only writables (e.g. by `schemaEditorOpen`):
```ts
export const cardEditorOpen = writable<string | null>(null);
```
Add wrappers near the other card wrappers:
```ts
export function setCardCell(cardId: string, i: number, patch: { label?: string; content?: string; image?: string }): void {
  commit(cardOps.setCardCell(get(project), cardId, i, patch));
}
export function applyCardToRecords(cardId: string): void {
  commit(cardOps.applyCardToRecords(get(project), cardId));
}
```
(`writable` is already imported; `cardOps` is already imported as `* as cardOps` from `./cardOps`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- flashcards-cardstores`
Expected: PASS. `npm run check` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/modules/flashcards/stores.ts tests/flashcards-cardstores.test.ts
git commit -m "feat(flashcards): cardEditorOpen + setCardCell/applyCardToRecords wrappers"
```

---

## Task 3: CardEditorModal component

**Files:**
- Create: `src/lib/modules/flashcards/components/CardEditorModal.svelte`

**Interfaces:**
- Consumes: stores `project`, `cardEditorOpen`, `setCardCell`; `RichText`, `ImageField`; `keyedDebounce`.
- Produces: `<CardEditorModal />` — renders nothing when `$cardEditorOpen` matches no card; otherwise a modal editing that card's cells.

**Testing note:** this component mounts `RichText` (TipTap) per cell, which is unreliable under jsdom — so it has **no automated test** (same convention as `RichText.svelte`). Verification = `npm run check` 0 errors + the Task 4 manual pass. Its logic (`setCardCell`) is unit-tested in Tasks 1-2. Do NOT add a jsdom test that mounts this modal.

- [ ] **Step 1: Implement `CardEditorModal.svelte`**

Create `src/lib/modules/flashcards/components/CardEditorModal.svelte`:
```svelte
<script lang="ts">
  import X from 'lucide-svelte/icons/x';
  import { project, cardEditorOpen, setCardCell } from '../stores';
  import { keyedDebounce } from '../../../debounce';
  import RichText from './RichText.svelte';
  import ImageField from './ImageField.svelte';

  const card = $derived($project.cards.find((c) => c.id === $cardEditorOpen) ?? null);
  const cellCount = $derived(card ? Math.max(card.sections.length, card.packedRecordIds?.length ?? 0) : 0);

  const debounced = keyedDebounce(
    (cardId: string, i: number, patch: { label?: string; content?: string }) => setCardCell(cardId, i, patch),
    300,
  );
  function onText(i: number, patch: { label?: string; content?: string }) {
    if (card) debounced.call(`${card.id}|${i}`, card.id, i, patch);
  }
  function onImage(i: number, url: string) { if (card) setCardCell(card.id, i, { image: url }); }

  const str = (v: unknown): string => (typeof v === 'string' ? v : '');
  const cellLabel = (i: number) => str(card?.sections[i]?.label);
  const cellContent = (i: number) => str(card?.sections[i]?.content);
  const cellImage = (i: number) => card?.images.find((im) => im.slot === i)?.url ?? '';

  function close() { cardEditorOpen.set(null); }

  // Flush pending debounced text edits when closing / switching cards.
  let lastId: string | null = null;
  $effect(() => {
    const id = $cardEditorOpen;
    if (id !== lastId) { debounced.flushAll(); lastId = id; }
  });
</script>

{#if card}
  <div class="overlay" role="dialog" aria-modal="true">
    <div class="modal">
      <header class="modal-head">
        <span>Edit card</span>
        <button type="button" aria-label="close" onclick={close}><X size={16} /></button>
      </header>
      <div class="modal-body">
        {#each Array(cellCount) as _, i (i)}
          <div class="cell">
            <span class="cell-title">Card {i + 1}</span>
            <label class="fld"><span class="lbl">Label</span>
              <input value={cellLabel(i)} oninput={(e) => onText(i, { label: (e.target as HTMLInputElement).value })} />
            </label>
            <div class="fld"><span class="lbl">Content</span>
              <RichText value={cellContent(i)} onChange={(md) => onText(i, { content: md })} />
            </div>
            <div class="fld"><span class="lbl">Image</span>
              <ImageField value={cellImage(i)} onChange={(u) => onImage(i, u)} />
            </div>
          </div>
        {/each}
      </div>
      <footer class="modal-foot">
        <span class="spacer"></span>
        <button type="button" class="primary" onclick={close}>Done</button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .overlay { position:fixed; inset:0; background:rgba(0,0,0,.4); display:flex; align-items:center;
    justify-content:center; z-index:50; }
  .modal { background:var(--surface); color:var(--text); border:1px solid var(--border); border-radius:12px;
    width:min(640px,94vw); max-height:88vh; display:flex; flex-direction:column; }
  .modal-head { display:flex; align-items:center; justify-content:space-between; padding:12px 16px;
    border-bottom:1px solid var(--border); font-weight:600; }
  .modal-head button { border:none; background:transparent; color:var(--text-muted); }
  .modal-body { padding:14px 16px; overflow:auto; display:flex; flex-direction:column; gap:16px; }
  .cell { display:flex; flex-direction:column; gap:8px; padding:10px 12px; border:1px solid var(--border); border-radius:8px; }
  .cell-title { font-size:11px; font-weight:600; letter-spacing:.04em; text-transform:uppercase; color:var(--text-muted); }
  .fld { display:flex; flex-direction:column; gap:5px; }
  .lbl { font-size:12px; font-weight:600; color:var(--text-muted); }
  .fld input { padding:7px 9px; border:1px solid var(--border); border-radius:6px; background:var(--bg); color:var(--text); font:inherit; }
  .modal-foot { display:flex; align-items:center; padding:12px 16px; border-top:1px solid var(--border); }
  .spacer { flex:1; }
  .modal-foot .primary { border:1px solid var(--accent); background:var(--accent); color:#fff; font-weight:600;
    border-radius:6px; padding:6px 14px; font:inherit; }
</style>
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run check`
Expected: 0 errors (pre-existing `TreeNode` warning may remain). Do NOT add a test.

- [ ] **Step 3: Commit**

```bash
git add src/lib/modules/flashcards/components/CardEditorModal.svelte
git commit -m "feat(flashcards): CardEditorModal (per-cell label/content/image)"
```

---

## Task 4: CardGallery — Edit / Apply / Edited badge + mount editor

**Files:**
- Modify: `src/lib/modules/flashcards/components/CardGallery.svelte`
- Modify: `src/lib/modules/flashcards/Workspace.svelte` (mount `<CardEditorModal/>`)
- Test: `tests/CardGallery.test.ts` (add cases)

**Interfaces:**
- Consumes: stores `cardEditorOpen`, `applyCardToRecords` (+ existing `regenerateCard`/`deleteCard`); `@tauri-apps/plugin-dialog` `confirm`; `CardEditorModal` (Task 3).

**Why the modal mounts in Workspace, not CardGallery:** `CardEditorModal` renders `RichText` (TipTap) when open. Mounting it inside `CardGallery` would make the CardGallery test that opens the editor mount TipTap in jsdom (unreliable). Mounting it in `Workspace` (alongside `SchemaEditorModal`) keeps it out of the CardGallery render tree, so the CardGallery test only asserts the `cardEditorOpen` store value. No workspace test opens the editor, so TipTap never mounts under jsdom.

- [ ] **Step 1: Write the failing test**

Append to `tests/CardGallery.test.ts` (mock plugin-dialog if not already mocked at top of file — add `vi.mock('@tauri-apps/plugin-dialog', () => ({ confirm: vi.fn(async () => true) }));`):
```ts
describe('CardGallery — edit + apply', () => {
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
  it('Edit button opens the card editor', async () => {
    const sid = seed3card(3);
    S.packAllForSchema(sid);
    const { getByRole } = render(CardGallery, { onOpen: vi.fn() });
    await fireEvent.click(getByRole('button', { name: /^edit/i }));
    expect(get(S.cardEditorOpen)).toBe(get(S.project).cards[0].id);
    S.cardEditorOpen.set(null);
  });
  it('Apply shows when edited and writes back to records + clears Edited', async () => {
    const sid = seed3card(3);
    S.packAllForSchema(sid);
    const cardId = get(S.project).cards[0].id;
    const r0 = get(S.project).cards[0].packedRecordIds![0];
    S.setCardCell(cardId, 0, { label: 'Owl' });
    const { container, getByRole } = render(CardGallery, { onOpen: vi.fn() });
    expect(container.querySelector('.badge.edited')).toBeInTheDocument();
    await fireEvent.click(getByRole('button', { name: /apply/i }));
    expect((get(S.project).records.find((r) => r.id === r0)!.fields.title as Record<string, string>).en).toBe('Owl');
    expect(container.querySelector('.badge.edited')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- CardGallery`
Expected: FAIL — no Edit button / no `.badge.edited`.

- [ ] **Step 3: Modify `CardGallery.svelte`**

- imports: add `Pencil from 'lucide-svelte/icons/pencil'`, `Upload from 'lucide-svelte/icons/upload'`, `confirm` from `@tauri-apps/plugin-dialog`, and `cardEditorOpen`/`applyCardToRecords` from `../stores`. (Do NOT import/mount `CardEditorModal` here — it is mounted in Workspace, see below.)
- Add an apply handler in the script:
```ts
  async function onApply(cardId: string) {
    if (await confirm("Apply this card's content back to its records? This overwrites the record fields.",
                      { title: 'Apply to records', kind: 'warning' })) {
      applyCardToRecords(cardId);
    }
  }
```
- In the packed-card `.thumb-meta` block, replace the badge + actions with (compute `edited`):
```svelte
                <div class="thumb-meta">
                  {@const edited = !!card.edited}
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
```
(Note the `{@const stale = isCardStale(card, $project)}` already exists just above the `.thumb.packed` div — keep it; add the `{@const edited …}` inside `.thumb-meta` as shown.)
- Add `.badge.edited { color:#1d4ed8; background:#dbeafe; }` to the `<style>` (near `.badge.stale`).

Then MOUNT the editor in `Workspace.svelte` (NOT CardGallery): add `import CardEditorModal from './components/CardEditorModal.svelte';` and render `<CardEditorModal />` right next to the existing `<SchemaEditorModal />` (it renders nothing until `cardEditorOpen` is set, and lives in both Records and Cards views).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- CardGallery`
Expected: PASS (existing + 2 new). `npm run check` → 0 errors.

- [ ] **Step 5: Run all gates**

Run: `npm test` → all green, 0 unhandled (re-run once if transient EBUSY noise).
Run: `npm run check` → 0 errors.
Run: `npm run build` → OK.

- [ ] **Step 6: Manual verification (`npm run tauri dev`)**

- Schema `Words` (title, def) + layout `3card`; add an `image` field too (Pic). Add ~3 records. Cards view → **Pack all** → a packed card (Synced).
- Click **Edit** (pencil) → modal opens with 3 cells; each has Label input, Content rich-text, Image (URL/paste/pick). Change a cell's label/content/image → **Done**. The card thumbnail updates and its badge becomes **Edited**.
- Click **Apply** (upload icon) → confirm → the source records' fields update (check in Records view: title=label, def=content, Pic=image) and the badge returns to **Synced**.
- Edit again, then click **Regenerate** → edits discarded, re-pulled from records, badge Synced.
- Undo/redo covers edit / apply / regenerate. Ctrl+S then reopen → `edited` + content persist.

- [ ] **Step 7: Commit**

```bash
git add src/lib/modules/flashcards/components/CardGallery.svelte src/lib/modules/flashcards/Workspace.svelte tests/CardGallery.test.ts
git commit -m "feat(flashcards): card Edit/Apply/Edited badge + mount CardEditorModal"
```

---

## Self-review notes (author)

- **Spec coverage:** `Card.edited` + `setCardCell` + `applyCardToRecords` (T1); `cardEditorOpen` + wrappers, undoable (T2); `CardEditorModal` per-cell label/content/image (T3); CardGallery Edit button, Apply-when-edited (confirm), Edited badge, mounted editor (T4). Apply is the exact inverse of the compound auto-map, writes to `activeLocale`, restamps `sourceHash`, clears `edited`; Regenerate already clears `edited` (rebuilds without it). All mapped.
- **Refinement vs spec:** the **Apply** button lives on the gallery card (next to the status badge) rather than in the modal footer — better UX (apply where you see the Edited state) and testable without mounting the modal's TipTap. The modal is edit + Done only.
- **Out of scope** (per-card appearance/layout/style, single-card editing, image search/crop) — not implemented.
- **Type/interface consistency:** `setCardCell(project, cardId, i, patch)` and `applyCardToRecords(project, cardId)` used identically across cardOps, stores, and components; reverse map mirrors `recordsToCard`'s compound auto-map (label=1st text, content=2nd text, image=1st image).
- **Testing gap (declared):** `CardEditorModal` mounts `RichText` (TipTap) per cell → no jsdom test (same convention as `RichText.svelte`); verified via `npm run check` + the T4 manual pass. Its `setCardCell`/apply logic is fully covered by cardOps + stores + CardGallery tests.
```
