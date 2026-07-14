# Pure Text Edit Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Form|Text tab to the editor panel; the Text tab edits the active node as raw JSON with strict validation, Apply/Revert, and a JSON5-powered Auto-fix.

**Architecture:** A pure `jsonText.ts` (validate/auto-fix/format) backs a new `TextEditorView.svelte` that reads the node at `selectedPath`, keeps a local draft, and commits via the existing `editValue`. `DetailPane` gains a Form|Text tab bar driven by a new `editorTab` store; `jsonModel.ts` is untouched.

**Tech Stack:** Svelte 5 (runes), TypeScript, Vitest + @testing-library/svelte, `json5`.

## Global Constraints

- **`jsonModel.ts` frozen** — reuse `getAtPath`, `editValue`, `JsonValue`, `Path` as-is.
- **Commit only through `editValue(path, value)`** (already history/undo-tracked).
- **Scope = node at `selectedPath`** (root = whole document).
- **Validation strict** (`JSON.parse`); **Auto-fix** lenient via `json5`, explicit (never auto-commit).
- **English UI copy.** Lucide icons via subpath imports.
- **Rust/Tauri builds:** `CARGO_HOME=D:\dev-cache\.cargo`; stop `app.exe` before `tauri build`.
- Vitest config already has `resolve.conditions:['browser']`.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/lib/jsonText.ts` | **New, pure.** `formatNode`, `validateJson`, `autoFix`. |
| `src/lib/components/TextEditorView.svelte` | **New.** Raw-JSON editor for the active node. |
| `src/lib/components/DetailPane.svelte` | **Modify.** Form\|Text tab bar + branch. |
| `src/lib/stores.ts` | **Modify.** `editorTab` + `setEditorTab`. |
| `package.json` | **Modify.** add `json5`. |
| `tests/*` | jsonText, TextEditorView, DetailPane (tab). |

---

## Task 1: `jsonText.ts` — validate / auto-fix / format

**Files:**
- Create: `src/lib/jsonText.ts`
- Test: `tests/jsonText.test.ts`
- Modify: `package.json` (add `json5`)

**Interfaces:**
- Consumes: `JsonValue` from `jsonModel`; `json5`.
- Produces:
  - `type ParseResult = { ok: true; value: JsonValue } | { ok: false; error: string; line?: number; col?: number }`
  - `formatNode(value: JsonValue): string`
  - `validateJson(text: string): ParseResult`
  - `autoFix(text: string): ParseResult`

- [ ] **Step 1: Install json5**

Run: `npm install json5@^2.2.3`
Expected: added to `dependencies`.

- [ ] **Step 2: Write the failing test**

`tests/jsonText.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { formatNode, validateJson, autoFix } from '../src/lib/jsonText';

describe('formatNode', () => {
  it('pretty-prints with 2 spaces', () => {
    expect(formatNode({ a: 1 })).toBe('{\n  "a": 1\n}');
  });
});

describe('validateJson', () => {
  it('parses valid JSON', () => {
    const r = validateJson('{"a": 1}');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ a: 1 });
  });
  it('reports an error for invalid JSON', () => {
    const r = validateJson('{"a":}');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(typeof r.error).toBe('string');
  });
});

describe('autoFix', () => {
  it('fixes trailing commas', () => {
    const r = autoFix('{"a": 1,}');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ a: 1 });
  });
  it('fixes single quotes and unquoted keys', () => {
    const r = autoFix("{a: 'x'}");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ a: 'x' });
  });
  it('fixes // comments', () => {
    const r = autoFix('{\n  "a": 1 // note\n}');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ a: 1 });
  });
  it('fails on truly broken input', () => {
    const r = autoFix('{a: ');
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/jsonText.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `src/lib/jsonText.ts`**

```ts
import JSON5 from 'json5';
import type { JsonValue } from './jsonModel';

export type ParseResult =
  | { ok: true; value: JsonValue }
  | { ok: false; error: string; line?: number; col?: number };

export function formatNode(value: JsonValue): string {
  return JSON.stringify(value, null, 2);
}

function lineColFromPosition(text: string, pos: number): { line: number; col: number } {
  const upto = text.slice(0, Math.max(0, pos));
  const line = upto.split('\n').length;
  const col = pos - upto.lastIndexOf('\n');
  return { line, col };
}

export function validateJson(text: string): ParseResult {
  try {
    return { ok: true, value: JSON.parse(text) as JsonValue };
  } catch (e) {
    const error = (e as Error).message;
    const m = /position (\d+)/.exec(error);
    if (m) {
      const { line, col } = lineColFromPosition(text, Number(m[1]));
      return { ok: false, error, line, col };
    }
    return { ok: false, error };
  }
}

export function autoFix(text: string): ParseResult {
  try {
    return { ok: true, value: JSON5.parse(text) as JsonValue };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/jsonText.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/jsonText.ts tests/jsonText.test.ts package.json package-lock.json
git commit -m "feat: jsonText validate/autofix/format helpers (+ json5)"
```

---

## Task 2: `TextEditorView.svelte` — raw JSON editor for the active node

**Files:**
- Create: `src/lib/components/TextEditorView.svelte`
- Test: `tests/TextEditorView.test.ts`

**Interfaces:**
- Consumes: `getAtPath`, `JsonValue` from `jsonModel`; `data`, `selectedPath`, `editValue` from `stores`; `pathExists` from `pathUtils`; `formatNode`, `validateJson`, `autoFix` from `jsonText`.
- Behavior: loads `formatNode(node)` into a local `draft`, reloads on `selectedPath`/`data` change; live status; Apply (commit valid), Revert (reload), Auto-fix (JSON5 → reformat draft).

- [ ] **Step 1: Write the failing test**

`tests/TextEditorView.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/svelte';
import { get } from 'svelte/store';
import TextEditorView from '../src/lib/components/TextEditorView.svelte';
import { data, loadDocument, select } from '../src/lib/stores';

beforeEach(() => { loadDocument({ obj: { a: 1 } }, null); select(['obj']); });

describe('TextEditorView', () => {
  it('loads the active node as JSON', () => {
    render(TextEditorView);
    const ta = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(ta.value).toContain('"a": 1');
  });
  it('disables Apply and shows an error for invalid JSON', async () => {
    render(TextEditorView);
    const ta = screen.getByRole('textbox') as HTMLTextAreaElement;
    await fireEvent.input(ta, { target: { value: '{"a":}' } });
    expect((screen.getByRole('button', { name: /apply/i }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/error/i)).toBeInTheDocument();
  });
  it('auto-fixes lenient input into valid JSON', async () => {
    render(TextEditorView);
    const ta = screen.getByRole('textbox') as HTMLTextAreaElement;
    await fireEvent.input(ta, { target: { value: '{a: 1,}' } });
    await fireEvent.click(screen.getByRole('button', { name: /auto-fix/i }));
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toContain('"a": 1');
    expect((screen.getByRole('button', { name: /apply/i }) as HTMLButtonElement).disabled).toBe(false);
  });
  it('Apply commits the parsed value to the node', async () => {
    render(TextEditorView);
    const ta = screen.getByRole('textbox') as HTMLTextAreaElement;
    await fireEvent.input(ta, { target: { value: '{"a": 2}' } });
    await fireEvent.click(screen.getByRole('button', { name: /apply/i }));
    expect((get(data) as any).obj).toEqual({ a: 2 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/TextEditorView.test.ts`
Expected: FAIL — component not found.

- [ ] **Step 3: Implement `src/lib/components/TextEditorView.svelte`**

```svelte
<script lang="ts">
  import { getAtPath, type JsonValue } from '../jsonModel';
  import { data, selectedPath, editValue } from '../stores';
  import { pathExists } from '../pathUtils';
  import { formatNode, validateJson, autoFix } from '../jsonText';

  let draft = $state('');
  let fixError = $state('');

  // (Re)load the draft from the active node when the selection or data changes.
  $effect(() => {
    const p = $selectedPath;
    const d = $data;
    draft = d !== null && pathExists(d, p) ? formatNode(getAtPath(d, p)) : '';
    fixError = '';
  });

  const result = $derived(validateJson(draft));

  function apply() {
    const r = validateJson(draft);
    if (r.ok) editValue($selectedPath, r.value);
  }
  function revert() {
    if ($data !== null && pathExists($data, $selectedPath)) {
      draft = formatNode(getAtPath($data, $selectedPath) as JsonValue);
    }
    fixError = '';
  }
  function fix() {
    const r = autoFix(draft);
    if (r.ok) { draft = formatNode(r.value); fixError = ''; }
    else { fixError = r.error; }
  }
</script>

<div class="text-editor">
  <div class="bar">
    <button class="apply" disabled={!result.ok} onclick={apply}>Apply</button>
    <button onclick={revert}>Revert</button>
    <button disabled={result.ok} onclick={fix}>Auto-fix</button>
    <span class="status">
      {#if result.ok}
        <span class="ok">Valid JSON</span>
      {:else}
        <span class="err">Error: {result.error}{#if result.line} (line {result.line}, col {result.col}){/if}</span>
      {/if}
      {#if fixError}<span class="err"> · Cannot auto-fix: {fixError}</span>{/if}
    </span>
  </div>
  <textarea bind:value={draft} spellcheck="false"></textarea>
</div>

<style>
  .text-editor { display:flex; flex-direction:column; gap:8px; height:100%; min-height:0; }
  .bar { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
  .bar button { border:1px solid var(--border); background:var(--surface); color:var(--text);
    border-radius:8px; padding:4px 12px; }
  .bar button:hover:not(:disabled) { border-color:var(--accent); color:var(--accent); }
  .bar button:disabled { opacity:.45; cursor:default; }
  .bar .apply:not(:disabled) { background:var(--accent); border-color:var(--accent); color:#fff; }
  .status { font-size:12px; }
  .ok { color:#2e7d32; }
  .err { color:#c0392b; }
  textarea { flex:1; min-height:200px; width:100%; resize:none; font-family:ui-monospace, monospace;
    font-size:13px; line-height:1.5; color:var(--text); background:var(--surface);
    border:1px solid var(--border); border-radius:8px; padding:10px 12px; }
  textarea:focus { outline:2px solid var(--accent-weak); border-color:var(--accent); }
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/TextEditorView.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/TextEditorView.svelte tests/TextEditorView.test.ts
git commit -m "feat: TextEditorView raw JSON editor for the active node"
```

---

## Task 3: `editorTab` store + `DetailPane` Form|Text tabs

**Files:**
- Modify: `src/lib/stores.ts`
- Modify: `src/lib/components/DetailPane.svelte`
- Test: `tests/DetailPane.test.ts` (add cases)

**Interfaces:**
- Consumes: `editorTab`, `setEditorTab` from `stores`; `TextEditorView`.
- Produces (stores): `editorTab: Writable<'form' | 'text'>`, `setEditorTab(t: 'form' | 'text'): void`.

- [ ] **Step 1: Add the store to `src/lib/stores.ts`**

Add near `twoLevel`:
```ts
export const editorTab = writable<'form' | 'text'>('form');
```
Add near `setTwoLevel`:
```ts
export function setEditorTab(t: 'form' | 'text'): void { editorTab.set(t); }
```

- [ ] **Step 2: Write the failing test** (append to `tests/DetailPane.test.ts`, and add `setEditorTab` to the stores import)

```ts
describe('DetailPane — text tab', () => {
  it('renders the raw text editor on the Text tab', async () => {
    loadDocument({ a: 1, b: 2 }, null);
    select([]);
    setTwoLevel(false);
    render(DetailPane);
    await fireEvent.click(screen.getByRole('button', { name: 'Text' }));
    const ta = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(ta.value).toContain('"a": 1');
    setEditorTab('form');
  });
});
```
Also update the existing `beforeEach` in `tests/DetailPane.test.ts` to reset the tab:
```ts
beforeEach(() => { loadDocument({ words: ['cat'], meta: { v: 1 } }, null); setTwoLevel(false); setEditorTab('form'); });
```
And the import line becomes:
```ts
import { render, fireEvent, screen } from '@testing-library/svelte';
import { loadDocument, select, setTwoLevel, setEditorTab } from '../src/lib/stores';
```
(add `fireEvent` if not already imported).

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/DetailPane.test.ts`
Expected: FAIL — no "Text" tab / `setEditorTab` missing.

- [ ] **Step 4: Modify `src/lib/components/DetailPane.svelte`**

Add imports:
```ts
  import { data, selectedPath, twoLevel, editorTab, setEditorTab } from '../stores';
  import TextEditorView from './TextEditorView.svelte';
```
(replace the existing `import { data, selectedPath, twoLevel } from '../stores';` line.)
Replace the `.detail` block body:
```svelte
  <div class="detail">
    <Breadcrumb path={$selectedPath} />
    <div class="tabs">
      <button class="tab" class:active={$editorTab === 'form'} onclick={() => setEditorTab('form')}>Form</button>
      <button class="tab" class:active={$editorTab === 'text'} onclick={() => setEditorTab('text')}>Text</button>
    </div>
    <div class="content">
      {#if $editorTab === 'text'}
        <TextEditorView />
      {:else if useTwoLevel}
        <TwoLevelView value={node as Record<string, JsonValue>} path={$selectedPath} />
      {:else if useParentTwoLevel}
        <ParentTwoLevelView
          parent={parentNode as Record<string, JsonValue>}
          parentPath={parentPath}
          activeKey={activeKey} />
      {:else}
        <NodeView value={node as JsonValue} path={$selectedPath} />
      {/if}
    </div>
  </div>
```
Add styles (inside the existing `<style>`):
```css
  .tabs { display:flex; gap:4px; border-bottom:1px solid var(--border); }
  .tab { border:none; background:transparent; color:var(--text-muted); padding:6px 12px;
    border-bottom:2px solid transparent; margin-bottom:-1px; }
  .tab:hover { color:var(--accent); }
  .tab.active { color:var(--accent); border-bottom-color:var(--accent); font-weight:600; }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/DetailPane.test.ts`
Expected: PASS (existing + new).

- [ ] **Step 6: Commit**

```bash
git add src/lib/stores.ts src/lib/components/DetailPane.svelte tests/DetailPane.test.ts
git commit -m "feat: Form|Text tabs in DetailPane wired to editorTab"
```

---

## Task 4: Full verification + rebuild

**Files:** none.

- [ ] **Step 1: Full suite**

Run: `npx vitest run`
Expected: all suites PASS (new: jsonText, TextEditorView, extended DetailPane).

- [ ] **Step 2: Build + typecheck**

Run: `npm run build` → succeeds.
Run: `npm run check` → 0 errors.

- [ ] **Step 3: Rebuild the desktop app**

```bash
powershell -Command "Get-Process app -ErrorAction SilentlyContinue | Stop-Process -Force"
CARGO_HOME=D:\dev-cache\.cargo npm run tauri build
```
Expected: fresh `app.exe` + NSIS installer.

- [ ] **Step 4: Manual acceptance**

Launch, open `reading-folders-data.json`. Select a `folder` → **Text** tab shows its JSON. Break it (`{"a":}`) → error + Apply disabled. Type `{a:1,}` → **Auto-fix** → normalized → **Apply** → Form tab + tree reflect the change; **Ctrl+Z** undoes. Select **root** → Text shows whole doc → edit → Apply → **Ctrl+S** saves. Confirm file stays valid.

- [ ] **Step 5: Commit any final fixes**

```bash
git add -A
git commit -m "chore: pure text edit mode verified + app rebuilt"
```

---

## Self-Review

**Spec coverage:**
- §2 Form/Text tabs: Task 3. ✓
- §2 Apply/Revert (explicit commit): Task 2. ✓
- §2 strict validation + live status + line/col: Task 1 (`validateJson`) + Task 2 (status). ✓
- §2 Auto-fix (JSON5, explicit, review-before-apply): Task 1 (`autoFix`) + Task 2 (fix()). ✓
- §2 scope = active node / root = whole doc: Task 2 uses `selectedPath` + `editValue` (root path `[]` handled by `updateAtPath`). ✓
- §2 draft discarded on node/tab change: Task 2 `$effect` reload + tab unmount. ✓
- §3 components/state (jsonText, TextEditorView, editorTab, DetailPane, json5): Tasks 1–3. ✓
- §5 error handling (invalid → Apply off; auto-fix fail message; empty invalid): Task 2. ✓
- §6 visual (tabs, monospace, status colors): Tasks 2–3 styles. ✓
- §7 testing: each task has tests; Task 4 full suite + build + manual. ✓
- §8 repo structure: matches. ✓

**Placeholder scan:** none — every code step complete; commands have expected output. ✓

**Type consistency:** `ParseResult`/`formatNode`/`validateJson`/`autoFix` (Task 1) consumed identically in Task 2. `editorTab: Writable<'form'|'text'>` / `setEditorTab` (Task 3 store) consumed in DetailPane (Task 3). `editValue(path, value)`, `getAtPath`, `pathExists`, `selectedPath`, `data` reused with existing signatures. ✓
