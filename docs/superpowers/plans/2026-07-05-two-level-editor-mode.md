# Two-Level Editor Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a toggleable 2-column editor mode that shows and edits an object's own fields (left) alongside one selected nested child (right).

**Architecture:** Extract the existing "pick an editor by `classify`" dispatch from `DetailPane` into a reusable `NodeView`. Add a persisted `twoLevel` store flag and a pure `hasContainerChild` predicate. A new `TwoLevelView` renders the two columns (left = fields with inline scalar editing + selectable containers; right = `NodeView` of the open child). `DetailPane` branches to `TwoLevelView` only when the mode is on and the node qualifies. `jsonModel.ts` is untouched.

**Tech Stack:** Svelte 5 (runes), TypeScript, Vitest + @testing-library/svelte, lucide-svelte (subpath imports).

## Global Constraints

- **`jsonModel.ts` frozen** — consume its exports (`classify`, `JsonValue`, `Path`, `getAtPath`) unchanged.
- **Lucide icons: subpath imports only** (`lucide-svelte/icons/<kebab>`), never the barrel.
- **All edits route through existing store actions** (`editValue`, `select`, etc.) on absolute `Path`.
- **2-column activates only when** `twoLevel === true` AND selected node is a plain object AND it has ≥1 container child; otherwise the current 1-level view.
- **Sub-selection is panel-local**, resets on `selectedPath` change, auto-selects the first container child.
- **Persistence key:** `localStorage['jte-two-level']`; default `false`.
- **English UI copy.** Vitest config already has `resolve.conditions:['browser']` — keep it.
- **Rust/Tauri builds:** `CARGO_HOME=D:\dev-cache\.cargo`; stop any running `app.exe` before `tauri build` (avoids "Access is denied").

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/lib/nodeUtils.ts` | **New, pure.** `hasContainerChild(v)`. |
| `src/lib/theme.ts` | **Modify.** Add reusable `loadBool`/`saveBool`. |
| `src/lib/stores.ts` | **Modify.** Add `twoLevel` + `setTwoLevel`. |
| `src/lib/components/NodeView.svelte` | **New.** Adaptive editor dispatch (extracted from DetailPane). |
| `src/lib/components/TwoLevelView.svelte` | **New.** Two-column layout. |
| `src/lib/components/DetailPane.svelte` | **Modify.** Use `NodeView`; branch to `TwoLevelView`. |
| `src/lib/components/Toolbar.svelte` | **Modify.** Add 2-column toggle button. |
| `tests/*` | nodeUtils, twoLevel, NodeView, TwoLevelView, DetailPane, Toolbar. |

---

## Task 1: `nodeUtils.ts` — `hasContainerChild` predicate

**Files:**
- Create: `src/lib/nodeUtils.ts`
- Test: `tests/nodeUtils.test.ts`

**Interfaces:**
- Consumes: `classify`, `JsonValue` from `jsonModel`.
- Produces: `hasContainerChild(v: JsonValue): boolean` — true iff `v` is a plain object with at least one value whose kind is `object` or an array.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { hasContainerChild } from '../src/lib/nodeUtils';

describe('hasContainerChild', () => {
  it('true for objects with a nested object or array', () => {
    expect(hasContainerChild({ a: 1, b: { c: 2 } })).toBe(true);
    expect(hasContainerChild({ a: 1, list: [1, 2] })).toBe(true);
  });
  it('false for all-scalar objects', () => {
    expect(hasContainerChild({ a: 1, b: 'x', c: true, d: null })).toBe(false);
  });
  it('false for non-objects', () => {
    expect(hasContainerChild([1, 2])).toBe(false);
    expect(hasContainerChild('x')).toBe(false);
    expect(hasContainerChild(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/nodeUtils.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/nodeUtils.ts`**

```ts
import { classify, type JsonValue } from './jsonModel';

export function hasContainerChild(v: JsonValue): boolean {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
  return Object.values(v).some((c) => {
    const k = classify(c);
    return k === 'object' || k.startsWith('array');
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/nodeUtils.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/nodeUtils.ts tests/nodeUtils.test.ts
git commit -m "feat: hasContainerChild predicate"
```

---

## Task 2: persisted `twoLevel` store

**Files:**
- Modify: `src/lib/theme.ts` (add `loadBool`/`saveBool`)
- Modify: `src/lib/stores.ts` (add `twoLevel`, `setTwoLevel`)
- Test: `tests/twoLevel.test.ts`

**Interfaces:**
- Produces (theme.ts): `loadBool(key: string, fallback: boolean): boolean`, `saveBool(key: string, val: boolean): void`.
- Produces (stores.ts): `twoLevel: Writable<boolean>`, `setTwoLevel(on: boolean): void`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { twoLevel, setTwoLevel } from '../src/lib/stores';

beforeEach(() => { localStorage.clear(); setTwoLevel(false); });

describe('twoLevel', () => {
  it('defaults to false and toggles + persists', () => {
    expect(get(twoLevel)).toBe(false);
    setTwoLevel(true);
    expect(get(twoLevel)).toBe(true);
    expect(localStorage.getItem('jte-two-level')).toBe('true');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/twoLevel.test.ts`
Expected: FAIL — `twoLevel`/`setTwoLevel` not exported.

- [ ] **Step 3: Add persist helpers to `src/lib/theme.ts`** (append)

```ts
export function loadBool(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    if (v === 'true') return true;
    if (v === 'false') return false;
  } catch { /* ignore */ }
  return fallback;
}

export function saveBool(key: string, val: boolean): void {
  try { localStorage.setItem(key, String(val)); } catch { /* ignore */ }
}
```

- [ ] **Step 4: Add the store to `src/lib/stores.ts`**

Add to the imports at top:
```ts
import { loadBool, saveBool } from './theme';
```
Add near the other writables (after `bigEditorPath`):
```ts
export const twoLevel = writable<boolean>(loadBool('jte-two-level', false));
```
Add near the other actions (after `closeBigEditor`):
```ts
export function setTwoLevel(on: boolean): void { twoLevel.set(on); saveBool('jte-two-level', on); }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/twoLevel.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/theme.ts src/lib/stores.ts tests/twoLevel.test.ts
git commit -m "feat: persisted twoLevel mode flag"
```

---

## Task 3: `NodeView.svelte` — extract adaptive dispatch

**Files:**
- Create: `src/lib/components/NodeView.svelte`
- Modify: `src/lib/components/DetailPane.svelte` (use `NodeView` in place of the inline dispatch)
- Test: `tests/NodeView.test.ts`

**Interfaces:**
- Consumes: `classify`, `JsonValue`, `Path`; the five editors.
- Props: `{ value: JsonValue; path: Path }`. Renders the editor matching `classify(value)`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import NodeView from '../src/lib/components/NodeView.svelte';
import { loadDocument } from '../src/lib/stores';

beforeEach(() => loadDocument({ words: ['cat'], meta: { v: 1 }, rows: [{ a: 1 }] }, null));

describe('NodeView', () => {
  it('renders chips for a scalar array', () => {
    render(NodeView, { value: ['cat'], path: ['words'] });
    expect(screen.getByDisplayValue('cat')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add/i })).toBeInTheDocument();
  });
  it('renders a form for an object', () => {
    render(NodeView, { value: { v: 1 }, path: ['meta'] });
    expect(screen.getByText('v')).toBeInTheDocument();
  });
  it('renders a table for an array of objects', () => {
    render(NodeView, { value: [{ a: 1 }], path: ['rows'] });
    expect(screen.getByRole('columnheader', { name: 'a' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/NodeView.test.ts`
Expected: FAIL — component not found.

- [ ] **Step 3: Implement `src/lib/components/NodeView.svelte`**

```svelte
<script lang="ts">
  import { classify, type JsonValue, type Path } from '../jsonModel';
  import ObjectForm from '../editors/ObjectForm.svelte';
  import ObjectArrayTable from '../editors/ObjectArrayTable.svelte';
  import ScalarArrayEditor from '../editors/ScalarArrayEditor.svelte';
  import MixedArrayList from '../editors/MixedArrayList.svelte';
  import LeafEditor from '../editors/LeafEditor.svelte';

  let { value, path }: { value: JsonValue; path: Path } = $props();
  const kind = $derived(classify(value));
</script>

{#if kind === 'object'}
  <ObjectForm value={value as Record<string, JsonValue>} {path} />
{:else if kind === 'array-of-objects'}
  <ObjectArrayTable value={value as JsonValue[]} {path} />
{:else if kind === 'array-of-scalars'}
  <ScalarArrayEditor value={value as JsonValue[]} {path} />
{:else if kind === 'array-mixed'}
  <MixedArrayList value={value as JsonValue[]} {path} />
{:else}
  <LeafEditor {value} {path} />
{/if}
```

- [ ] **Step 4: Refactor `DetailPane.svelte` to use `NodeView`**

Replace the editor imports and the inline `{#if kind === 'object'} … {/if}` dispatch inside `.content` with a single `<NodeView>`. The new `DetailPane.svelte`:
```svelte
<script lang="ts">
  import FileQuestion from 'lucide-svelte/icons/file-question';
  import { getAtPath, classify, type JsonValue } from '../jsonModel';
  import { data, selectedPath } from '../stores';
  import { pathExists } from '../pathUtils';
  import Breadcrumb from './Breadcrumb.svelte';
  import NodeView from './NodeView.svelte';

  const node = $derived(
    $data !== null && pathExists($data, $selectedPath) ? getAtPath($data, $selectedPath) : null,
  );
  const kind = $derived($data === null ? 'empty' : classify(node as JsonValue));
</script>

{#if $data === null}
  <div class="empty">
    <FileQuestion size={40} />
    <p>No file open. Open a JSON file to start (Ctrl+O).</p>
  </div>
{:else}
  <div class="detail">
    <Breadcrumb path={$selectedPath} />
    <div class="content">
      <NodeView value={node as JsonValue} path={$selectedPath} />
    </div>
  </div>
{/if}

<style>
  .detail { padding:16px; display:flex; flex-direction:column; gap:12px; height:100%; overflow:auto; }
  .content { flex:1; }
  .empty { height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center;
    gap:12px; color:var(--text-muted); text-align:center; padding:24px; }
</style>
```
Note: `kind` is retained (used in Task 5). `classify` import stays.

- [ ] **Step 5: Run tests to verify pass**

Run: `npx vitest run tests/NodeView.test.ts tests/DetailPane.test.ts`
Expected: PASS (NodeView + existing DetailPane cases still green).

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/NodeView.svelte src/lib/components/DetailPane.svelte tests/NodeView.test.ts
git commit -m "refactor: extract NodeView adaptive dispatch from DetailPane"
```

---

## Task 4: `TwoLevelView.svelte` — two-column view

**Files:**
- Create: `src/lib/components/TwoLevelView.svelte`
- Test: `tests/TwoLevelView.test.ts`

**Interfaces:**
- Consumes: `classify`, `JsonValue`, `Path`; `stores.select`, `stores.editValue` (via LeafEditor); `LeafEditor`, `NodeView`; Lucide `chevron-right`.
- Props: `{ value: Record<string, JsonValue>; path: Path }`.
- Behavior: left lists all keys (scalars inline via `LeafEditor`, containers as selectable buttons setting local `subKey`); right renders `NodeView` for `value[subKey]` at `[...path, subKey]`. `subKey` auto-selects the first container key and re-clamps when the key set changes.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/svelte';
import { get } from 'svelte/store';
import TwoLevelView from '../src/lib/components/TwoLevelView.svelte';
import { data, selectedPath, loadDocument, select } from '../src/lib/stores';

const doc = () => ({ keySound: 'ai', graphemes: ['ai', 'ay'], cards: [{ grapheme: 'ai' }] });
beforeEach(() => { loadDocument(doc(), null); select([]); });

describe('TwoLevelView', () => {
  it('edits a scalar field on the left', async () => {
    render(TwoLevelView, { value: doc(), path: [] });
    await fireEvent.input(screen.getByDisplayValue('ai'), { target: { value: 'ee' } });
    expect((get(data) as any).keySound).toBe('ee');
  });
  it('auto-opens the first container on the right (graphemes -> chips)', () => {
    render(TwoLevelView, { value: doc(), path: [] });
    // right column shows the graphemes chips
    expect(screen.getByDisplayValue('ay')).toBeInTheDocument();
  });
  it('clicking a container opens it on the right', async () => {
    render(TwoLevelView, { value: doc(), path: [] });
    await fireEvent.click(screen.getByRole('button', { name: /cards/i }));
    // right now shows the cards table (column header "grapheme")
    expect(screen.getByRole('columnheader', { name: 'grapheme' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/TwoLevelView.test.ts`
Expected: FAIL — component not found.

- [ ] **Step 3: Implement `src/lib/components/TwoLevelView.svelte`**

```svelte
<script lang="ts">
  import ChevronRight from 'lucide-svelte/icons/chevron-right';
  import { classify, type JsonValue, type Path } from '../jsonModel';
  import LeafEditor from '../editors/LeafEditor.svelte';
  import NodeView from './NodeView.svelte';

  let { value, path }: { value: Record<string, JsonValue>; path: Path } = $props();

  const isContainer = (v: JsonValue) => {
    const k = classify(v);
    return k === 'object' || k.startsWith('array');
  };
  const keys = $derived(Object.keys(value));
  const containerKeys = $derived(keys.filter((k) => isContainer(value[k])));

  let subKey = $state<string | null>(null);
  // Auto-select first container; re-clamp if the current sub-key disappears.
  $effect(() => {
    const valid = containerKeys;
    if (subKey === null || !valid.includes(subKey)) subKey = valid[0] ?? null;
  });

  const summary = (v: JsonValue) => {
    const k = classify(v);
    if (k === 'object') return `{ ${Object.keys(v as object).length} keys }`;
    return `[ ${(v as JsonValue[]).length} items ]`;
  };
  // Provide a label for the aria-label of container buttons.
  const label = (key: string) => `open ${key}`;
</script>

<div class="two">
  <div class="col left">
    {#each keys as key}
      <div class="row">
        <div class="key">{key}</div>
        <div class="val">
          {#if isContainer(value[key])}
            <button class="open" class:active={subKey === key}
              aria-label={label(key)} onclick={() => (subKey = key)}>
              <span>{summary(value[key])}</span> <ChevronRight size={15} />
            </button>
          {:else}
            <LeafEditor value={value[key]} path={[...path, key]} />
          {/if}
        </div>
      </div>
    {/each}
  </div>
  <div class="col right">
    {#if subKey !== null}
      <div class="rhead">{subKey}</div>
      <NodeView value={value[subKey]} path={[...path, subKey]} />
    {:else}
      <p class="placeholder">Select a field on the left.</p>
    {/if}
  </div>
</div>

<style>
  .two { display:grid; grid-template-columns: minmax(240px, 40%) 1fr; gap:0; height:100%; min-height:0; }
  .col { min-height:0; overflow:auto; }
  .left { padding-right:16px; border-right:1px solid var(--border); display:flex; flex-direction:column; gap:8px; }
  .right { padding-left:16px; }
  .row { display:grid; grid-template-columns: minmax(5rem, 10rem) 1fr; gap:10px; align-items:center; }
  .key { font-weight:600; color:var(--text); }
  .open { display:inline-flex; align-items:center; justify-content:space-between; gap:6px; width:100%;
    border:1px solid var(--border); background:var(--surface); color:var(--text-muted);
    border-radius:8px; padding:5px 12px; }
  .open:hover { border-color:var(--accent); color:var(--accent); }
  .open.active { background:var(--accent); border-color:var(--accent); color:#fff; }
  .rhead { font-weight:600; color:var(--text-muted); margin-bottom:8px; }
  .placeholder { color:var(--text-muted); }
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/TwoLevelView.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/TwoLevelView.svelte tests/TwoLevelView.test.ts
git commit -m "feat: TwoLevelView two-column editor"
```

---

## Task 5: `DetailPane` branches to `TwoLevelView`

**Files:**
- Modify: `src/lib/components/DetailPane.svelte`
- Test: `tests/DetailPane.test.ts` (add cases)

**Interfaces:**
- Consumes: `twoLevel` from `stores`, `hasContainerChild` from `nodeUtils`, `TwoLevelView`.
- Behavior: render `TwoLevelView` when `$twoLevel && kind==='object' && hasContainerChild(node)`; else `NodeView`.

- [ ] **Step 1: Write the failing test** (append to `tests/DetailPane.test.ts`)

```ts
import { setTwoLevel } from '../src/lib/stores';

describe('DetailPane — two-level mode', () => {
  it('shows two columns for an object with containers when enabled', () => {
    loadDocument({ keySound: 'ai', cards: [{ grapheme: 'ai' }] }, null);
    select([]);
    setTwoLevel(true);
    render(DetailPane);
    // left scalar + right auto-opened cards table
    expect(screen.getByDisplayValue('ai')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'grapheme' })).toBeInTheDocument();
    setTwoLevel(false);
  });
  it('stays single view for an all-scalar object even when enabled', () => {
    loadDocument({ a: '1', b: '2' }, null);
    select([]);
    setTwoLevel(true);
    render(DetailPane);
    expect(screen.queryByText('Select a field on the left.')).not.toBeInTheDocument();
    setTwoLevel(false);
  });
});
```
(Ensure the existing `tests/DetailPane.test.ts` imports include `select`, `setTwoLevel` — add them to the existing import from `../src/lib/stores`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/DetailPane.test.ts`
Expected: FAIL — DetailPane has no two-level branch.

- [ ] **Step 3: Modify `DetailPane.svelte`**

Add imports:
```ts
  import { data, selectedPath, twoLevel } from '../stores';
  import { hasContainerChild } from '../nodeUtils';
  import TwoLevelView from './TwoLevelView.svelte';
```
(remove the old `import { data, selectedPath } from '../stores';` — replace with the line above.)
Add a derived flag after `kind`:
```ts
  const useTwoLevel = $derived(
    $twoLevel && kind === 'object' && hasContainerChild(node as JsonValue),
  );
```
Replace the `.content` body:
```svelte
    <div class="content">
      {#if useTwoLevel}
        <TwoLevelView value={node as Record<string, JsonValue>} path={$selectedPath} />
      {:else}
        <NodeView value={node as JsonValue} path={$selectedPath} />
      {/if}
    </div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/DetailPane.test.ts`
Expected: PASS (existing + 2 new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/DetailPane.svelte tests/DetailPane.test.ts
git commit -m "feat: DetailPane branches to two-column view when enabled"
```

---

## Task 6: `Toolbar` toggle button

**Files:**
- Modify: `src/lib/components/Toolbar.svelte`
- Test: `tests/Toolbar.test.ts` (add case)

**Interfaces:**
- Consumes: `twoLevel`, `setTwoLevel` from `stores`; Lucide `columns-2`.
- Adds a toggle button reflecting/flipping `$twoLevel`.

- [ ] **Step 1: Write the failing test** (append to `tests/Toolbar.test.ts`)

```ts
import { twoLevel, setTwoLevel } from '../src/lib/stores';

describe('Toolbar — two-column toggle', () => {
  it('toggles twoLevel', async () => {
    setTwoLevel(false);
    render(Toolbar);
    const btn = screen.getByRole('button', { name: /two-column/i });
    await fireEvent.click(btn);
    expect(get(twoLevel)).toBe(true);
    setTwoLevel(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/Toolbar.test.ts`
Expected: FAIL — no such button.

- [ ] **Step 3: Modify `Toolbar.svelte`**

Add import:
```ts
  import Columns2 from 'lucide-svelte/icons/columns-2';
  import { twoLevel, setTwoLevel } from '../stores';
```
(extend the existing `import { ... } from '../stores';` line to include `twoLevel, setTwoLevel`, or add the separate line above.)
Add the button in the right-side group, before the theme button:
```svelte
  <button class="toggle2" class:on={$twoLevel} aria-pressed={$twoLevel}
    onclick={() => setTwoLevel(!$twoLevel)} aria-label="two-column mode" title="Two-column mode">
    <Columns2 size={18} />
  </button>
```
Add style:
```css
  .toggle2 { color:var(--text-muted); }
  .toggle2.on { background:var(--accent-weak); color:var(--accent); }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/Toolbar.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/Toolbar.svelte tests/Toolbar.test.ts
git commit -m "feat: toolbar two-column mode toggle"
```

---

## Task 7: Full verification + rebuild

**Files:** none (verification).

- [ ] **Step 1: Full suite**

Run: `npx vitest run`
Expected: all suites PASS (new: nodeUtils, twoLevel, NodeView, TwoLevelView + extended DetailPane, Toolbar).

- [ ] **Step 2: Build + typecheck**

Run: `npm run build` → succeeds.
Run: `npm run check` → 0 errors.
If `lucide-svelte/icons/columns-2` fails to resolve, verify the file exists (`ls node_modules/lucide-svelte/dist/icons/columns-2.svelte`) and adjust the import name.

- [ ] **Step 3: Rebuild the desktop app** (also lands the earlier long-text changes)

Run: stop any running app, then build:
```bash
powershell -Command "Get-Process app -ErrorAction SilentlyContinue | Stop-Process -Force"
CARGO_HOME=D:\dev-cache\.cargo npm run tauri build
```
Expected: fresh `src-tauri/target/release/app.exe` + NSIS installer.

- [ ] **Step 4: Manual acceptance**

Launch the release exe with `reading-folders-data.json`. Toggle the 2-column button; select a `folder`; edit `keySound` (left) while `cards`/`graphemes` show on the right; click `cards` → right shows the table; drill into a card → selection moves and columns re-root; toggle off → 1-level restored; reload → toggle remembered.

- [ ] **Step 5: Commit any final fixes**

```bash
git add -A
git commit -m "chore: two-level mode verified + app rebuilt"
```

---

## Self-Review

**Spec coverage:**
- §2 display style (2 columns): Task 4. ✓
- §2 toggle + persist: Task 2 (store) + Task 6 (button). ✓
- §2 left column (all fields, scalar inline, container selectable): Task 4. ✓
- §2 scope (only object-with-containers when on): Task 5 `useTwoLevel`. ✓
- §2 sub-selection local + auto-first + re-clamp: Task 4 `$effect`. ✓
- §2 deeper-than-2 re-roots: uses existing drill-in `select()` inside `NodeView`→editors (unchanged) → Task 3/4. ✓
- §3 NodeView extraction (DRY): Task 3. ✓
- §3 hasContainerChild: Task 1. ✓
- §5 visual (grid, accent active row): Task 4 styles. ✓
- §6 edge cases (null subKey placeholder, re-clamp, non-qualifying → 1-level, empty doc): Tasks 4 + 5. ✓
- §7 testing: each task has tests; Task 7 runs full suite + build + check + manual. ✓
- §8 repo structure: matches File Structure. ✓

**Placeholder scan:** No TBD/TODO; every code step complete; commands have expected output. ✓

**Type consistency:** `hasContainerChild(v: JsonValue): boolean` (Task 1) used in Task 5. `twoLevel: Writable<boolean>` / `setTwoLevel(on)` (Task 2) used in Tasks 5, 6. `NodeView {value, path}` (Task 3) used in DetailPane + TwoLevelView. `TwoLevelView {value: Record<string,JsonValue>, path}` (Task 4) used in DetailPane (Task 5). `loadBool`/`saveBool` (Task 2, theme.ts) used by stores. All consistent. ✓
