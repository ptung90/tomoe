# Flashcards Export (print / PDF) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A "Print / Export PDF" button that prints every flashcard (one per page, real paper size) via the webview print dialog (→ Save as PDF). No PDF library.

**Architecture:** Pure `collectPrintCards(project)` returns the same card set the gallery shows (packed + auto). `PrintView` renders those cards off-screen with `@media print` isolation. A header button calls `window.print()`.

**Tech Stack:** Svelte 5, TS, vitest. No new deps.

## Global Constraints

- Everything under `src/lib/modules/flashcards/`. Module isolation.
- No PDF/canvas library — `window.print()` only. Card interior colors from `card-render.css`; chrome = Calm Paper tokens; lucide subpath imports.
- `collectPrintCards` is pure, mirrors `CardGallery` (packed cards + auto-derived cards for unpacked records) so print == on-screen.
- Print isolation lives in `PrintView`'s `<style>` via `@media print` + `:global(...)`; PrintView is `display:none` on screen.
- Gates: `npm run check` 0 errors · `npm test` green, 0 unhandled · `npm run build` OK. TDD for pure logic.

## File map

```
src/lib/modules/flashcards/
  lib/printCards.ts       # NEW: collectPrintCards(project): Card[]
  components/PrintView.svelte  # NEW
  Workspace.svelte        # MODIFY: Print button + mount <PrintView/>
tests/ printCards.test.ts (NEW), PrintView.test.ts (NEW), flashcards-workspace.test.ts (extend)
```

---

## Task 1: printCards.ts — collectPrintCards

**Files:** Create `src/lib/modules/flashcards/lib/printCards.ts`; Test `tests/printCards.test.ts`.

**Interfaces:** `collectPrintCards(project: Project): Card[]`.

- [ ] **Step 1: Write the failing test**

Create `tests/printCards.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { newProject, type Project, type Schema } from '../src/lib/modules/flashcards/model';
import * as cardOps from '../src/lib/modules/flashcards/cardOps';
import { collectPrintCards } from '../src/lib/modules/flashcards/lib/printCards';

function proj(layout: string, n: number): Project {
  const p = newProject();
  const schema: Schema = { id: 's1', name: 'W', cardTemplates: [
    { id: 't1', templateType: layout === '3card' ? 'compound' : 'single', layout, size: null, orientation: undefined, hideTitle: false, hideSectionLabels: false, mapping: {} },
  ], fields: [{ id: 'f1', key: 'title', label: 'T', type: 'text', multilingual: true }] };
  p.schemas.push(schema);
  for (let i = 0; i < n; i++) p.records.push({ id: 'r' + i, schemaId: 's1', fieldsHash: '', fields: { title: { en: 'W' + i, vi: '' } } });
  return p;
}

describe('collectPrintCards', () => {
  it('single layout → one card per record', () => {
    expect(collectPrintCards(proj('1top-1bot', 3))).toHaveLength(3);
  });
  it('3card → auto-chunked pages (4 records → 2)', () => {
    expect(collectPrintCards(proj('3card', 4))).toHaveLength(2);
  });
  it('packed cards + auto for unpacked (3card, 4 records, pack all → 2 packed, 0 auto)', () => {
    const packed = cardOps.packAllForSchema(proj('3card', 4), 's1');
    const cards = collectPrintCards(packed);
    expect(cards).toHaveLength(2);
    expect(cards.every((c) => c.packedRecordIds?.length)).toBe(true); // all packed snapshots
  });
  it('empty project → []', () => {
    expect(collectPrintCards(newProject())).toEqual([]);
  });
});
```

- [ ] **Step 2: RED** — `npm test -- printCards` fails (cannot resolve).

- [ ] **Step 3: Implement**

Create `src/lib/modules/flashcards/lib/printCards.ts`:
```ts
import type { Project, Card } from '../model';
import { deriveAutoTemplate, recordsToCard, cardsPerPage, chunkRecords } from '../cardMapping';
import { schemaForCard } from '../cardOps';

/** Every card the Cards gallery shows, in schema order: persisted packed cards
 *  plus auto-derived cards for records not in any packed card. Pure. */
export function collectPrintCards(project: Project): Card[] {
  const out: Card[] = [];
  for (const schema of project.schemas) {
    const template = schema.cardTemplates[0] ?? deriveAutoTemplate(schema);
    const compound = cardsPerPage(template.layout) > 1;
    const recs = project.records.filter((r) => r.schemaId === schema.id);
    const packed = compound
      ? project.cards.filter((c) => c.packedRecordIds?.length && schemaForCard(project, c)?.id === schema.id)
      : [];
    out.push(...packed);
    const packedIds = new Set(packed.flatMap((c) => c.packedRecordIds ?? []));
    const autoRecs = recs.filter((r) => !packedIds.has(r.id));
    for (const chunk of chunkRecords(autoRecs, cardsPerPage(template.layout))) {
      out.push(recordsToCard(chunk, schema, template, project.settings, project.activeLocale));
    }
  }
  return out;
}
```

- [ ] **Step 4: GREEN** — `npm test -- printCards` passes (4). `npm run check` 0 errors.
- [ ] **Step 5: Commit** — `git add src/lib/modules/flashcards/lib/printCards.ts tests/printCards.test.ts && git commit -m "feat(flashcards): collectPrintCards (gallery card set for print)"`

---

## Task 2: PrintView component

**Files:** Create `src/lib/modules/flashcards/components/PrintView.svelte`; Test `tests/PrintView.test.ts`.

- [ ] **Step 1: Write the failing test**

Create `tests/PrintView.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { render } from '@testing-library/svelte';
import PrintView from '../src/lib/modules/flashcards/components/PrintView.svelte';
import * as S from '../src/lib/modules/flashcards/stores';

beforeEach(() => {
  S.initProject();
  const sid = S.addSchema('Words');
  S.updateSchema(sid, { fields: [{ id: 'f1', key: 'title', label: 'Title', type: 'text', multilingual: true }] });
  S.addRecord(sid); S.addRecord(sid);
});

describe('PrintView', () => {
  it('renders one .print-page per collected card, each with a card', () => {
    const { container } = render(PrintView);
    const pages = container.querySelectorAll('.print-page');
    expect(pages.length).toBe(get(S.project).records.length); // single layout → 1 per record
    expect(container.querySelector('.print-page .fc-card')).toBeInTheDocument();
  });
  it('renders nothing but the container when there are no cards', () => {
    S.initProject();
    const { container } = render(PrintView);
    expect(container.querySelectorAll('.print-page').length).toBe(0);
  });
});
```

- [ ] **Step 2: RED** — `npm test -- PrintView` fails (cannot resolve).

- [ ] **Step 3: Implement**

Create `src/lib/modules/flashcards/components/PrintView.svelte`:
```svelte
<script lang="ts">
  import '../lib/card-render.css';
  import { project } from '../stores';
  import { collectPrintCards } from '../lib/printCards';
  import { buildCardHTML, getPaperPx } from '../lib/card-render';
  import type { Card } from '../model';

  const cards = $derived(collectPrintCards($project));
  const paper = (card: Card) => getPaperPx($project.settings.paperSize, card.orientation || $project.settings.orientation);
</script>

<div class="print-view" aria-hidden="true">
  {#each cards as card (card.id)}
    {@const p = paper(card)}
    <div class="print-page" style={`width:${p.w}px;height:${p.h}px;`}>
      {@html buildCardHTML(card, $project.settings, $project.activeLocale)}
    </div>
  {/each}
</div>

<style>
  .print-view { display:none; }
  @media print {
    :global(body *) { visibility:hidden !important; }
    .print-view, .print-view :global(*) { visibility:visible !important; }
    .print-view { display:block; position:absolute; top:0; left:0; }
    .print-page { break-after:page; page-break-after:always; overflow:hidden; }
  }
</style>
```

- [ ] **Step 4: GREEN** — `npm test -- PrintView` passes (2). `npm run check` 0 errors.
- [ ] **Step 5: Commit** — `git add src/lib/modules/flashcards/components/PrintView.svelte tests/PrintView.test.ts && git commit -m "feat(flashcards): PrintView (real-size cards, @media print isolation)"`

---

## Task 3: Workspace — Print button + mount PrintView

**Files:** Modify `src/lib/modules/flashcards/Workspace.svelte`; Test `tests/flashcards-workspace.test.ts` (extend).

- [ ] **Step 1: Write the failing test**

Append to `tests/flashcards-workspace.test.ts` (inside the existing describe; its beforeEach seeds a schema + record):
```ts
  it('Print button calls window.print and is disabled with no cards', async () => {
    const printSpy = vi.fn();
    (window as unknown as { print: () => void }).print = printSpy;
    const { getByRole } = render(Workspace);
    const btn = getByRole('button', { name: /print/i });
    await fireEvent.click(btn);
    expect(printSpy).toHaveBeenCalled();
    // now empty → disabled
    S.initProject();
    render(Workspace);
    expect(getByRole('button', { name: /print/i })).toBeDisabled();
  });
```
(Ensure `vi`, `fireEvent`, `S` imported — most already are.)

- [ ] **Step 2: RED** — `npm test -- flashcards-workspace` fails (no Print button).

- [ ] **Step 3: Implement**

In `Workspace.svelte`:
- imports: `import Printer from 'lucide-svelte/icons/printer';`, `import PrintView from './components/PrintView.svelte';`, `import { collectPrintCards } from './lib/printCards';`
- add: `const printCount = $derived(collectPrintCards($project).length);`
- in `<header>`, after the `.view-toggle` div, add:
```svelte
    <button type="button" class="print-btn" disabled={printCount === 0}
      onclick={() => window.print()} title="Print / Export PDF">
      <Printer size={14} /> Print
    </button>
```
- mount `<PrintView />` next to `<CardEditorModal />`.
- add styles:
```css
  .print-btn { display:inline-flex; align-items:center; gap:5px; border:1px solid var(--border);
    background:transparent; color:var(--text); border-radius:6px; padding:4px 10px; font:inherit; font-size:12px; cursor:pointer;
    transition:background .12s ease, color .12s ease; }
  .print-btn:hover:not(:disabled) { background:var(--accent-weak); color:var(--accent); }
  .print-btn:disabled { opacity:.5; cursor:default; }
  .print-btn:focus-visible { outline:2px solid var(--accent); outline-offset:1px; }
```
(Note: `.view-toggle` has `margin-left:auto`, so it and the Print button sit at the right; the Print button follows the toggle.)

- [ ] **Step 4: GREEN + gates**

Run: `npm test -- flashcards-workspace` (passes), then `npm test` (full green, 0 unhandled — re-run once if EBUSY), `npm run check` (0 errors), `npm run build` (OK).

- [ ] **Step 5: Manual verification (human, morning)** — click Print → webview dialog shows one card per page at correct size → "Save as PDF" produces a correct PDF; app chrome not printed.

- [ ] **Step 6: Commit** — `git add src/lib/modules/flashcards/Workspace.svelte tests/flashcards-workspace.test.ts && git commit -m "feat(flashcards): Print / Export PDF button + PrintView"`

---

## Self-review notes (author)
- Coverage: collectPrintCards pure+tested (T1), PrintView pages (T2), Workspace Print button + window.print + disabled-empty (T3). Print isolation via @media print (not jsdom-tested — human verify).
- Consistency: collectPrintCards mirrors CardGallery's packed+auto logic exactly (same `schemaForCard`/`cardsPerPage`/`chunkRecords`/`recordsToCard`), so print == gallery.
- Out of scope: PDF lib, per-schema/selection print, page config. Deferred.
- Testing gap (declared): `@media print` layout + real print dialog → human morning verify.
```
