# JSON Table Editor — UI/UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the editor UI as a polished two-pane master-detail app (navigation tree + adaptive detail pane) with a Paper+Terracotta theme (light/dark), Lucide icons, undo/redo, save toasts, and tree search — all in English.

**Architecture:** `jsonModel.ts` stays untouched (all 31 v1 tests keep passing). A refactored `stores.ts` centralizes edit actions and routes every mutation through a pure `history.ts` (snapshot undo/redo). Components split into a shell (`App`, `Toolbar`), navigation (`TreePane`/`TreeNode`, `Breadcrumb`), a `DetailPane` that dispatches by `classify` to focused editors (`ObjectForm`, `ObjectArrayTable`, `ScalarArrayEditor`, `MixedArrayList`, `LeafEditor`), plus `Toast`. Theme is CSS custom properties toggled via `data-theme`.

**Tech Stack:** Svelte 5 (runes), Vite, TypeScript, Vitest + @testing-library/svelte, Tauri v2, `lucide-svelte`.

## Global Constraints

- **UI language: English** for all in-app text (buttons, breadcrumb, toast, empty state, errors). Overrides v1's Vietnamese strings.
- **Icons: Lucide** via `lucide-svelte`, inline SVG, bundled (no CDN — offline/CSP safe).
- **Offline only** — no network calls.
- **Structure preservation** — all edits go through `jsonModel` helpers; round-trip integrity unchanged.
- **Save format** — `JSON.stringify(value, null, 2) + '\n'` (unchanged `serialize`).
- **`jsonModel.ts` is frozen** — do not modify it; consume its exports as-is.
- **Palette tokens (CSS variables), exact values:**
  - Light: `--bg:#fbfaf8 --surface:#ffffff --sidebar:#f4f1ec --text:#2e2a23 --text-muted:#a89a86 --border:#e7e2d9 --accent:#c0562f --accent-weak:#faece6`
  - Dark: `--bg:#1c1a17 --surface:#26231f --sidebar:#211e1a --text:#ece7de --text-muted:#8a8073 --border:#3a352d --accent:#e0703f --accent-weak:#3a2a22`
- **Radius 8px; spacing scale 4/8/12/16px; icons 18px, currentColor, stroke-width 2.**
- **Vitest already configured** with `resolve.conditions:['browser']` — keep it.
- **Cargo/Tauri builds** must run with `CARGO_HOME=D:\dev-cache\.cargo` (C: drive space constraint).

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/lib/jsonModel.ts` | **Frozen.** classify, path get/update, array helpers, types. |
| `src/lib/history.ts` | **New, pure.** Snapshot undo/redo state machine. |
| `src/lib/stores.ts` | **Rewritten.** data (derived from history), filePath, dirty, selectedPath, theme, toast; edit actions (editValue/addItem/removeItem), undo/redo, select, load/save. |
| `src/lib/pathUtils.ts` | **New, pure.** `pathExists`, `clampPath` (nearest existing ancestor) for post-undo selection. |
| `src/lib/fileService.ts` | **Modified.** English copy; emit toasts on save/error. |
| `src/app.css` | **Rewritten.** Design tokens (light/dark) + base layout. |
| `src/App.svelte` | **Rewritten.** 2-pane shell + shortcuts + theme application. |
| `src/lib/components/Toolbar.svelte` | Open/Save/Save As/Undo/Redo, filename+dirty, theme toggle. |
| `src/lib/components/TreePane.svelte` | Search box + recursive tree root. |
| `src/lib/components/TreeNode.svelte` | One tree row (recursive), selection, filtered visibility. |
| `src/lib/components/DetailPane.svelte` | Breadcrumb + dispatch-by-classify + empty state. |
| `src/lib/components/Breadcrumb.svelte` | Clickable path segments. |
| `src/lib/components/Toast.svelte` | Transient success/error message. |
| `src/lib/editors/LeafEditor.svelte` | string/number/boolean/null editor. |
| `src/lib/editors/ScalarArrayEditor.svelte` | Chips (add/edit/remove). |
| `src/lib/editors/ObjectArrayTable.svelte` | Record table (add/delete rows). |
| `src/lib/editors/ObjectForm.svelte` | Object key/value form + drill-in. |
| `src/lib/editors/MixedArrayList.svelte` | Generic list + drill-in. |
| `src/lib/Node.svelte` | **Deleted** in the final task (replaced). |
| `tests/*` | history, pathUtils, stores, and component tests added. |

Edit-action contract: **components import actions from `stores.ts` and call them with absolute `Path`** (no prop-drilled callbacks). Editors receive `value: JsonValue` and `path: Path` props.

---

## Task 1: Visual foundation — design tokens, theme store, Lucide

**Files:**
- Modify: `src/app.css`
- Create: `src/lib/theme.ts`
- Test: `tests/theme.test.ts`
- Modify: `package.json` (add `lucide-svelte`)

**Interfaces:**
- Produces:
  - `type Theme = 'light' | 'dark' | 'system'`
  - `function resolveTheme(t: Theme, prefersDark: boolean): 'light' | 'dark'`
  - `function applyTheme(t: Theme): void` — sets/removes `data-theme` on `document.documentElement` (removes it for `'system'`), persists to `localStorage['jte-theme']`.
  - `function loadTheme(): Theme` — reads `localStorage`, defaults `'system'`.

- [ ] **Step 1: Install lucide-svelte**

Run: `npm install lucide-svelte@^0.460.0`
Expected: added to `dependencies`.

- [ ] **Step 2: Write the failing test**

`tests/theme.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { resolveTheme, applyTheme, loadTheme } from '../src/lib/theme';

beforeEach(() => { localStorage.clear(); document.documentElement.removeAttribute('data-theme'); });

describe('theme', () => {
  it('resolves system to the media preference', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
  });
  it('applyTheme sets data-theme for explicit modes and clears for system', () => {
    applyTheme('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    applyTheme('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });
  it('applyTheme persists and loadTheme restores', () => {
    applyTheme('dark');
    expect(loadTheme()).toBe('dark');
    expect(loadTheme()).not.toBe('system');
  });
  it('loadTheme defaults to system', () => {
    expect(loadTheme()).toBe('system');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/theme.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `src/lib/theme.ts`**

```ts
export type Theme = 'light' | 'dark' | 'system';
const KEY = 'jte-theme';

export function resolveTheme(t: Theme, prefersDark: boolean): 'light' | 'dark' {
  if (t === 'system') return prefersDark ? 'dark' : 'light';
  return t;
}

export function applyTheme(t: Theme): void {
  const root = document.documentElement;
  if (t === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', t);
  try { localStorage.setItem(KEY, t); } catch { /* ignore */ }
}

export function loadTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch { /* ignore */ }
  return 'system';
}
```

- [ ] **Step 5: Rewrite `src/app.css` with tokens**

```css
:root {
  --bg:#fbfaf8; --surface:#ffffff; --sidebar:#f4f1ec;
  --text:#2e2a23; --text-muted:#a89a86; --border:#e7e2d9;
  --accent:#c0562f; --accent-weak:#faece6;
  --radius:8px;
  font-family: system-ui, -apple-system, sans-serif; font-size:14px;
  color:var(--text); background:var(--bg);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg:#1c1a17; --surface:#26231f; --sidebar:#211e1a;
    --text:#ece7de; --text-muted:#8a8073; --border:#3a352d;
    --accent:#e0703f; --accent-weak:#3a2a22;
  }
}
:root[data-theme="dark"] {
  --bg:#1c1a17; --surface:#26231f; --sidebar:#211e1a;
  --text:#ece7de; --text-muted:#8a8073; --border:#3a352d;
  --accent:#e0703f; --accent-weak:#3a2a22;
}
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--text); }
button { font: inherit; color: inherit; cursor: pointer; }
input, select { font: inherit; color: var(--text); background: var(--surface);
  border:1px solid var(--border); border-radius:6px; padding:3px 8px; }
input:focus, select:focus { outline:2px solid var(--accent-weak); border-color:var(--accent); }
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/theme.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add src/app.css src/lib/theme.ts tests/theme.test.ts package.json package-lock.json
git commit -m "feat: design tokens, theme module (light/dark), lucide-svelte"
```

---

## Task 2: `history.ts` — snapshot undo/redo (pure)

**Files:**
- Create: `src/lib/history.ts`
- Test: `tests/history.test.ts`

**Interfaces:**
- Produces:
  - `interface History<T> { past: T[]; present: T; future: T[] }`
  - `createHistory<T>(initial: T): History<T>`
  - `push<T>(h: History<T>, next: T): History<T>` — past+[present], present=next, future=[].
  - `undo<T>(h): History<T>` — no-op if `past` empty.
  - `redo<T>(h): History<T>` — no-op if `future` empty.
  - `canUndo(h): boolean` / `canRedo(h): boolean`
  - `reset<T>(h, value: T): History<T>` — fresh baseline (empty stacks).

- [ ] **Step 1: Write the failing test**

`tests/history.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { createHistory, push, undo, redo, canUndo, canRedo, reset } from '../src/lib/history';

describe('history', () => {
  it('starts with no undo/redo', () => {
    const h = createHistory(0);
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
    expect(h.present).toBe(0);
  });
  it('push then undo restores previous, redo re-applies', () => {
    let h = createHistory(0);
    h = push(h, 1); h = push(h, 2);
    expect(h.present).toBe(2);
    h = undo(h); expect(h.present).toBe(1); expect(canRedo(h)).toBe(true);
    h = undo(h); expect(h.present).toBe(0); expect(canUndo(h)).toBe(false);
    h = redo(h); expect(h.present).toBe(1);
  });
  it('push clears the redo stack', () => {
    let h = createHistory(0);
    h = push(h, 1); h = undo(h); h = push(h, 9);
    expect(h.present).toBe(9);
    expect(canRedo(h)).toBe(false);
  });
  it('undo/redo are no-ops at the ends', () => {
    let h = createHistory(5);
    expect(undo(h).present).toBe(5);
    expect(redo(h).present).toBe(5);
  });
  it('reset clears both stacks with a new baseline', () => {
    let h = createHistory(0); h = push(h, 1);
    h = reset(h, 100);
    expect(h.present).toBe(100);
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/history.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/history.ts`**

```ts
export interface History<T> { past: T[]; present: T; future: T[] }

export function createHistory<T>(initial: T): History<T> {
  return { past: [], present: initial, future: [] };
}
export function push<T>(h: History<T>, next: T): History<T> {
  return { past: [...h.past, h.present], present: next, future: [] };
}
export function undo<T>(h: History<T>): History<T> {
  if (h.past.length === 0) return h;
  const previous = h.past[h.past.length - 1];
  return { past: h.past.slice(0, -1), present: previous, future: [h.present, ...h.future] };
}
export function redo<T>(h: History<T>): History<T> {
  if (h.future.length === 0) return h;
  const next = h.future[0];
  return { past: [...h.past, h.present], present: next, future: h.future.slice(1) };
}
export function canUndo<T>(h: History<T>): boolean { return h.past.length > 0; }
export function canRedo<T>(h: History<T>): boolean { return h.future.length > 0; }
export function reset<T>(h: History<T>, value: T): History<T> {
  return { past: [], present: value, future: [] };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/history.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/history.ts tests/history.test.ts
git commit -m "feat: pure snapshot undo/redo history"
```

---

## Task 3: `pathUtils.ts` — selection clamping (pure)

**Files:**
- Create: `src/lib/pathUtils.ts`
- Test: `tests/pathUtils.test.ts`

**Interfaces:**
- Consumes: `getAtPath`, `Path`, `JsonValue` from `jsonModel`.
- Produces:
  - `pathExists(root: JsonValue | null, path: Path): boolean`
  - `clampPath(root: JsonValue | null, path: Path): Path` — longest existing prefix of `path` (walks up until valid; returns `[]` if root exists, else `[]`).

- [ ] **Step 1: Write the failing test**

`tests/pathUtils.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { pathExists, clampPath } from '../src/lib/pathUtils';

const root = { a: { b: [10, 20] } };

describe('pathExists', () => {
  it('true for existing, false for missing', () => {
    expect(pathExists(root, ['a', 'b', 1])).toBe(true);
    expect(pathExists(root, ['a', 'b', 5])).toBe(false);
    expect(pathExists(root, ['x'])).toBe(false);
    expect(pathExists(root, [])).toBe(true);
    expect(pathExists(null, [])).toBe(false);
  });
});

describe('clampPath', () => {
  it('returns the path if it exists', () => {
    expect(clampPath(root, ['a', 'b', 1])).toEqual(['a', 'b', 1]);
  });
  it('walks up to the nearest existing ancestor', () => {
    expect(clampPath(root, ['a', 'b', 9])).toEqual(['a', 'b']);
    expect(clampPath(root, ['a', 'z', 3])).toEqual(['a']);
  });
  it('returns [] when nothing deeper exists', () => {
    expect(clampPath(root, ['nope'])).toEqual([]);
    expect(clampPath(null, ['a'])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/pathUtils.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/pathUtils.ts`**

```ts
import { getAtPath, type JsonValue, type Path } from './jsonModel';

export function pathExists(root: JsonValue | null, path: Path): boolean {
  if (root === null) return false;
  try { getAtPath(root, path); return true; } catch { return false; }
}

export function clampPath(root: JsonValue | null, path: Path): Path {
  if (root === null) return [];
  for (let len = path.length; len >= 0; len--) {
    const candidate = path.slice(0, len);
    if (pathExists(root, candidate)) return candidate;
  }
  return [];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/pathUtils.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pathUtils.ts tests/pathUtils.test.ts
git commit -m "feat: path existence check and selection clamping"
```

---

## Task 4: `stores.ts` — history-backed state + edit actions + toast

**Files:**
- Modify: `src/lib/stores.ts` (rewrite)
- Test: `tests/stores.test.ts` (rewrite)

**Interfaces:**
- Consumes: `history.ts`, `pathUtils.ts`, `jsonModel` (`updateAtPath`, `addArrayItem`, `removeArrayItem`), `theme.ts`.
- Produces (all used by components):
  - `data: Readable<JsonValue | null>` (derived from history present)
  - `filePath: Writable<string | null>`, `dirty: Writable<boolean>`
  - `selectedPath: Writable<Path>`
  - `theme: Writable<Theme>`
  - `toast: Writable<{ message: string; kind: 'success' | 'error' } | null>`
  - `canUndo: Readable<boolean>`, `canRedo: Readable<boolean>`
  - `loadDocument(value: JsonValue, path: string | null): void`
  - `editValue(path: Path, newValue: JsonValue): void`
  - `addItem(arrayPath: Path): void`
  - `removeItem(arrayPath: Path, index: number): void`
  - `undo(): void`, `redo(): void`
  - `select(path: Path): void`
  - `markSaved(path: string): void`
  - `showToast(message: string, kind?: 'success' | 'error'): void`
  - `setTheme(t: Theme): void`

- [ ] **Step 1: Write the failing test**

`tests/stores.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import {
  data, filePath, dirty, selectedPath, canUndo, canRedo,
  loadDocument, editValue, addItem, removeItem, undo, redo, select, markSaved,
} from '../src/lib/stores';

beforeEach(() => { loadDocument({ words: ['a'] }, '/tmp/x.json'); });

describe('stores', () => {
  it('loadDocument sets data, path, clears dirty and selection', () => {
    expect(get(data)).toEqual({ words: ['a'] });
    expect(get(filePath)).toBe('/tmp/x.json');
    expect(get(dirty)).toBe(false);
    expect(get(selectedPath)).toEqual([]);
    expect(get(canUndo)).toBe(false);
  });
  it('editValue updates immutably and sets dirty', () => {
    editValue(['words', 0], 'z');
    expect(get(data)).toEqual({ words: ['z'] });
    expect(get(dirty)).toBe(true);
    expect(get(canUndo)).toBe(true);
  });
  it('addItem / removeItem work through history', () => {
    addItem(['words']);
    expect(get(data)).toEqual({ words: ['a', ''] });
    removeItem(['words'], 0);
    expect(get(data)).toEqual({ words: [''] });
  });
  it('undo restores previous, redo re-applies', () => {
    editValue(['words', 0], 'z');
    undo();
    expect(get(data)).toEqual({ words: ['a'] });
    redo();
    expect(get(data)).toEqual({ words: ['z'] });
  });
  it('undo clamps a now-invalid selection to an existing ancestor', () => {
    addItem(['words']);          // words -> ['a','']
    select(['words', 1]);        // select the new item
    undo();                      // words -> ['a']; index 1 gone
    expect(get(selectedPath)).toEqual(['words']);
  });
  it('markSaved clears dirty', () => {
    editValue(['words', 0], 'z');
    markSaved('/tmp/x.json');
    expect(get(dirty)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/stores.test.ts`
Expected: FAIL — new exports missing.

- [ ] **Step 3: Rewrite `src/lib/stores.ts`**

```ts
import { writable, derived, get, type Readable } from 'svelte/store';
import { updateAtPath, addArrayItem, removeArrayItem, type JsonValue, type Path } from './jsonModel';
import * as H from './history';
import { clampPath } from './pathUtils';
import type { Theme } from './theme';

const history = writable<H.History<JsonValue | null>>(H.createHistory(null));

export const data: Readable<JsonValue | null> = derived(history, (h) => h.present);
export const canUndo: Readable<boolean> = derived(history, (h) => H.canUndo(h));
export const canRedo: Readable<boolean> = derived(history, (h) => H.canRedo(h));

export const filePath = writable<string | null>(null);
export const dirty = writable<boolean>(false);
export const selectedPath = writable<Path>([]);
export const theme = writable<Theme>('system');
export const toast = writable<{ message: string; kind: 'success' | 'error' } | null>(null);

export function loadDocument(value: JsonValue, path: string | null): void {
  history.set(H.createHistory(value));
  filePath.set(path);
  dirty.set(false);
  selectedPath.set([]);
}

function commit(next: JsonValue): void {
  history.update((h) => H.push(h, next));
  dirty.set(true);
}

export function editValue(path: Path, newValue: JsonValue): void {
  const cur = get(data);
  if (cur === null) return;
  commit(updateAtPath(cur, path, newValue));
}
export function addItem(arrayPath: Path): void {
  const cur = get(data);
  if (cur === null) return;
  commit(addArrayItem(cur, arrayPath));
}
export function removeItem(arrayPath: Path, index: number): void {
  const cur = get(data);
  if (cur === null) return;
  commit(removeArrayItem(cur, arrayPath, index));
}

function reclampSelection(): void {
  const cur = get(data);
  selectedPath.update((p) => clampPath(cur, p));
}
export function undo(): void {
  history.update((h) => H.undo(h));
  dirty.set(true);
  reclampSelection();
}
export function redo(): void {
  history.update((h) => H.redo(h));
  dirty.set(true);
  reclampSelection();
}

export function select(path: Path): void { selectedPath.set(path); }
export function markSaved(path: string): void { filePath.set(path); dirty.set(false); }

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function showToast(message: string, kind: 'success' | 'error' = 'success'): void {
  toast.set({ message, kind });
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.set(null), 2500);
}

export function setTheme(t: Theme): void { theme.set(t); }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/stores.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/stores.ts tests/stores.test.ts
git commit -m "feat: history-backed stores with edit actions, selection, toast, theme"
```

---

## Task 5: `LeafEditor.svelte` — type-aware value editor

**Files:**
- Create: `src/lib/editors/LeafEditor.svelte`
- Test: `tests/LeafEditor.test.ts`

**Interfaces:**
- Consumes: `stores.editValue`, `classify`, `JsonValue`, `Path`.
- Props: `{ value: JsonValue; path: Path }`. On change, calls `editValue(path, newValue)` with type preserved (string→string, number→number, boolean→boolean; `null` shown, editing turns into string).

- [ ] **Step 1: Write the failing test**

`tests/LeafEditor.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/svelte';
import { get } from 'svelte/store';
import LeafEditor from '../src/lib/editors/LeafEditor.svelte';
import { data, loadDocument } from '../src/lib/stores';

beforeEach(() => loadDocument({ s: 'hi', n: 3, b: false }, null));

describe('LeafEditor', () => {
  it('edits string', async () => {
    render(LeafEditor, { value: 'hi', path: ['s'] });
    await fireEvent.input(screen.getByDisplayValue('hi'), { target: { value: 'bye' } });
    expect((get(data) as any).s).toBe('bye');
  });
  it('edits number as number', async () => {
    render(LeafEditor, { value: 3, path: ['n'] });
    await fireEvent.input(screen.getByDisplayValue('3'), { target: { value: '7' } });
    expect((get(data) as any).n).toBe(7);
  });
  it('toggles boolean', async () => {
    render(LeafEditor, { value: false, path: ['b'] });
    await fireEvent.click(screen.getByRole('checkbox'));
    expect((get(data) as any).b).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/LeafEditor.test.ts`
Expected: FAIL — component not found.

- [ ] **Step 3: Implement `src/lib/editors/LeafEditor.svelte`**

```svelte
<script lang="ts">
  import { classify, type JsonValue, type Path } from '../jsonModel';
  import { editValue } from '../stores';

  let { value, path }: { value: JsonValue; path: Path } = $props();
  const kind = $derived(classify(value));

  const onStr = (e: Event) => editValue(path, (e.target as HTMLInputElement).value);
  const onNum = (e: Event) => {
    const n = Number((e.target as HTMLInputElement).value);
    editValue(path, Number.isNaN(n) ? 0 : n);
  };
  const onBool = (e: Event) => editValue(path, (e.target as HTMLInputElement).checked);
</script>

{#if kind === 'string'}
  <input type="text" value={value as string} oninput={onStr} />
{:else if kind === 'number'}
  <input type="number" value={value as number} oninput={onNum} />
{:else if kind === 'boolean'}
  <input type="checkbox" checked={value as boolean} onchange={onBool} />
{:else if kind === 'null'}
  <input type="text" placeholder="null" value="" oninput={onStr} class="null-input" />
{/if}

<style>
  input[type="text"], input[type="number"] { width: 100%; min-width: 8rem; }
  .null-input::placeholder { color: var(--text-muted); font-style: italic; }
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/LeafEditor.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/editors/LeafEditor.svelte tests/LeafEditor.test.ts
git commit -m "feat: LeafEditor type-aware value editor"
```

---

## Task 6: `ScalarArrayEditor.svelte` — chips

**Files:**
- Create: `src/lib/editors/ScalarArrayEditor.svelte`
- Test: `tests/ScalarArrayEditor.test.ts`

**Interfaces:**
- Consumes: `stores` (`editValue`, `addItem`, `removeItem`), `LeafEditor`, `JsonValue`, `Path`.
- Props: `{ value: JsonValue[]; path: Path }`. Each item = a `LeafEditor` (path `[...path, i]`) + remove button (`removeItem(path, i)`); an add button (`addItem(path)`).

- [ ] **Step 1: Write the failing test**

`tests/ScalarArrayEditor.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/svelte';
import { get } from 'svelte/store';
import ScalarArrayEditor from '../src/lib/editors/ScalarArrayEditor.svelte';
import { data, loadDocument } from '../src/lib/stores';

beforeEach(() => loadDocument({ words: ['cat', 'dog'] }, null));

describe('ScalarArrayEditor', () => {
  it('edits an item', async () => {
    render(ScalarArrayEditor, { value: ['cat', 'dog'], path: ['words'] });
    await fireEvent.input(screen.getByDisplayValue('dog'), { target: { value: 'fox' } });
    expect((get(data) as any).words).toEqual(['cat', 'fox']);
  });
  it('adds a chip', async () => {
    render(ScalarArrayEditor, { value: ['cat', 'dog'], path: ['words'] });
    await fireEvent.click(screen.getByRole('button', { name: /add/i }));
    expect((get(data) as any).words).toEqual(['cat', 'dog', '']);
  });
  it('removes a chip', async () => {
    render(ScalarArrayEditor, { value: ['cat', 'dog'], path: ['words'] });
    await fireEvent.click(screen.getAllByRole('button', { name: /remove/i })[0]);
    expect((get(data) as any).words).toEqual(['dog']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ScalarArrayEditor.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/lib/editors/ScalarArrayEditor.svelte`**

```svelte
<script lang="ts">
  import { Plus, X } from 'lucide-svelte';
  import { type JsonValue, type Path } from '../jsonModel';
  import { addItem, removeItem } from '../stores';
  import LeafEditor from './LeafEditor.svelte';

  let { value, path }: { value: JsonValue[]; path: Path } = $props();
</script>

<div class="chips">
  {#each value as item, i}
    <div class="chip">
      <LeafEditor value={item} path={[...path, i]} />
      <button class="rm" aria-label="remove" onclick={() => removeItem(path, i)}>
        <X size={14} />
      </button>
    </div>
  {/each}
  <button class="add" aria-label="add" onclick={() => addItem(path)}>
    <Plus size={14} /> Add
  </button>
</div>

<style>
  .chips { display:flex; flex-wrap:wrap; gap:8px; }
  .chip { display:flex; align-items:center; gap:4px; background:var(--surface);
    border:1px solid var(--border); border-radius:16px; padding:2px 4px 2px 10px; }
  .chip :global(input[type="text"]) { border:none; background:transparent; padding:2px 0;
    min-width:5rem; width:auto; }
  .chip :global(input:focus) { outline:none; }
  .rm { display:flex; border:none; background:transparent; color:var(--text-muted); border-radius:50%; padding:2px; }
  .rm:hover { color:var(--accent); background:var(--accent-weak); }
  .add { display:flex; align-items:center; gap:4px; border:1px dashed var(--accent);
    color:var(--accent); background:var(--accent-weak); border-radius:16px; padding:3px 12px; }
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/ScalarArrayEditor.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/editors/ScalarArrayEditor.svelte tests/ScalarArrayEditor.test.ts
git commit -m "feat: ScalarArrayEditor chips"
```

---

## Task 7: `ObjectArrayTable.svelte` — record table

**Files:**
- Create: `src/lib/editors/ObjectArrayTable.svelte`
- Test: `tests/ObjectArrayTable.test.ts`

**Interfaces:**
- Consumes: `stores` (`addItem`, `removeItem`), `objectKeyUnion`, `classify`, `LeafEditor`, `select` (for drill-in on nested cells), `JsonValue`, `Path`.
- Props: `{ value: JsonValue[]; path: Path }`. Columns = `objectKeyUnion(value)`; each cell: if scalar/null → `LeafEditor` at `[...path, i, col]`; if nested container → a "drill-in" button calling `select([...path, i, col])`. Per-row delete; add-row.

- [ ] **Step 1: Write the failing test**

`tests/ObjectArrayTable.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/svelte';
import { get } from 'svelte/store';
import ObjectArrayTable from '../src/lib/editors/ObjectArrayTable.svelte';
import { data, loadDocument } from '../src/lib/stores';

beforeEach(() => loadDocument({ rows: [{ name: 'a', qty: 1 }, { name: 'b', qty: 2 }] }, null));

describe('ObjectArrayTable', () => {
  it('renders a header per union key', () => {
    render(ObjectArrayTable, { value: [{ name: 'a', qty: 1 }], path: ['rows'] });
    expect(screen.getByRole('columnheader', { name: 'name' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'qty' })).toBeInTheDocument();
  });
  it('edits a cell', async () => {
    render(ObjectArrayTable, { value: [{ name: 'a', qty: 1 }, { name: 'b', qty: 2 }], path: ['rows'] });
    await fireEvent.input(screen.getByDisplayValue('b'), { target: { value: 'c' } });
    expect((get(data) as any).rows[1].name).toBe('c');
  });
  it('adds a row', async () => {
    render(ObjectArrayTable, { value: [{ name: 'a', qty: 1 }], path: ['rows'] });
    await fireEvent.click(screen.getByRole('button', { name: /add row/i }));
    expect((get(data) as any).rows).toHaveLength(2);
    expect((get(data) as any).rows[1]).toEqual({ name: '', qty: 0 });
  });
  it('deletes a row', async () => {
    render(ObjectArrayTable, { value: [{ name: 'a', qty: 1 }, { name: 'b', qty: 2 }], path: ['rows'] });
    await fireEvent.click(screen.getAllByRole('button', { name: /delete row/i })[0]);
    expect((get(data) as any).rows).toEqual([{ name: 'b', qty: 2 }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ObjectArrayTable.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/lib/editors/ObjectArrayTable.svelte`**

```svelte
<script lang="ts">
  import { Plus, Trash2, ChevronRight } from 'lucide-svelte';
  import { objectKeyUnion, classify, type JsonValue, type Path } from '../jsonModel';
  import { addItem, removeItem, select } from '../stores';
  import LeafEditor from './LeafEditor.svelte';

  let { value, path }: { value: JsonValue[]; path: Path } = $props();
  const cols = $derived(objectKeyUnion(value));
  const isContainer = (v: JsonValue) => {
    const k = classify(v);
    return k === 'object' || k === 'array-of-objects' || k === 'array-of-scalars' || k === 'array-mixed';
  };
</script>

<div class="table-wrap">
  <table>
    <thead>
      <tr>
        {#each cols as col}<th>{col}</th>{/each}
        <th aria-label="actions"></th>
      </tr>
    </thead>
    <tbody>
      {#each value as row, i}
        <tr>
          {#each cols as col}
            <td>
              {#if isContainer((row as Record<string, JsonValue>)[col])}
                <button class="drill" onclick={() => select([...path, i, col])}>
                  {classify((row as Record<string, JsonValue>)[col])} <ChevronRight size={14} />
                </button>
              {:else}
                <LeafEditor value={(row as Record<string, JsonValue>)[col] ?? ''} path={[...path, i, col]} />
              {/if}
            </td>
          {/each}
          <td>
            <button class="rm" aria-label="delete row" onclick={() => removeItem(path, i)}>
              <Trash2 size={15} />
            </button>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
  <button class="add" onclick={() => addItem(path)}><Plus size={15} /> Add row</button>
</div>

<style>
  .table-wrap { overflow-x:auto; }
  table { border-collapse:collapse; width:100%; }
  th { text-align:left; font-size:12px; color:var(--text-muted); font-weight:600;
    padding:6px 10px; border-bottom:2px solid var(--border); }
  td { padding:4px 8px; border-bottom:1px solid var(--border); vertical-align:middle; }
  .drill { display:inline-flex; align-items:center; gap:4px; border:1px solid var(--border);
    background:var(--surface); border-radius:6px; padding:2px 8px; color:var(--text-muted); }
  .drill:hover { border-color:var(--accent); color:var(--accent); }
  .rm { display:flex; border:none; background:transparent; color:var(--text-muted); padding:4px; border-radius:6px; }
  .rm:hover { color:var(--accent); background:var(--accent-weak); }
  .add { display:inline-flex; align-items:center; gap:4px; margin-top:8px;
    border:1px dashed var(--accent); color:var(--accent); background:var(--accent-weak);
    border-radius:8px; padding:4px 12px; }
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/ObjectArrayTable.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/editors/ObjectArrayTable.svelte tests/ObjectArrayTable.test.ts
git commit -m "feat: ObjectArrayTable record table with add/delete rows"
```

---

## Task 8: `ObjectForm.svelte` — object key/value form + drill-in

**Files:**
- Create: `src/lib/editors/ObjectForm.svelte`
- Test: `tests/ObjectForm.test.ts`

**Interfaces:**
- Consumes: `stores` (`select`), `classify`, `LeafEditor`, `JsonValue`, `Path`.
- Props: `{ value: Record<string, JsonValue>; path: Path }`. Each key: label + if scalar/null → `LeafEditor` at `[...path, key]`; if container → drill-in button `select([...path, key])` showing a short summary.

- [ ] **Step 1: Write the failing test**

`tests/ObjectForm.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/svelte';
import { get } from 'svelte/store';
import ObjectForm from '../src/lib/editors/ObjectForm.svelte';
import { data, selectedPath, loadDocument } from '../src/lib/stores';

beforeEach(() => loadDocument({ title: 'Hi', nested: { a: 1 } }, null));

describe('ObjectForm', () => {
  it('renders scalar keys with editable values', async () => {
    render(ObjectForm, { value: { title: 'Hi', nested: { a: 1 } }, path: [] });
    expect(screen.getByText('title')).toBeInTheDocument();
    await fireEvent.input(screen.getByDisplayValue('Hi'), { target: { value: 'Bye' } });
    expect((get(data) as any).title).toBe('Bye');
  });
  it('drills into a nested container', async () => {
    render(ObjectForm, { value: { title: 'Hi', nested: { a: 1 } }, path: [] });
    await fireEvent.click(screen.getByRole('button', { name: /nested/i }));
    expect(get(selectedPath)).toEqual(['nested']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ObjectForm.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/lib/editors/ObjectForm.svelte`**

```svelte
<script lang="ts">
  import { ChevronRight } from 'lucide-svelte';
  import { classify, type JsonValue, type Path } from '../jsonModel';
  import { select } from '../stores';
  import LeafEditor from './LeafEditor.svelte';

  let { value, path }: { value: Record<string, JsonValue>; path: Path } = $props();
  const keys = $derived(Object.keys(value));
  const isContainer = (v: JsonValue) => {
    const k = classify(v);
    return k === 'object' || k === 'array-of-objects' || k === 'array-of-scalars' || k === 'array-mixed';
  };
  const summary = (v: JsonValue) => {
    const k = classify(v);
    if (k === 'object') return `{ ${Object.keys(v as object).length} keys }`;
    if (k.startsWith('array')) return `[ ${(v as JsonValue[]).length} items ]`;
    return '';
  };
</script>

<div class="form">
  {#each keys as key}
    <div class="row">
      <div class="key">{key}</div>
      <div class="val">
        {#if isContainer(value[key])}
          <button class="drill" onclick={() => select([...path, key])}>
            <span>{summary(value[key])}</span> <ChevronRight size={15} />
          </button>
        {:else}
          <LeafEditor value={value[key]} path={[...path, key]} />
        {/if}
      </div>
    </div>
  {/each}
</div>

<style>
  .form { display:flex; flex-direction:column; gap:8px; }
  .row { display:grid; grid-template-columns: minmax(6rem, 14rem) 1fr; gap:12px; align-items:center; }
  .key { font-weight:600; color:var(--text); }
  .drill { display:inline-flex; align-items:center; gap:6px; border:1px solid var(--border);
    background:var(--surface); color:var(--text-muted); border-radius:8px; padding:5px 12px; width:100%;
    justify-content:space-between; }
  .drill:hover { border-color:var(--accent); color:var(--accent); }
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/ObjectForm.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/editors/ObjectForm.svelte tests/ObjectForm.test.ts
git commit -m "feat: ObjectForm key/value form with drill-in"
```

---

## Task 9: `MixedArrayList.svelte` — generic list + drill-in

**Files:**
- Create: `src/lib/editors/MixedArrayList.svelte`
- Test: `tests/MixedArrayList.test.ts`

**Interfaces:**
- Consumes: `stores` (`addItem`, `removeItem`, `select`), `classify`, `LeafEditor`, `JsonValue`, `Path`.
- Props: `{ value: JsonValue[]; path: Path }`. Each item: scalar → `LeafEditor`; container → drill-in `select([...path, i])`. Per-item delete + add.

- [ ] **Step 1: Write the failing test**

`tests/MixedArrayList.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/svelte';
import { get } from 'svelte/store';
import MixedArrayList from '../src/lib/editors/MixedArrayList.svelte';
import { data, selectedPath, loadDocument } from '../src/lib/stores';

beforeEach(() => loadDocument({ mix: [1, { a: 2 }] }, null));

describe('MixedArrayList', () => {
  it('edits a scalar item and drills into a container item', async () => {
    render(MixedArrayList, { value: [1, { a: 2 }], path: ['mix'] });
    await fireEvent.input(screen.getByDisplayValue('1'), { target: { value: '5' } });
    expect((get(data) as any).mix[0]).toBe(5);
    await fireEvent.click(screen.getByRole('button', { name: /open item 2/i }));
    expect(get(selectedPath)).toEqual(['mix', 1]);
  });
  it('adds and removes items', async () => {
    render(MixedArrayList, { value: [1, { a: 2 }], path: ['mix'] });
    await fireEvent.click(screen.getByRole('button', { name: /add item/i }));
    expect((get(data) as any).mix).toHaveLength(3);
    await fireEvent.click(screen.getAllByRole('button', { name: /delete item/i })[0]);
    expect((get(data) as any).mix.length).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/MixedArrayList.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/lib/editors/MixedArrayList.svelte`**

```svelte
<script lang="ts">
  import { Plus, Trash2, ChevronRight } from 'lucide-svelte';
  import { classify, type JsonValue, type Path } from '../jsonModel';
  import { addItem, removeItem, select } from '../stores';
  import LeafEditor from './LeafEditor.svelte';

  let { value, path }: { value: JsonValue[]; path: Path } = $props();
  const isContainer = (v: JsonValue) => {
    const k = classify(v);
    return k === 'object' || k === 'array-of-objects' || k === 'array-of-scalars' || k === 'array-mixed';
  };
</script>

<div class="list">
  {#each value as item, i}
    <div class="item">
      <span class="idx">{i}</span>
      <div class="body">
        {#if isContainer(item)}
          <button class="drill" aria-label={`open item ${i + 1}`} onclick={() => select([...path, i])}>
            {classify(item)} <ChevronRight size={14} />
          </button>
        {:else}
          <LeafEditor value={item} path={[...path, i]} />
        {/if}
      </div>
      <button class="rm" aria-label="delete item" onclick={() => removeItem(path, i)}><Trash2 size={15} /></button>
    </div>
  {/each}
  <button class="add" onclick={() => addItem(path)}><Plus size={15} /> Add item</button>
</div>

<style>
  .list { display:flex; flex-direction:column; gap:6px; }
  .item { display:flex; align-items:center; gap:8px; }
  .idx { color:var(--text-muted); font-size:12px; min-width:1.5rem; text-align:right; }
  .body { flex:1; }
  .drill { display:inline-flex; align-items:center; gap:4px; border:1px solid var(--border);
    background:var(--surface); border-radius:6px; padding:3px 10px; color:var(--text-muted); }
  .drill:hover { border-color:var(--accent); color:var(--accent); }
  .rm { display:flex; border:none; background:transparent; color:var(--text-muted); padding:4px; border-radius:6px; }
  .rm:hover { color:var(--accent); background:var(--accent-weak); }
  .add { display:inline-flex; align-items:center; gap:4px; margin-top:6px; align-self:flex-start;
    border:1px dashed var(--accent); color:var(--accent); background:var(--accent-weak);
    border-radius:8px; padding:4px 12px; }
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/MixedArrayList.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/editors/MixedArrayList.svelte tests/MixedArrayList.test.ts
git commit -m "feat: MixedArrayList generic list with drill-in"
```

---

## Task 10: `Breadcrumb.svelte`

**Files:**
- Create: `src/lib/components/Breadcrumb.svelte`
- Test: `tests/Breadcrumb.test.ts`

**Interfaces:**
- Consumes: `stores.select`, `Path`.
- Props: `{ path: Path }`. Renders "root" + each segment; clicking segment k → `select(path.slice(0, k+1))`; clicking "root" → `select([])`.

- [ ] **Step 1: Write the failing test**

`tests/Breadcrumb.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/svelte';
import { get } from 'svelte/store';
import Breadcrumb from '../src/lib/components/Breadcrumb.svelte';
import { selectedPath } from '../src/lib/stores';

describe('Breadcrumb', () => {
  it('shows root and segments; clicking navigates', async () => {
    render(Breadcrumb, { path: ['folders', 0, 'words'] });
    expect(screen.getByRole('button', { name: 'root' })).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'folders' }));
    expect(get(selectedPath)).toEqual(['folders']);
    await fireEvent.click(screen.getByRole('button', { name: 'root' }));
    expect(get(selectedPath)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/Breadcrumb.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/lib/components/Breadcrumb.svelte`**

```svelte
<script lang="ts">
  import { ChevronRight } from 'lucide-svelte';
  import { type Path } from '../jsonModel';
  import { select } from '../stores';
  let { path }: { path: Path } = $props();
</script>

<nav class="crumbs">
  <button onclick={() => select([])}>root</button>
  {#each path as seg, i}
    <ChevronRight size={13} class="sep" />
    <button onclick={() => select(path.slice(0, i + 1))}>{seg}</button>
  {/each}
</nav>

<style>
  .crumbs { display:flex; align-items:center; gap:4px; flex-wrap:wrap; color:var(--text-muted); font-size:12px; }
  .crumbs button { border:none; background:transparent; color:var(--text-muted); padding:2px 4px; border-radius:4px; }
  .crumbs button:last-child { color:var(--text); font-weight:600; }
  .crumbs button:hover { color:var(--accent); background:var(--accent-weak); }
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/Breadcrumb.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/Breadcrumb.svelte tests/Breadcrumb.test.ts
git commit -m "feat: Breadcrumb navigation"
```

---

## Task 11: `DetailPane.svelte` — dispatch by classify + empty state

**Files:**
- Create: `src/lib/components/DetailPane.svelte`
- Test: `tests/DetailPane.test.ts`

**Interfaces:**
- Consumes: `stores` (`data`, `selectedPath`), `getAtPath`, `classify`, `pathExists`, all editors, `Breadcrumb`.
- Renders the node at `$selectedPath`: breadcrumb + the matching editor. If `$data === null` → empty state ("No file open"). If selected path invalid → falls back to root (should not happen; store clamps).

- [ ] **Step 1: Write the failing test**

`tests/DetailPane.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import DetailPane from '../src/lib/components/DetailPane.svelte';
import { loadDocument, select } from '../src/lib/stores';

describe('DetailPane', () => {
  beforeEach(() => loadDocument({ words: ['cat'], meta: { v: 1 } }, null));

  it('renders chips for a selected scalar array', () => {
    select(['words']);
    render(DetailPane);
    expect(screen.getByDisplayValue('cat')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add/i })).toBeInTheDocument();
  });
  it('renders an object form at root', () => {
    select([]);
    render(DetailPane);
    expect(screen.getByText('words')).toBeInTheDocument();
    expect(screen.getByText('meta')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/DetailPane.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/lib/components/DetailPane.svelte`**

```svelte
<script lang="ts">
  import { FileQuestion } from 'lucide-svelte';
  import { getAtPath, classify, type JsonValue } from '../jsonModel';
  import { data, selectedPath } from '../stores';
  import { pathExists } from '../pathUtils';
  import Breadcrumb from './Breadcrumb.svelte';
  import ObjectForm from '../editors/ObjectForm.svelte';
  import ObjectArrayTable from '../editors/ObjectArrayTable.svelte';
  import ScalarArrayEditor from '../editors/ScalarArrayEditor.svelte';
  import MixedArrayList from '../editors/MixedArrayList.svelte';
  import LeafEditor from '../editors/LeafEditor.svelte';

  const node = $derived(
    $data !== null && pathExists($data, $selectedPath) ? getAtPath($data, $selectedPath) : null,
  );
  const kind = $derived(node === null && $data === null ? 'empty' : classify(node as JsonValue));
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
      {#if kind === 'object'}
        <ObjectForm value={node as Record<string, JsonValue>} path={$selectedPath} />
      {:else if kind === 'array-of-objects'}
        <ObjectArrayTable value={node as JsonValue[]} path={$selectedPath} />
      {:else if kind === 'array-of-scalars'}
        <ScalarArrayEditor value={node as JsonValue[]} path={$selectedPath} />
      {:else if kind === 'array-mixed'}
        <MixedArrayList value={node as JsonValue[]} path={$selectedPath} />
      {:else}
        <LeafEditor value={node as JsonValue} path={$selectedPath} />
      {/if}
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

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/DetailPane.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/DetailPane.svelte tests/DetailPane.test.ts
git commit -m "feat: DetailPane adaptive dispatch + empty state"
```

---

## Task 12: `TreeNode.svelte` + `TreePane.svelte` — navigation + search

**Files:**
- Create: `src/lib/components/TreeNode.svelte`, `src/lib/components/TreePane.svelte`
- Create: `src/lib/treeFilter.ts` (pure match helper)
- Test: `tests/treeFilter.test.ts`, `tests/TreePane.test.ts`

**Interfaces:**
- `treeFilter.ts` produces:
  - `nodeMatches(key: string, value: JsonValue, query: string): boolean` — case-insensitive; matches the key label, or (for leaves) the stringified value.
  - `subtreeMatches(key: string, value: JsonValue, query: string): boolean` — true if this node or any descendant matches (controls visibility + auto-expand).
- `TreeNode.svelte` props: `{ label: string; value: JsonValue; path: Path; query: string }`. Renders a row; containers get a chevron and recurse into children (object entries / array indices). Hidden if `query` non-empty and `!subtreeMatches`. Auto-expanded when `query` non-empty. Clicking selects (`select(path)`); selected row highlighted when `path` equals `$selectedPath`.
- `TreePane.svelte`: search `<input>` bound to a local `query`; renders the root as a `TreeNode` with `label="root"`.

- [ ] **Step 1: Write the failing test (treeFilter)**

`tests/treeFilter.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { nodeMatches, subtreeMatches } from '../src/lib/treeFilter';

describe('treeFilter', () => {
  it('nodeMatches key or scalar value, case-insensitive', () => {
    expect(nodeMatches('keySound', 'ai', 'sound')).toBe(true);
    expect(nodeMatches('x', 'Hello', 'hell')).toBe(true);
    expect(nodeMatches('x', 5, '5')).toBe(true);
    expect(nodeMatches('x', 'nope', 'zzz')).toBe(false);
  });
  it('subtreeMatches finds deep matches', () => {
    const v = { cards: [{ words: ['b[ai]t', 'rain'] }] };
    expect(subtreeMatches('folders', v, 'rain')).toBe(true);
    expect(subtreeMatches('folders', v, 'cards')).toBe(true);
    expect(subtreeMatches('folders', v, 'zzz')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/treeFilter.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/lib/treeFilter.ts`**

```ts
import { type JsonValue } from './jsonModel';

export function nodeMatches(key: string, value: JsonValue, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (key.toLowerCase().includes(q)) return true;
  if (value === null || typeof value !== 'object') return String(value).toLowerCase().includes(q);
  return false;
}

export function subtreeMatches(key: string, value: JsonValue, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (nodeMatches(key, value, q)) return true;
  if (Array.isArray(value)) return value.some((v, i) => subtreeMatches(String(i), v, q));
  if (value !== null && typeof value === 'object')
    return Object.entries(value).some(([k, v]) => subtreeMatches(k, v, q));
  return false;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/treeFilter.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement `src/lib/components/TreeNode.svelte`**

```svelte
<script lang="ts">
  import { ChevronRight, ChevronDown } from 'lucide-svelte';
  import { classify, type JsonValue, type Path } from '../jsonModel';
  import { selectedPath, select } from '../stores';
  import { subtreeMatches } from '../treeFilter';
  import Self from './TreeNode.svelte';

  let { label, value, path, query }: { label: string; value: JsonValue; path: Path; query: string } = $props();

  const kind = $derived(classify(value));
  const isContainer = $derived(kind === 'object' || kind.startsWith('array'));
  let manuallyOpen = $state(path.length === 0); // root open by default
  const open = $derived(query.trim() ? true : manuallyOpen);
  const visible = $derived(subtreeMatches(label, value, query));

  const selected = $derived(
    $selectedPath.length === path.length && $selectedPath.every((s, i) => s === path[i]),
  );

  const entries = $derived(
    kind === 'object'
      ? Object.entries(value as Record<string, JsonValue>)
      : kind.startsWith('array')
        ? (value as JsonValue[]).map((v, i) => [String(i), v] as [string, JsonValue])
        : [],
  );
</script>

{#if visible}
  <div class="node">
    <div class="row" class:selected style={`padding-left:${path.length * 12 + 4}px`}>
      {#if isContainer}
        <button class="chev" aria-label={open ? 'collapse' : 'expand'} onclick={() => (manuallyOpen = !open)}>
          {#if open}<ChevronDown size={14} />{:else}<ChevronRight size={14} />{/if}
        </button>
      {:else}
        <span class="chev-spacer"></span>
      {/if}
      <button class="label" onclick={() => select(path)}>{label}</button>
    </div>
    {#if isContainer && open}
      {#each entries as [k, v]}
        <Self label={k} value={v} path={[...path, kind === 'object' ? k : Number(k)]} {query} />
      {/each}
    {/if}
  </div>
{/if}

<style>
  .row { display:flex; align-items:center; gap:2px; border-radius:6px; }
  .row:hover { background:var(--accent-weak); }
  .row.selected { background:var(--accent-weak); box-shadow: inset 3px 0 0 var(--accent); }
  .row.selected .label { color:var(--accent); font-weight:600; }
  .chev, .label { border:none; background:transparent; color:var(--text); padding:3px 4px; }
  .chev { display:flex; color:var(--text-muted); }
  .chev-spacer { width:22px; }
  .label { flex:1; text-align:left; }
</style>
```

- [ ] **Step 6: Implement `src/lib/components/TreePane.svelte`**

```svelte
<script lang="ts">
  import { Search } from 'lucide-svelte';
  import { data } from '../stores';
  import type { JsonValue } from '../jsonModel';
  import TreeNode from './TreeNode.svelte';

  let query = $state('');
</script>

<div class="pane">
  <div class="search">
    <Search size={15} />
    <input type="text" placeholder="Search…" bind:value={query} />
  </div>
  <div class="tree">
    {#if $data !== null}
      <TreeNode label="root" value={$data as JsonValue} path={[]} {query} />
    {/if}
  </div>
</div>

<style>
  .pane { height:100%; display:flex; flex-direction:column; background:var(--sidebar);
    border-right:1px solid var(--border); }
  .search { display:flex; align-items:center; gap:6px; padding:10px 12px; color:var(--text-muted);
    border-bottom:1px solid var(--border); }
  .search input { flex:1; border:none; background:transparent; }
  .search input:focus { outline:none; }
  .tree { flex:1; overflow:auto; padding:8px 6px; font-size:13px; }
</style>
```

- [ ] **Step 7: Write and run the TreePane test**

`tests/TreePane.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/svelte';
import { get } from 'svelte/store';
import TreePane from '../src/lib/components/TreePane.svelte';
import { loadDocument, selectedPath } from '../src/lib/stores';

beforeEach(() => loadDocument({ folders: [{ keySound: 'ai' }], notes: ['hello'] }, null));

describe('TreePane', () => {
  it('clicking a node selects its path', async () => {
    render(TreePane);
    await fireEvent.click(screen.getByRole('button', { name: 'folders' }));
    expect(get(selectedPath)).toEqual(['folders']);
  });
  it('search hides non-matching top-level nodes', async () => {
    render(TreePane);
    expect(screen.getByRole('button', { name: 'notes' })).toBeInTheDocument();
    await fireEvent.input(screen.getByPlaceholderText('Search…'), { target: { value: 'keySound' } });
    expect(screen.queryByRole('button', { name: 'notes' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'folders' })).toBeInTheDocument();
  });
});
```
Run: `npx vitest run tests/TreePane.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/components/TreeNode.svelte src/lib/components/TreePane.svelte src/lib/treeFilter.ts tests/treeFilter.test.ts tests/TreePane.test.ts
git commit -m "feat: navigation tree with search filter and selection"
```

---

## Task 13: `Toast.svelte`

**Files:**
- Create: `src/lib/components/Toast.svelte`
- Test: `tests/Toast.test.ts`

**Interfaces:**
- Consumes: `stores.toast`, `stores.showToast`.
- Renders the current toast (or nothing). Success/error styling.

- [ ] **Step 1: Write the failing test**

`tests/Toast.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Toast from '../src/lib/components/Toast.svelte';
import { showToast, toast } from '../src/lib/stores';

describe('Toast', () => {
  it('shows nothing initially, then the message', async () => {
    toast.set(null);
    render(Toast);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    showToast('Saved');
    expect(await screen.findByRole('status')).toHaveTextContent('Saved');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/Toast.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/lib/components/Toast.svelte`**

```svelte
<script lang="ts">
  import { Check, AlertTriangle } from 'lucide-svelte';
  import { toast } from '../stores';
</script>

{#if $toast}
  <div class="toast" class:error={$toast.kind === 'error'} role="status">
    {#if $toast.kind === 'error'}<AlertTriangle size={16} />{:else}<Check size={16} />{/if}
    <span>{$toast.message}</span>
  </div>
{/if}

<style>
  .toast { position:fixed; bottom:20px; left:50%; transform:translateX(-50%);
    display:flex; align-items:center; gap:8px; background:var(--surface);
    border:1px solid var(--border); border-left:4px solid var(--accent);
    border-radius:8px; padding:10px 16px; box-shadow:0 4px 16px rgba(0,0,0,.12); color:var(--text); }
  .toast.error { border-left-color:#c0392b; }
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/Toast.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/Toast.svelte tests/Toast.test.ts
git commit -m "feat: Toast notifications"
```

---

## Task 14: `Toolbar.svelte`

**Files:**
- Create: `src/lib/components/Toolbar.svelte`
- Test: `tests/Toolbar.test.ts`

**Interfaces:**
- Consumes: `stores` (`data`, `filePath`, `dirty`, `canUndo`, `canRedo`, `undo`, `redo`, `theme`, `setTheme`), `fileService` (`pickOpen`, `saveCurrent`, `pickSave`).
- Renders Open/Save/Save As, Undo/Redo (disabled per canUndo/canRedo), filename + `●`, theme toggle cycling light→dark→system.

- [ ] **Step 1: Write the failing test**

`tests/Toolbar.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/svelte';
import { get } from 'svelte/store';
import Toolbar from '../src/lib/components/Toolbar.svelte';
import { loadDocument, editValue, data } from '../src/lib/stores';

beforeEach(() => loadDocument({ words: ['a'] }, '/tmp/demo.json'));

describe('Toolbar', () => {
  it('shows the filename and enables undo after an edit', async () => {
    render(Toolbar);
    expect(screen.getByText('demo.json')).toBeInTheDocument();
    const undoBtn = screen.getByRole('button', { name: /undo/i }) as HTMLButtonElement;
    expect(undoBtn.disabled).toBe(true);
    editValue(['words', 0], 'z');
    expect(undoBtn.disabled).toBe(false);
  });
  it('undo button reverts the last edit', async () => {
    render(Toolbar);
    editValue(['words', 0], 'z');
    await fireEvent.click(screen.getByRole('button', { name: /undo/i }));
    expect((get(data) as any).words).toEqual(['a']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/Toolbar.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/lib/components/Toolbar.svelte`**

```svelte
<script lang="ts">
  import { FolderOpen, Save, SaveAll, Undo2, Redo2, Sun, Moon, Monitor } from 'lucide-svelte';
  import { data, filePath, dirty, canUndo, canRedo, undo, redo, theme, setTheme } from '../stores';
  import { pickOpen, saveCurrent, pickSave } from '../fileService';
  import type { Theme } from '../theme';

  const fileName = $derived($filePath ? $filePath.split(/[\\/]/).pop() : 'No file');
  const nextTheme: Record<Theme, Theme> = { light: 'dark', dark: 'system', system: 'light' };
</script>

<header class="toolbar">
  <div class="grp">
    <button onclick={pickOpen} title="Open (Ctrl+O)"><FolderOpen size={18} /> Open</button>
    <button onclick={saveCurrent} disabled={$data === null} title="Save (Ctrl+S)"><Save size={18} /> Save</button>
    <button onclick={pickSave} disabled={$data === null} title="Save As"><SaveAll size={18} /> Save As</button>
  </div>
  <span class="sep"></span>
  <div class="grp">
    <button onclick={undo} disabled={!$canUndo} aria-label="undo" title="Undo (Ctrl+Z)"><Undo2 size={18} /></button>
    <button onclick={redo} disabled={!$canRedo} aria-label="redo" title="Redo (Ctrl+Y)"><Redo2 size={18} /></button>
  </div>
  <div class="spacer"></div>
  <span class="file">{$dirty ? '● ' : ''}{fileName}</span>
  <button class="theme" onclick={() => setTheme(nextTheme[$theme])} aria-label="toggle theme" title={`Theme: ${$theme}`}>
    {#if $theme === 'light'}<Sun size={18} />{:else if $theme === 'dark'}<Moon size={18} />{:else}<Monitor size={18} />{/if}
  </button>
</header>

<style>
  .toolbar { display:flex; align-items:center; gap:10px; padding:8px 12px;
    background:var(--surface); border-bottom:1px solid var(--border); }
  .grp { display:flex; gap:4px; }
  .toolbar button { display:inline-flex; align-items:center; gap:6px; border:1px solid transparent;
    background:transparent; border-radius:8px; padding:5px 10px; color:var(--text); }
  .toolbar button:hover:not(:disabled) { background:var(--accent-weak); color:var(--accent); }
  .toolbar button:disabled { opacity:.4; cursor:default; }
  .sep { width:1px; height:22px; background:var(--border); }
  .spacer { flex:1; }
  .file { color:var(--text-muted); font-size:13px; }
  .theme { color:var(--text-muted); }
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/Toolbar.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/Toolbar.svelte tests/Toolbar.test.ts
git commit -m "feat: Toolbar with file actions, undo/redo, theme toggle"
```

---

## Task 15: `fileService.ts` — English copy + save toast

**Files:**
- Modify: `src/lib/fileService.ts`
- Test: `tests/fileService.test.ts` (keep existing `serialize` test; add nothing that needs Tauri)

**Interfaces:**
- Consumes: `stores` (`data`, `filePath`, `loadDocument`, `markSaved`, `showToast`).
- Same functions as v1; strings now English; `saveCurrent`/`pickSave` call `showToast('Saved')` on success and `showToast(..., 'error')` on failure; `openPath` shows `Invalid JSON file: <msg>` via toast.

- [ ] **Step 1: Rewrite `src/lib/fileService.ts`**

```ts
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { open, save } from '@tauri-apps/plugin-dialog';
import { listen } from '@tauri-apps/api/event';
import { get } from 'svelte/store';
import { data, filePath, loadDocument, markSaved, showToast } from './stores';
import type { JsonValue } from './jsonModel';

export function serialize(value: JsonValue): string {
  return JSON.stringify(value, null, 2) + '\n';
}

export async function openPath(path: string): Promise<void> {
  try {
    const text = await readTextFile(path);
    loadDocument(JSON.parse(text) as JsonValue, path);
  } catch (e) {
    showToast(`Invalid JSON file: ${(e as Error).message}`, 'error');
  }
}

export async function pickOpen(): Promise<void> {
  const selected = await open({ multiple: false, filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (typeof selected === 'string') await openPath(selected);
}

async function writeTo(path: string): Promise<void> {
  const current = get(data);
  if (current === null) return;
  try {
    await writeTextFile(path, serialize(current));
    markSaved(path);
    showToast('Saved');
  } catch (e) {
    showToast(`Could not save file: ${(e as Error).message}`, 'error');
  }
}

export async function saveCurrent(): Promise<void> {
  if (get(data) === null) return;
  const path = get(filePath);
  if (!path) { await pickSave(); return; }
  await writeTo(path);
}

export async function pickSave(): Promise<void> {
  if (get(data) === null) return;
  const path = await save({ filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (path) await writeTo(path);
}

export function listenForOpenFile(): void {
  listen<string>('open-file', (event) => { if (event.payload) openPath(event.payload); });
}
```

- [ ] **Step 2: Run existing serialize test**

Run: `npx vitest run tests/fileService.test.ts`
Expected: PASS (serialize unchanged).

- [ ] **Step 3: Commit**

```bash
git add src/lib/fileService.ts
git commit -m "refactor: fileService English copy + save/error toasts"
```

---

## Task 16: `App.svelte` shell + remove `Node.svelte`

**Files:**
- Modify: `src/App.svelte` (rewrite)
- Delete: `src/lib/Node.svelte`, `tests/Node.test.ts`
- Test: `tests/App.test.ts` (rewrite)

**Interfaces:**
- Consumes: `Toolbar`, `TreePane`, `DetailPane`, `Toast`, `stores` (`data`, `dirty`, `theme`, `undo`, `redo`), `fileService` (`pickOpen`, `saveCurrent`), `theme.ts` (`applyTheme`, `loadTheme`, `resolveTheme`).
- 2-pane layout; global keyboard shortcuts (Ctrl+O/S/Z/Y); applies theme on mount and whenever `theme` changes; dirty-close guard.

- [ ] **Step 1: Write the failing test**

`tests/App.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import App from '../src/App.svelte';
import { loadDocument } from '../src/lib/stores';

describe('App', () => {
  it('shows empty state when no document', () => {
    // @ts-expect-error resetting to empty
    loadDocument(null, null);
    render(App);
    expect(screen.getByText(/Open a JSON file to start/i)).toBeInTheDocument();
  });
  it('renders tree + detail when a document is loaded', () => {
    loadDocument({ words: ['cat'] }, '/tmp/x.json');
    render(App);
    expect(screen.getByPlaceholderText('Search…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'root' })).toBeInTheDocument(); // tree root
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/App.test.ts`
Expected: FAIL (old App markup).

- [ ] **Step 3: Rewrite `src/App.svelte`**

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import Toolbar from './lib/components/Toolbar.svelte';
  import TreePane from './lib/components/TreePane.svelte';
  import DetailPane from './lib/components/DetailPane.svelte';
  import Toast from './lib/components/Toast.svelte';
  import { data, dirty, theme, undo, redo } from './lib/stores';
  import { pickOpen, saveCurrent } from './lib/fileService';
  import { applyTheme, loadTheme } from './lib/theme';
  import { setTheme } from './lib/stores';

  function onKeydown(e: KeyboardEvent) {
    const k = e.key.toLowerCase();
    if (e.ctrlKey && k === 's') { e.preventDefault(); saveCurrent(); }
    else if (e.ctrlKey && k === 'o') { e.preventDefault(); pickOpen(); }
    else if (e.ctrlKey && k === 'z') { e.preventDefault(); undo(); }
    else if (e.ctrlKey && (k === 'y' || (e.shiftKey && k === 'z'))) { e.preventDefault(); redo(); }
  }
  function onBeforeUnload(e: BeforeUnloadEvent) { if ($dirty) { e.preventDefault(); e.returnValue = ''; } }

  // Apply theme whenever it changes.
  $effect(() => { applyTheme($theme); });

  onMount(() => {
    setTheme(loadTheme());
    window.addEventListener('keydown', onKeydown);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('keydown', onKeydown);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  });
</script>

<div class="app">
  <Toolbar />
  {#if $data === null}
    <DetailPane />
  {:else}
    <div class="body">
      <div class="left"><TreePane /></div>
      <div class="right"><DetailPane /></div>
    </div>
  {/if}
  <Toast />
</div>

<style>
  .app { height:100vh; display:flex; flex-direction:column; }
  .body { flex:1; display:grid; grid-template-columns: minmax(220px, 320px) 1fr; min-height:0; }
  .left { min-height:0; }
  .right { min-height:0; background:var(--bg); }
</style>
```

- [ ] **Step 4: Delete the obsolete v1 component + test**

Run:
```bash
git rm src/lib/Node.svelte tests/Node.test.ts
```
Expected: files removed.

- [ ] **Step 5: Run the full suite**

Run: `npx vitest run`
Expected: PASS — all suites (jsonModel, roundtrip, history, pathUtils, theme, stores, treeFilter, LeafEditor, ScalarArrayEditor, ObjectArrayTable, ObjectForm, MixedArrayList, Breadcrumb, DetailPane, TreePane, Toast, Toolbar, DetailPane, App, fileService).

- [ ] **Step 6: Verify production build + typecheck**

Run: `npm run build`
Expected: build succeeds.
Run: `npm run check`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: 2-pane App shell, wire redesign, remove v1 Node"
```

---

## Task 17: Manual acceptance (Tauri)

**Files:** none.

- [ ] **Step 1: Launch the app**

Run: `CARGO_HOME=D:\dev-cache\.cargo npm run tauri dev`
Expected: window opens with the new 2-pane UI (Paper+Terracotta).

- [ ] **Step 2: Exercise the redesign**

Open `d:/github/reading-folders-words/reading-folders-data.json`. Verify:
- Tree on left; click `folders → 0 → cards → 0 → words`; DetailPane shows chips.
- Edit a word; add a chip; delete a chip. Breadcrumb reflects location.
- **Ctrl+Z** undoes, **Ctrl+Y** redoes.
- **Ctrl+S** → "Saved" toast; `●` clears.
- Toggle theme (☀/🌙/🖥) — light/dark/system all render correctly.
- Type in Search — non-matching branches hide; matches stay with ancestors.

- [ ] **Step 3: Verify file integrity**

Run: `node -e "JSON.parse(require('fs').readFileSync('d:/github/reading-folders-words/reading-folders-data.json','utf8')); console.log('valid')"`
Expected: `valid`; structure/key order intact (diff against git if tracked).

- [ ] **Step 4: Commit any final fixes**

```bash
git add -A
git commit -m "docs: manual acceptance for UI redesign"
```

---

## Self-Review

**Spec coverage:**
- §2 Layout C (tree + adaptive detail): Tasks 11, 12, App 16. ✓
- §2 Calm Light + Paper/Terracotta tokens: Task 1. ✓
- §2 Dark mode (system + toggle): Task 1 (theme.ts, css), Toolbar 14, App 16. ✓
- §2 Undo/redo + toast + search: Tasks 2/4 (history+actions), 13 (toast), 12 (search). ✓
- §2 No confirm-delete: honored (delete is immediate, undo covers). ✓
- §2 English UI: Tasks 14, 15, 16 copy; Global Constraints. ✓
- §2 Lucide icons: Task 1 install; used in 6/7/8/9/10/11/12/13/14. ✓
- §3 components + state: Tasks 4 (stores), 5–14. ✓
- §3 history structural sharing: Task 2 + relies on frozen jsonModel. ✓
- §4 interaction (select/drill/edit/undo-clamp/search/save): Tasks 4 (clamp), 7/8/9 (drill), 12 (search). ✓
- §5 visual tokens: Task 1 exact values. ✓
- §6 adaptive rendering: Task 11 dispatch. ✓
- §7 error handling English: Task 15. ✓
- §8 testing (keep 31 + add): every task has tests; Task 16 runs full suite + build + check. ✓
- §9 repo structure: matches File Structure table; Node.svelte deleted Task 16. ✓

**Placeholder scan:** No TBD/TODO; every code step has complete code; every command has expected output. ✓

**Type consistency:** `Path`, `JsonValue`, `classify`, `objectKeyUnion`, `getAtPath`, `updateAtPath`, `addArrayItem`, `removeArrayItem` consumed from frozen jsonModel with v1 signatures. Store actions (`editValue`, `addItem`, `removeItem`, `select`, `undo`, `redo`, `showToast`, `setTheme`, `loadDocument`, `markSaved`) defined in Task 4 and consumed identically in Tasks 5–16. `Theme`/`applyTheme`/`loadTheme`/`resolveTheme` defined Task 1, consumed Tasks 4/14/16. `History`/`push`/`undo`/`redo`/`reset`/`canUndo`/`canRedo` defined Task 2, consumed Task 4. `pathExists`/`clampPath` defined Task 3, consumed Tasks 4/11. `nodeMatches`/`subtreeMatches` defined Task 12, consumed TreeNode. ✓

**Note:** `data`/`canUndo`/`canRedo` become **readable** (derived) stores in Task 4 (were writable in v1). All consumers only read them via `$` — no `.set()` calls on them anywhere. ✓
