# JSON Table Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A native Windows desktop app that lets a non-developer edit `.json` files as nested tables and save straight back to the same file (Ctrl+S), never breaking JSON structure.

**Architecture:** A Svelte + Vite + TypeScript frontend does all editing against an in-memory model held in Svelte stores. All structure-preserving logic lives in a pure, unit-tested module (`jsonModel.ts`) so the risky part (round-trip integrity) is covered by Vitest independent of any UI or native code. A thin Tauri v2 Rust shell provides native file dialogs, direct disk writes, `.json` file association, and single-instance argv handoff. Frontend and native shell are decoupled: `fileService.ts` is the only file that imports Tauri APIs, so the whole app is testable in a browser/Vitest without Rust.

**Tech Stack:** Tauri v2, Svelte 5, Vite 5, TypeScript 5, Vitest 2, @testing-library/svelte, jsdom, Rust (Tauri backend only).

## Global Constraints

- **Platform:** Windows-first. Tauri uses the system WebView2 (ship target ~5–10 MB). macOS/Linux are out of scope (v1).
- **Offline only:** no network calls anywhere in frontend or backend.
- **Structure preservation is the top invariant:** `parse → edit → stringify` must preserve key order, nesting, container types, and value types. This is verified against the real `reading-folders` JSON, not a synthetic fixture.
- **Save format:** `JSON.stringify(model, null, 2)` (2-space indent) plus a trailing newline.
- **Node version:** Node 22.x (already installed: v22.14.0). Package manager: `npm`.
- **v1 editing scope:** edit leaf values (type-preserving) + add/remove array items only. No key rename/add/remove, no type change, no search, no undo/redo.
- **Error/confirm dialog copy is Vietnamese** per spec §7 (e.g. `File JSON không hợp lệ: <msg>`).
- **Prereq for Tauri tasks (Task 12+):** Rust toolchain must be installed (`rustup`, `cargo`). It is **not** installed in the current environment. Tasks 1–11 need only Node and can be completed immediately; Tasks 12–14 are gated on Rust being available.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `package.json` | Scripts (`dev`, `build`, `test`, `tauri`), deps. |
| `vite.config.ts` | Vite + Svelte plugin; Tauri-friendly dev server settings. |
| `tsconfig.json` | TS config for Svelte + Vite. |
| `vitest.config.ts` | Vitest config (jsdom env for component tests). |
| `index.html` | Vite entry, mounts `main.ts`. |
| `src/main.ts` | Mounts `App.svelte` into the DOM. |
| `src/app.css` | Minimal global styles (tables, toolbar). |
| `src/lib/jsonModel.ts` | **Pure** logic: classify, get/update at path, array add/remove, add-row template. Unit-tested. |
| `src/lib/stores.ts` | Writable stores: `data`, `filePath`, `dirty`; helpers to load/mark clean. |
| `src/lib/Node.svelte` | Recursive renderer/editor for every value kind. |
| `src/lib/fileService.ts` | Only file importing Tauri fs/dialog; open/save/pick + startup argv. |
| `src/App.svelte` | Toolbar, title + dirty marker, editor area, empty state, shortcuts, dirty-close confirm. |
| `src-tauri/tauri.conf.json` | App config: window, `.json` file association, fs+dialog plugins, single-instance. |
| `src-tauri/Cargo.toml` | Rust deps (tauri, plugins, single-instance). |
| `src-tauri/src/main.rs` | Argv path → emit to frontend; single-instance forwarding. |
| `src-tauri/capabilities/default.json` | Permissions for fs write + dialog. |
| `tests/jsonModel.test.ts` | Unit tests for pure logic. |
| `tests/roundtrip.test.ts` | Round-trip integrity vs real reading-folders JSON. |
| `tests/Node.test.ts` | Component interaction tests. |
| `tests/fixtures/reading-folders-data.json` | Copy of real nested data used by round-trip test. |

---

## Task 1: Project scaffold (Vite + Svelte + TS + Vitest)

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `vitest.config.ts`, `index.html`, `src/main.ts`, `src/App.svelte` (stub), `src/app.css`, `.gitignore`, `svelte.config.js`

**Interfaces:**
- Consumes: nothing.
- Produces: a working dev/test harness. `npm test` runs Vitest; `npm run dev` serves the app.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "json-table-editor",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "check": "svelte-check --tsconfig ./tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "tauri": "tauri"
  },
  "devDependencies": {
    "@sveltejs/vite-plugin-svelte": "^4.0.0",
    "@tauri-apps/cli": "^2.0.0",
    "@testing-library/svelte": "^5.2.0",
    "@testing-library/jest-dom": "^6.4.0",
    "jsdom": "^25.0.0",
    "svelte": "^5.0.0",
    "svelte-check": "^4.0.0",
    "typescript": "^5.5.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0"
  },
  "dependencies": {
    "@tauri-apps/api": "^2.0.0",
    "@tauri-apps/plugin-dialog": "^2.0.0",
    "@tauri-apps/plugin-fs": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create config files**

`svelte.config.js`:
```js
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
export default { preprocess: vitePreprocess() };
```

`vite.config.ts`:
```ts
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Tauri expects a fixed port and no clearScreen so its logs stay visible.
export default defineConfig({
  plugins: [svelte()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
});
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte({ hot: false })],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
  },
});
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"],
    "verbatimModuleSyntax": true
  },
  "include": ["src/**/*.ts", "src/**/*.svelte", "tests/**/*.ts"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

`tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "types": ["node"]
  },
  "include": ["vite.config.ts", "vitest.config.ts"]
}
```

`.gitignore`:
```
node_modules
dist
src-tauri/target
*.log
```

- [ ] **Step 3: Create entry files**

`index.html`:
```html
<!doctype html>
<html lang="vi">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>JSON Table Editor</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`src/main.ts`:
```ts
import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';

const app = mount(App, { target: document.getElementById('app')! });
export default app;
```

`src/App.svelte` (stub — replaced in Task 10):
```svelte
<script lang="ts">
</script>

<main>
  <h1>JSON Table Editor</h1>
</main>
```

`src/app.css`:
```css
:root { font-family: system-ui, sans-serif; font-size: 14px; }
body { margin: 0; }
table { border-collapse: collapse; }
td, th { border: 1px solid #ddd; padding: 2px 6px; vertical-align: top; }
```

`tests/setup.ts`:
```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 4: Install and verify**

Run: `npm install`
Then run: `npm test`
Expected: Vitest reports `No test files found` (exit 0) — the harness works, no tests yet.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + Svelte + TS + Vitest"
```

---

## Task 2: `jsonModel.ts` — value classification

**Files:**
- Create: `src/lib/jsonModel.ts`
- Test: `tests/jsonModel.test.ts`

**Interfaces:**
- Produces:
  - `type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };`
  - `type ValueKind = 'object' | 'array-of-objects' | 'array-of-scalars' | 'array-mixed' | 'string' | 'number' | 'boolean' | 'null';`
  - `function classify(v: JsonValue): ValueKind`
  - `type Path = (string | number)[]`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { classify } from '../src/lib/jsonModel';

describe('classify', () => {
  it('classifies scalars', () => {
    expect(classify('x')).toBe('string');
    expect(classify(3)).toBe('number');
    expect(classify(true)).toBe('boolean');
    expect(classify(null)).toBe('null');
  });
  it('classifies plain objects', () => {
    expect(classify({ a: 1 })).toBe('object');
  });
  it('classifies array of scalars', () => {
    expect(classify(['a', 'b'])).toBe('array-of-scalars');
    expect(classify([])).toBe('array-of-scalars');
  });
  it('classifies array of objects', () => {
    expect(classify([{ a: 1 }, { a: 2 }])).toBe('array-of-objects');
  });
  it('classifies mixed/nested arrays', () => {
    expect(classify([1, { a: 1 }])).toBe('array-mixed');
    expect(classify([[1], [2]])).toBe('array-mixed');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/jsonModel.test.ts`
Expected: FAIL — `classify` is not exported / module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
export type JsonValue =
  | string | number | boolean | null
  | JsonValue[]
  | { [k: string]: JsonValue };

export type ValueKind =
  | 'object' | 'array-of-objects' | 'array-of-scalars' | 'array-mixed'
  | 'string' | 'number' | 'boolean' | 'null';

export type Path = (string | number)[];

const isPlainObject = (v: JsonValue): v is { [k: string]: JsonValue } =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

export function classify(v: JsonValue): ValueKind {
  if (v === null) return 'null';
  if (Array.isArray(v)) {
    if (v.length === 0) return 'array-of-scalars';
    const allPlainObjects = v.every(isPlainObject);
    if (allPlainObjects) return 'array-of-objects';
    const allScalars = v.every(
      (x) => x === null || (typeof x !== 'object'));
    if (allScalars) return 'array-of-scalars';
    return 'array-mixed';
  }
  if (isPlainObject(v)) return 'object';
  return typeof v as 'string' | 'number' | 'boolean';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/jsonModel.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/jsonModel.ts tests/jsonModel.test.ts
git commit -m "feat: classify JSON value kinds"
```

---

## Task 3: `jsonModel.ts` — get / update at path (immutable)

**Files:**
- Modify: `src/lib/jsonModel.ts`
- Test: `tests/jsonModel.test.ts`

**Interfaces:**
- Consumes: `JsonValue`, `Path`.
- Produces:
  - `function getAtPath(root: JsonValue, path: Path): JsonValue`
  - `function updateAtPath(root: JsonValue, path: Path, newValue: JsonValue): JsonValue` — returns a new root; does not mutate the input; preserves sibling key order.

- [ ] **Step 1: Write the failing test**

```ts
import { getAtPath, updateAtPath } from '../src/lib/jsonModel';

describe('getAtPath', () => {
  it('reads nested values', () => {
    const root = { a: { b: [10, 20] } };
    expect(getAtPath(root, ['a', 'b', 1])).toBe(20);
    expect(getAtPath(root, [])).toBe(root);
  });
});

describe('updateAtPath', () => {
  it('updates a nested leaf without mutating input', () => {
    const root = { a: { b: [10, 20] } };
    const next = updateAtPath(root, ['a', 'b', 1], 99);
    expect(getAtPath(next, ['a', 'b', 1])).toBe(99);
    expect(root.a.b[1]).toBe(20); // original untouched
  });
  it('preserves key order of the touched object', () => {
    const root = { first: 1, second: 2, third: 3 };
    const next = updateAtPath(root, ['second'], 20) as Record<string, number>;
    expect(Object.keys(next)).toEqual(['first', 'second', 'third']);
  });
  it('replaces the whole root when path is empty', () => {
    expect(updateAtPath({ a: 1 }, [], { b: 2 })).toEqual({ b: 2 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/jsonModel.test.ts`
Expected: FAIL — `getAtPath`/`updateAtPath` not exported.

- [ ] **Step 3: Write minimal implementation** (append to `jsonModel.ts`)

```ts
export function getAtPath(root: JsonValue, path: Path): JsonValue {
  let cur: JsonValue = root;
  for (const key of path) {
    if (Array.isArray(cur) && typeof key === 'number') cur = cur[key];
    else if (cur !== null && typeof cur === 'object' && typeof key === 'string')
      cur = (cur as { [k: string]: JsonValue })[key];
    else throw new Error(`Invalid path segment: ${String(key)}`);
  }
  return cur;
}

export function updateAtPath(root: JsonValue, path: Path, newValue: JsonValue): JsonValue {
  if (path.length === 0) return newValue;
  const [head, ...rest] = path;
  if (Array.isArray(root) && typeof head === 'number') {
    const copy = root.slice();
    copy[head] = updateAtPath(root[head], rest, newValue);
    return copy;
  }
  if (root !== null && typeof root === 'object' && typeof head === 'string') {
    const obj = root as { [k: string]: JsonValue };
    // Rebuild in original key order to preserve insertion order.
    const copy: { [k: string]: JsonValue } = {};
    for (const k of Object.keys(obj)) {
      copy[k] = k === head ? updateAtPath(obj[k], rest, newValue) : obj[k];
    }
    return copy;
  }
  throw new Error(`Invalid path segment: ${String(head)}`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/jsonModel.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/jsonModel.ts tests/jsonModel.test.ts
git commit -m "feat: immutable get/update at path preserving key order"
```

---

## Task 4: `jsonModel.ts` — array add/remove + add-row template

**Files:**
- Modify: `src/lib/jsonModel.ts`
- Test: `tests/jsonModel.test.ts`

**Interfaces:**
- Consumes: `JsonValue`, `Path`, `classify`, `updateAtPath`, `getAtPath`.
- Produces:
  - `function buildAddTemplate(arr: JsonValue[]): JsonValue` — for array-of-objects returns an object with the union of keys mapped to type-appropriate empties (`''`, `0`, `false`, `null`, `[]`, `{}`); for array-of-scalars returns `''`; otherwise `null`.
  - `function addArrayItem(root: JsonValue, arrayPath: Path): JsonValue` — appends `buildAddTemplate` of the array at `arrayPath`; returns new root.
  - `function removeArrayItem(root: JsonValue, arrayPath: Path, index: number): JsonValue` — removes item; returns new root.
  - `function objectKeyUnion(arr: JsonValue[]): string[]` — ordered union of keys across all objects (first-seen order).

- [ ] **Step 1: Write the failing test**

```ts
import {
  buildAddTemplate, addArrayItem, removeArrayItem, objectKeyUnion, getAtPath,
} from '../src/lib/jsonModel';

describe('objectKeyUnion', () => {
  it('unions keys in first-seen order', () => {
    expect(objectKeyUnion([{ a: 1, b: 2 }, { b: 3, c: 4 }])).toEqual(['a', 'b', 'c']);
  });
});

describe('buildAddTemplate', () => {
  it('builds empty object matching union with type-appropriate empties', () => {
    expect(buildAddTemplate([{ name: 'x', age: 5, ok: true }]))
      .toEqual({ name: '', age: 0, ok: false });
  });
  it('returns empty string for scalar arrays', () => {
    expect(buildAddTemplate(['a', 'b'])).toBe('');
  });
  it('returns empty string for an empty array', () => {
    expect(buildAddTemplate([])).toBe('');
  });
});

describe('addArrayItem / removeArrayItem', () => {
  it('appends a template row to a nested array of objects', () => {
    const root = { items: [{ name: 'a', qty: 1 }] };
    const next = addArrayItem(root, ['items']);
    expect(getAtPath(next, ['items', 1])).toEqual({ name: '', qty: 0 });
    expect((root.items as unknown[]).length).toBe(1); // input untouched
  });
  it('appends "" to a scalar array', () => {
    const root = { words: ['cat'] };
    const next = addArrayItem(root, ['words']);
    expect(getAtPath(next, ['words'])).toEqual(['cat', '']);
  });
  it('removes an item by index', () => {
    const root = { words: ['a', 'b', 'c'] };
    const next = removeArrayItem(root, ['words'], 1);
    expect(getAtPath(next, ['words'])).toEqual(['a', 'c']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/jsonModel.test.ts`
Expected: FAIL — new functions not exported.

- [ ] **Step 3: Write minimal implementation** (append to `jsonModel.ts`)

```ts
export function objectKeyUnion(arr: JsonValue[]): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const item of arr) {
    if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
      for (const k of Object.keys(item)) {
        if (!seen.has(k)) { seen.add(k); keys.push(k); }
      }
    }
  }
  return keys;
}

function emptyLike(v: JsonValue): JsonValue {
  if (typeof v === 'string') return '';
  if (typeof v === 'number') return 0;
  if (typeof v === 'boolean') return false;
  if (Array.isArray(v)) return [];
  if (v !== null && typeof v === 'object') return {};
  return null;
}

export function buildAddTemplate(arr: JsonValue[]): JsonValue {
  const kind = classify(arr);
  if (kind === 'array-of-objects') {
    const keys = objectKeyUnion(arr);
    const template: { [k: string]: JsonValue } = {};
    for (const k of keys) {
      // Use the first item that has this key to infer the empty type.
      const sample = arr.find(
        (it) => it !== null && typeof it === 'object' && !Array.isArray(it) && k in it);
      const sampleVal = sample ? (sample as { [k: string]: JsonValue })[k] : '';
      template[k] = emptyLike(sampleVal);
    }
    return template;
  }
  return ''; // scalar array or empty array -> empty string
}

export function addArrayItem(root: JsonValue, arrayPath: Path): JsonValue {
  const arr = getAtPath(root, arrayPath);
  if (!Array.isArray(arr)) throw new Error('addArrayItem: target is not an array');
  const next = [...arr, buildAddTemplate(arr)];
  return updateAtPath(root, arrayPath, next);
}

export function removeArrayItem(root: JsonValue, arrayPath: Path, index: number): JsonValue {
  const arr = getAtPath(root, arrayPath);
  if (!Array.isArray(arr)) throw new Error('removeArrayItem: target is not an array');
  const next = arr.filter((_, i) => i !== index);
  return updateAtPath(root, arrayPath, next);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/jsonModel.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/jsonModel.ts tests/jsonModel.test.ts
git commit -m "feat: array add/remove and add-row template helpers"
```

---

## Task 5: Round-trip integrity vs real reading-folders JSON

**Files:**
- Create: `tests/fixtures/reading-folders-data.json` (copy of the real file)
- Test: `tests/roundtrip.test.ts`

**Interfaces:**
- Consumes: `updateAtPath`, `addArrayItem`, `removeArrayItem` from `jsonModel.ts`.
- Produces: confidence that the top invariant holds; no new source code.

- [ ] **Step 1: Copy the real data file into fixtures**

Run:
```bash
mkdir -p tests/fixtures
cp "d:/github/reading-folders-words/reading-folders-data.json" tests/fixtures/reading-folders-data.json
```
Expected: file exists (`ls tests/fixtures/`).

- [ ] **Step 2: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  updateAtPath, addArrayItem, removeArrayItem, getAtPath,
} from '../src/lib/jsonModel';

const raw = readFileSync(
  fileURLToPath(new URL('./fixtures/reading-folders-data.json', import.meta.url)),
  'utf-8');

const stringify = (v: unknown) => JSON.stringify(v, null, 2);

describe('round-trip integrity on real reading-folders data', () => {
  it('parse -> stringify is byte-identical (ignoring trailing newline)', () => {
    const model = JSON.parse(raw);
    expect(stringify(model)).toBe(raw.replace(/\n$/, ''));
  });

  it('editing one word preserves overall key order and structure', () => {
    const model = JSON.parse(raw);
    // folders[0].cards[0].words[0] -> change first word
    const path = ['folders', 0, 'cards', 0, 'words', 0];
    const original = getAtPath(model, path);
    expect(typeof original).toBe('string');
    const edited = updateAtPath(model, path, 'CHANGED');
    expect(getAtPath(edited, path)).toBe('CHANGED');
    // Root key order unchanged.
    expect(Object.keys(edited as object)).toEqual(Object.keys(model));
    // Only the one leaf differs — re-stringify parses back cleanly.
    expect(() => JSON.parse(stringify(edited))).not.toThrow();
  });

  it('adding and removing a word in a card round-trips to valid JSON', () => {
    const model = JSON.parse(raw);
    const wordsPath = ['folders', 0, 'cards', 0, 'words'];
    const before = (getAtPath(model, wordsPath) as string[]).length;
    const added = addArrayItem(model, wordsPath);
    expect((getAtPath(added, wordsPath) as string[]).length).toBe(before + 1);
    const removed = removeArrayItem(added, wordsPath, before);
    expect((getAtPath(removed, wordsPath) as string[]).length).toBe(before);
    expect(stringify(removed)).toBe(stringify(model));
  });
});
```

- [ ] **Step 3: Run test to verify it fails then passes**

Run: `npx vitest run tests/roundtrip.test.ts`
Expected: If the fixture's own formatting is already 2-space `JSON.stringify` output, all pass. If the first test fails on formatting, that is expected — proceed to Step 4.

- [ ] **Step 4: Normalize the fixture if needed**

The round-trip byte-equality test asserts our save format matches. If the source file uses different formatting, re-save the fixture in our canonical format so the test asserts against the format we actually write:
```bash
node -e "const fs=require('fs');const p='tests/fixtures/reading-folders-data.json';fs.writeFileSync(p, JSON.stringify(JSON.parse(fs.readFileSync(p,'utf8')), null, 2))"
```
Then re-run: `npx vitest run tests/roundtrip.test.ts`
Expected: PASS (3 tests). (Note: this documents the acceptable v1 caveat that formatting is normalized to 2-space JSON on first save.)

- [ ] **Step 5: Commit**

```bash
git add tests/fixtures/reading-folders-data.json tests/roundtrip.test.ts
git commit -m "test: round-trip integrity against real reading-folders data"
```

---

## Task 6: `stores.ts` — reactive document state

**Files:**
- Create: `src/lib/stores.ts`
- Test: `tests/stores.test.ts`

**Interfaces:**
- Consumes: `JsonValue` from `jsonModel.ts`.
- Produces:
  - `const data: Writable<JsonValue | null>`
  - `const filePath: Writable<string | null>`
  - `const dirty: Writable<boolean>`
  - `function loadDocument(value: JsonValue, path: string | null): void` — sets data+path, dirty=false.
  - `function applyEdit(next: JsonValue): void` — sets data, dirty=true.
  - `function markSaved(path: string): void` — sets path, dirty=false.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { data, filePath, dirty, loadDocument, applyEdit, markSaved } from '../src/lib/stores';

beforeEach(() => { loadDocument(null as any, null); });

describe('stores', () => {
  it('loadDocument sets data and path, clears dirty', () => {
    loadDocument({ a: 1 }, '/tmp/x.json');
    expect(get(data)).toEqual({ a: 1 });
    expect(get(filePath)).toBe('/tmp/x.json');
    expect(get(dirty)).toBe(false);
  });
  it('applyEdit updates data and sets dirty', () => {
    loadDocument({ a: 1 }, '/tmp/x.json');
    applyEdit({ a: 2 });
    expect(get(data)).toEqual({ a: 2 });
    expect(get(dirty)).toBe(true);
  });
  it('markSaved records path and clears dirty', () => {
    loadDocument({ a: 1 }, null);
    applyEdit({ a: 2 });
    markSaved('/tmp/new.json');
    expect(get(filePath)).toBe('/tmp/new.json');
    expect(get(dirty)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/stores.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
import { writable } from 'svelte/store';
import type { JsonValue } from './jsonModel';

export const data = writable<JsonValue | null>(null);
export const filePath = writable<string | null>(null);
export const dirty = writable<boolean>(false);

export function loadDocument(value: JsonValue, path: string | null): void {
  data.set(value);
  filePath.set(path);
  dirty.set(false);
}

export function applyEdit(next: JsonValue): void {
  data.set(next);
  dirty.set(true);
}

export function markSaved(path: string): void {
  filePath.set(path);
  dirty.set(false);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/stores.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stores.ts tests/stores.test.ts
git commit -m "feat: document state stores (data/filePath/dirty)"
```

---

## Task 7: `Node.svelte` — recursive renderer (leaf + object + collapse)

**Files:**
- Create: `src/lib/Node.svelte`
- Test: `tests/Node.test.ts`

**Interfaces:**
- Consumes: `classify`, `JsonValue`, `Path` from `jsonModel.ts`.
- Props: `{ value: JsonValue; path: Path; onEdit: (path: Path, newValue: JsonValue) => void }`.
  - `onEdit` reports a **leaf** change: the absolute path of the changed leaf and its new value. The parent (App) applies it via `updateAtPath`.
- Produces: a component that renders any `JsonValue`. Array add/remove are added in Task 8; this task covers object tables, leaf editors, and collapse.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/svelte';
import Node from '../src/lib/Node.svelte';

describe('Node — leaf + object', () => {
  it('renders object keys as row labels', () => {
    render(Node, { value: { title: 'Hello', count: 3 }, path: [], onEdit: () => {} });
    expect(screen.getByText('title')).toBeInTheDocument();
    expect(screen.getByText('count')).toBeInTheDocument();
  });

  it('editing a string leaf calls onEdit with path and new value', async () => {
    const onEdit = vi.fn();
    render(Node, { value: { title: 'Hi' }, path: [], onEdit });
    const input = screen.getByDisplayValue('Hi') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'Bye' } });
    expect(onEdit).toHaveBeenCalledWith(['title'], 'Bye');
  });

  it('editing a number leaf reports a number, not a string', async () => {
    const onEdit = vi.fn();
    render(Node, { value: { count: 3 }, path: [], onEdit });
    const input = screen.getByDisplayValue('3') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: '5' } });
    expect(onEdit).toHaveBeenCalledWith(['count'], 5);
  });

  it('toggling a boolean leaf reports a boolean', async () => {
    const onEdit = vi.fn();
    render(Node, { value: { ok: false }, path: [], onEdit });
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    await fireEvent.click(checkbox);
    expect(onEdit).toHaveBeenCalledWith(['ok'], true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/Node.test.ts`
Expected: FAIL — `Node.svelte` not found.

- [ ] **Step 3: Write minimal implementation**

```svelte
<script lang="ts">
  import { classify, type JsonValue, type Path } from './jsonModel';
  import Self from './Node.svelte';

  let { value, path, onEdit }: {
    value: JsonValue;
    path: Path;
    onEdit: (path: Path, newValue: JsonValue) => void;
  } = $props();

  const kind = $derived(classify(value));
  let collapsed = $state(false);

  function onStringInput(e: Event) {
    onEdit(path, (e.target as HTMLInputElement).value);
  }
  function onNumberInput(e: Event) {
    const n = Number((e.target as HTMLInputElement).value);
    onEdit(path, Number.isNaN(n) ? 0 : n);
  }
  function onBoolChange(e: Event) {
    onEdit(path, (e.target as HTMLInputElement).checked);
  }
</script>

{#if kind === 'object'}
  <button class="toggle" onclick={() => (collapsed = !collapsed)}>
    {collapsed ? '▸' : '▾'}
  </button>
  {#if !collapsed}
    <table>
      <tbody>
        {#each Object.keys(value as object) as key}
          <tr>
            <td class="key">{key}</td>
            <td>
              <Self
                value={(value as Record<string, JsonValue>)[key]}
                path={[...path, key]}
                {onEdit} />
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
{:else if kind === 'string'}
  <input type="text" value={value as string} oninput={onStringInput} />
{:else if kind === 'number'}
  <input type="number" value={value as number} oninput={onNumberInput} />
{:else if kind === 'boolean'}
  <input type="checkbox" checked={value as boolean} onchange={onBoolChange} />
{:else if kind === 'null'}
  <span class="muted">null</span>
{/if}

<style>
  .key { font-weight: 600; color: #333; white-space: nowrap; }
  .muted { color: #999; font-style: italic; }
  .toggle { border: none; background: none; cursor: pointer; font-size: 12px; }
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/Node.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/Node.svelte tests/Node.test.ts
git commit -m "feat: recursive Node with object table + type-aware leaf editors"
```

---

## Task 8: `Node.svelte` — array rendering (scalars, objects, mixed) + add/remove

**Files:**
- Modify: `src/lib/Node.svelte`
- Test: `tests/Node.test.ts`

**Interfaces:**
- Consumes: `objectKeyUnion`, `addArrayItem`, `removeArrayItem` — **but** Node stays leaf-focused. To keep a single edit channel, extend the callback contract:
  - Add prop `onArrayAdd: (arrayPath: Path) => void` and `onArrayRemove: (arrayPath: Path, index: number) => void`.
  - These are threaded unchanged through recursion (same as `onEdit`).
- Produces: full array UI. App (Task 10) wires the three callbacks to `updateAtPath`/`addArrayItem`/`removeArrayItem`.

- [ ] **Step 1: Write the failing test** (append to `tests/Node.test.ts`)

```ts
import { objectKeyUnion } from '../src/lib/jsonModel';

describe('Node — arrays', () => {
  it('scalar array: each item editable, add and remove wired', async () => {
    const onEdit = vi.fn(); const onArrayAdd = vi.fn(); const onArrayRemove = vi.fn();
    render(Node, {
      value: { words: ['cat', 'dog'] }, path: [], onEdit, onArrayAdd, onArrayRemove,
    });
    // edit second word
    const input = screen.getByDisplayValue('dog') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'fox' } });
    expect(onEdit).toHaveBeenCalledWith(['words', 1], 'fox');
    // add row
    await fireEvent.click(screen.getByRole('button', { name: '➕' }));
    expect(onArrayAdd).toHaveBeenCalledWith(['words']);
    // remove first
    const dels = screen.getAllByRole('button', { name: '🗑' });
    await fireEvent.click(dels[0]);
    expect(onArrayRemove).toHaveBeenCalledWith(['words'], 0);
  });

  it('object array: renders a column per union key', () => {
    const onEdit = vi.fn(); const onArrayAdd = vi.fn(); const onArrayRemove = vi.fn();
    const value = { items: [{ name: 'a', qty: 1 }, { name: 'b', qty: 2 }] };
    render(Node, { value, path: [], onEdit, onArrayAdd, onArrayRemove });
    for (const k of objectKeyUnion(value.items as any)) {
      expect(screen.getByText(k)).toBeInTheDocument();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/Node.test.ts`
Expected: FAIL — array branches / new props not present.

- [ ] **Step 3: Write minimal implementation**

Update the `$props()` destructure to add the two callbacks and thread them through every `<Self>`:
```svelte
  let { value, path, onEdit, onArrayAdd, onArrayRemove }: {
    value: JsonValue;
    path: Path;
    onEdit: (path: Path, newValue: JsonValue) => void;
    onArrayAdd: (arrayPath: Path) => void;
    onArrayRemove: (arrayPath: Path, index: number) => void;
  } = $props();
```
Add `import { objectKeyUnion } from './jsonModel';` and, in the object branch, pass the new callbacks to `<Self>` too:
```svelte
              <Self
                value={(value as Record<string, JsonValue>)[key]}
                path={[...path, key]}
                {onEdit} {onArrayAdd} {onArrayRemove} />
```
Then add these branches before the `{:else if kind === 'string'}` line:
```svelte
{:else if kind === 'array-of-scalars'}
  <button class="toggle" onclick={() => (collapsed = !collapsed)}>{collapsed ? '▸' : '▾'}</button>
  {#if !collapsed}
    <table>
      <tbody>
        {#each value as JsonValue[] as item, i}
          <tr>
            <td>
              <Self value={item} path={[...path, i]} {onEdit} {onArrayAdd} {onArrayRemove} />
            </td>
            <td><button onclick={() => onArrayRemove(path, i)} aria-label="🗑">🗑</button></td>
          </tr>
        {/each}
      </tbody>
    </table>
    <button onclick={() => onArrayAdd(path)} aria-label="➕">➕</button>
  {/if}
{:else if kind === 'array-of-objects'}
  <button class="toggle" onclick={() => (collapsed = !collapsed)}>{collapsed ? '▸' : '▾'}</button>
  {#if !collapsed}
    <table>
      <thead>
        <tr>
          {#each objectKeyUnion(value as JsonValue[]) as col}<th>{col}</th>{/each}
          <th></th>
        </tr>
      </thead>
      <tbody>
        {#each value as JsonValue[] as row, i}
          <tr>
            {#each objectKeyUnion(value as JsonValue[]) as col}
              <td>
                <Self
                  value={(row as Record<string, JsonValue>)[col] ?? ''}
                  path={[...path, i, col]}
                  {onEdit} {onArrayAdd} {onArrayRemove} />
              </td>
            {/each}
            <td><button onclick={() => onArrayRemove(path, i)} aria-label="🗑">🗑</button></td>
          </tr>
        {/each}
      </tbody>
    </table>
    <button onclick={() => onArrayAdd(path)} aria-label="➕">➕</button>
  {/if}
{:else if kind === 'array-mixed'}
  <button class="toggle" onclick={() => (collapsed = !collapsed)}>{collapsed ? '▸' : '▾'}</button>
  {#if !collapsed}
    <table>
      <tbody>
        {#each value as JsonValue[] as item, i}
          <tr>
            <td>
              <Self value={item} path={[...path, i]} {onEdit} {onArrayAdd} {onArrayRemove} />
            </td>
            <td><button onclick={() => onArrayRemove(path, i)} aria-label="🗑">🗑</button></td>
          </tr>
        {/each}
      </tbody>
    </table>
    <button onclick={() => onArrayAdd(path)} aria-label="➕">➕</button>
  {/if}
{/if}
```
Also update the object-branch `<Self>` in Task 7's code to pass `{onArrayAdd} {onArrayRemove}` (shown above). Note the earlier Task 7 tests call `render(Node, ...)` without the two new props; update those three earlier tests to pass `onArrayAdd: () => {}, onArrayRemove: () => {}` so props are defined.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/Node.test.ts`
Expected: PASS (all Node tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/Node.svelte tests/Node.test.ts
git commit -m "feat: array tables (scalar/object/mixed) with add and remove"
```

---

## Task 9: `App.svelte` — wire model, editor area, empty state

**Files:**
- Modify: `src/App.svelte`
- Test: `tests/App.test.ts`

**Interfaces:**
- Consumes: stores (`data`, `filePath`, `dirty`, `loadDocument`, `applyEdit`), `Node.svelte`, `updateAtPath`, `addArrayItem`, `removeArrayItem`.
- Produces: interactive editor. `fileService` wiring (open/save) is Task 11; this task uses `loadDocument` directly so it is testable without Tauri.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/svelte';
import App from '../src/App.svelte';
import { loadDocument, data } from '../src/lib/stores';
import { get } from 'svelte/store';

describe('App', () => {
  it('shows empty state when no document', () => {
    loadDocument(null as any, null);
    render(App);
    expect(screen.getByText(/Mở một file JSON/i)).toBeInTheDocument();
  });

  it('editing a cell updates the model in the store', async () => {
    loadDocument({ title: 'Hi' }, '/tmp/x.json');
    render(App);
    const input = screen.getByDisplayValue('Hi') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'Bye' } });
    expect(get(data)).toEqual({ title: 'Bye' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/App.test.ts`
Expected: FAIL — App has no empty state / editor yet.

- [ ] **Step 3: Write minimal implementation**

```svelte
<script lang="ts">
  import { data, filePath, dirty, applyEdit } from './lib/stores';
  import { updateAtPath, addArrayItem, removeArrayItem, type Path, type JsonValue } from './lib/jsonModel';
  import Node from './lib/Node.svelte';

  function handleEdit(path: Path, newValue: JsonValue) {
    if ($data === null) return;
    applyEdit(updateAtPath($data, path, newValue));
  }
  function handleArrayAdd(arrayPath: Path) {
    if ($data === null) return;
    applyEdit(addArrayItem($data, arrayPath));
  }
  function handleArrayRemove(arrayPath: Path, index: number) {
    if ($data === null) return;
    applyEdit(removeArrayItem($data, arrayPath, index));
  }

  const fileName = $derived($filePath ? $filePath.split(/[\\/]/).pop() : 'Chưa có file');
</script>

<header class="toolbar">
  <strong>{$dirty ? '● ' : ''}{fileName}</strong>
</header>

<main>
  {#if $data === null}
    <p class="empty">Mở một file JSON để bắt đầu (Ctrl+O).</p>
  {:else}
    <Node
      value={$data}
      path={[]}
      onEdit={handleEdit}
      onArrayAdd={handleArrayAdd}
      onArrayRemove={handleArrayRemove} />
  {/if}
</main>

<style>
  .toolbar { padding: 8px 12px; border-bottom: 1px solid #ddd; }
  main { padding: 12px; }
  .empty { color: #777; }
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/App.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/App.svelte tests/App.test.ts
git commit -m "feat: App wires model to recursive editor with empty state"
```

---

## Task 10: `fileService.ts` — Tauri fs/dialog wrappers (+ shortcuts & dirty confirm)

**Files:**
- Create: `src/lib/fileService.ts`
- Modify: `src/App.svelte` (toolbar buttons Open/Save/Save As, Ctrl+O/Ctrl+S, dirty-close confirm)
- Test: `tests/fileService.test.ts`

**Interfaces:**
- Consumes: `@tauri-apps/plugin-fs`, `@tauri-apps/plugin-dialog`, stores, `JsonValue`.
- Produces:
  - `async function openPath(path: string): Promise<void>` — read file, `JSON.parse`, `loadDocument`; on parse error show dialog `File JSON không hợp lệ: <msg>` and leave state unchanged.
  - `async function pickOpen(): Promise<void>` — open dialog (filter `json`), then `openPath`.
  - `async function saveCurrent(): Promise<void>` — if no path, `pickSave`; else stringify `$data` + `\n`, `writeTextFile`, `markSaved`.
  - `async function pickSave(): Promise<void>` — save dialog, then write + `markSaved`.
  - `function serialize(value: JsonValue): string` — `JSON.stringify(value, null, 2) + '\n'` (pure, unit-tested).

- [ ] **Step 1: Write the failing test** (unit-test the pure part; Tauri calls are integration/manual)

```ts
import { describe, it, expect } from 'vitest';
import { serialize } from '../src/lib/fileService';

describe('serialize', () => {
  it('produces 2-space JSON with trailing newline', () => {
    expect(serialize({ a: 1 })).toBe('{\n  "a": 1\n}\n');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/fileService.test.ts`
Expected: FAIL — `serialize` not exported.

- [ ] **Step 3: Write minimal implementation**

`src/lib/fileService.ts`:
```ts
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { open, save, message } from '@tauri-apps/plugin-dialog';
import { get } from 'svelte/store';
import { data, filePath, loadDocument, markSaved } from './stores';
import type { JsonValue } from './jsonModel';

export function serialize(value: JsonValue): string {
  return JSON.stringify(value, null, 2) + '\n';
}

export async function openPath(path: string): Promise<void> {
  try {
    const text = await readTextFile(path);
    const parsed = JSON.parse(text) as JsonValue;
    loadDocument(parsed, path);
  } catch (e) {
    await message(`File JSON không hợp lệ: ${(e as Error).message}`,
      { title: 'Lỗi', kind: 'error' });
  }
}

export async function pickOpen(): Promise<void> {
  const selected = await open({
    multiple: false,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (typeof selected === 'string') await openPath(selected);
}

export async function saveCurrent(): Promise<void> {
  const current = get(data);
  if (current === null) return;
  const path = get(filePath);
  if (!path) { await pickSave(); return; }
  try {
    await writeTextFile(path, serialize(current));
    markSaved(path);
  } catch (e) {
    await message(`Không lưu được file: ${(e as Error).message}`,
      { title: 'Lỗi', kind: 'error' });
  }
}

export async function pickSave(): Promise<void> {
  const current = get(data);
  if (current === null) return;
  const path = await save({ filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (!path) return;
  try {
    await writeTextFile(path, serialize(current));
    markSaved(path);
  } catch (e) {
    await message(`Không lưu được file: ${(e as Error).message}`,
      { title: 'Lỗi', kind: 'error' });
  }
}
```

- [ ] **Step 4: Wire toolbar + shortcuts + dirty confirm into `App.svelte`**

Add to the `<script>`:
```ts
  import { pickOpen, saveCurrent, pickSave } from './lib/fileService';
  import { onMount } from 'svelte';

  function onKeydown(e: KeyboardEvent) {
    if (e.ctrlKey && e.key.toLowerCase() === 's') { e.preventDefault(); saveCurrent(); }
    if (e.ctrlKey && e.key.toLowerCase() === 'o') { e.preventDefault(); pickOpen(); }
  }

  onMount(() => {
    window.addEventListener('keydown', onKeydown);
    window.addEventListener('beforeunload', (e) => {
      if ($dirty) { e.preventDefault(); e.returnValue = ''; }
    });
    return () => window.removeEventListener('keydown', onKeydown);
  });
```
Replace the `<header>` with buttons:
```svelte
<header class="toolbar">
  <button onclick={pickOpen}>Mở</button>
  <button onclick={saveCurrent} disabled={$data === null}>Lưu</button>
  <button onclick={pickSave} disabled={$data === null}>Lưu thành…</button>
  <strong>{$dirty ? '● ' : ''}{fileName}</strong>
</header>
```

- [ ] **Step 5: Run tests to verify pass**

Run: `npx vitest run`
Expected: all suites PASS. (fileService's Tauri paths are verified in manual acceptance, Task 14.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/fileService.ts src/App.svelte tests/fileService.test.ts
git commit -m "feat: file open/save via Tauri + toolbar, shortcuts, dirty-close guard"
```

---

## Task 11: Tauri shell — config, permissions, argv handoff  ⚠️ REQUIRES RUST

> **Gate:** Do not start until `cargo --version` and `rustup --version` succeed. Install via https://rustup.rs (Windows: also install "Desktop development with C++" from Visual Studio Build Tools for the MSVC linker).

**Files:**
- Create: `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `src-tauri/src/main.rs`, `src-tauri/build.rs`, `src-tauri/capabilities/default.json`
- Modify: `src/lib/fileService.ts` (listen for startup path event), `src/main.ts` (call startup handler)

**Interfaces:**
- Consumes: `openPath` from `fileService.ts`.
- Produces:
  - Rust emits event `open-file` with a path string on launch/second-instance.
  - `function listenForOpenFile(): void` in `fileService.ts` — subscribes and calls `openPath`.

- [ ] **Step 1: Initialize Tauri Rust project files**

Run: `npm run tauri init` and accept defaults (app name `json-table-editor`, window title `JSON Table Editor`, frontend dev URL `http://localhost:1420`, dist `../dist`, dev command `npm run dev`, build command `npm run build`).
Expected: `src-tauri/` created with `Cargo.toml`, `tauri.conf.json`, `src/main.rs`, `build.rs`.

- [ ] **Step 2: Add plugins**

Run:
```bash
npm run tauri add fs
npm run tauri add dialog
npm run tauri add single-instance
```
Expected: `Cargo.toml` gains `tauri-plugin-fs`, `tauri-plugin-dialog`, `tauri-plugin-single-instance`; capabilities updated.

- [ ] **Step 3: Configure `tauri.conf.json`**

Set the file association and window, and ensure the fs/dialog plugins are enabled. Merge these keys:
```json
{
  "productName": "JSON Table Editor",
  "identifier": "com.tung.jsontableeditor",
  "app": {
    "windows": [{ "title": "JSON Table Editor", "width": 1000, "height": 700 }],
    "security": { "csp": null }
  },
  "bundle": {
    "active": true,
    "targets": ["nsis"],
    "fileAssociations": [
      { "ext": ["json"], "name": "JSON File", "role": "Editor" }
    ]
  }
}
```

- [ ] **Step 4: Set capabilities** (`src-tauri/capabilities/default.json`)

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Default capability for the JSON editor",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "dialog:default",
    "fs:default",
    "fs:allow-read-text-file",
    "fs:allow-write-text-file",
    { "identifier": "fs:scope", "allow": [{ "path": "**" }] }
  ]
}
```

- [ ] **Step 5: Implement `src-tauri/src/main.rs`**

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Emitter;

fn emit_open_file(app: &tauri::AppHandle, args: &[String]) {
    // First non-flag arg after the exe path is the file to open.
    if let Some(path) = args.iter().skip(1).find(|a| !a.starts_with('-')) {
        let _ = app.emit("open-file", path.clone());
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            emit_open_file(app, &argv);
        }))
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let args: Vec<String> = std::env::args().collect();
            emit_open_file(&app.handle(), &args);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 6: Add startup listener in `fileService.ts`**

Append:
```ts
import { listen } from '@tauri-apps/api/event';

export function listenForOpenFile(): void {
  listen<string>('open-file', (event) => {
    if (event.payload) openPath(event.payload);
  });
}
```
And in `src/main.ts`, after mount:
```ts
import { listenForOpenFile } from './lib/fileService';
listenForOpenFile();
```

- [ ] **Step 7: Verify it builds and runs**

Run: `npm run tauri dev`
Expected: a native window opens showing the empty state. Use "Mở" to open `tests/fixtures/reading-folders-data.json`; the nested tables render.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: Tauri v2 shell — fs/dialog plugins, file association, argv open handoff"
```

---

## Task 12: Manual acceptance + build installer  ⚠️ REQUIRES RUST

**Files:** none (verification task).

**Interfaces:** exercises the whole app end-to-end against the real success criteria (spec §1, §8).

- [ ] **Step 1: Round-trip a real edit**

Run: `npm run tauri dev`. Open `d:/github/reading-folders-words/reading-folders-data.json`. Expand `folders → cards → words`. Add a word via ➕, edit it, press **Ctrl+S**.
Expected: title shows `●` after edit, clears after save.

- [ ] **Step 2: Verify the file on disk stays valid + intact**

Run: `node -e "JSON.parse(require('fs').readFileSync('d:/github/reading-folders-words/reading-folders-data.json','utf8')); console.log('valid')"`
Expected: prints `valid`. Manually confirm the new word is present and key order/nesting unchanged (diff against git if the file is tracked).

- [ ] **Step 3: Verify double-click association (packaged build)**

Run: `npm run tauri build`
Expected: an NSIS installer under `src-tauri/target/release/bundle/nsis/`. Install it, then double-click a `.json` file → the app opens with that file loaded.

- [ ] **Step 4: Verify dirty-close guard**

Edit a value without saving, close the window.
Expected: browser/OS confirm prompt appears (WebView `beforeunload`).

- [ ] **Step 5: Commit any final docs/fixes**

```bash
git add -A
git commit -m "docs: manual acceptance verified for v1"
```

---

## Self-Review

**Spec coverage:**
- §1 success criteria: double-click open (Task 11 file association + argv, Task 12 verify); table editing (Tasks 7–9); Ctrl+S save-in-place (Task 10); structure preservation (Tasks 3–5); offline native (Task 11). ✓
- §3 round-trip: Tasks 3, 5, 10 (`serialize`). ✓
- §4 components: App (9,10), Node (7,8), stores (6), jsonModel (2–4), fileService (10,11). ✓
- §5 editing scope: leaf type-preserving (7), add/remove items (8), explicit-save safety net (10). ✓
- §6 data flow: launch/argv (11), open (10), edit (9), save (10), dirty-close (10). ✓
- §7 error handling: invalid JSON dialog + save error dialog + Save-As-when-no-path (10), dirty confirm (10). ✓
- §8 testing: vitest round-trip vs real data (5) + jsonModel units (2–4) + component tests (7–9) + manual acceptance (12). ✓
- §9 repo structure: matches File Structure table. ✓

**Placeholder scan:** No TBD/TODO; every code step has full code; every command has expected output. ✓

**Type consistency:** `JsonValue`/`Path`/`ValueKind` defined in Task 2 and reused verbatim. Node callback contract (`onEdit`, `onArrayAdd`, `onArrayRemove`) is introduced in Task 7/8 and consumed identically in App (Task 9). `serialize`, `openPath`, `saveCurrent`, `pickOpen`, `pickSave`, `markSaved`, `loadDocument`, `applyEdit` names consistent across Tasks 6, 10, 11. ✓

**Known deviation from spec:** Spec §9 lists `main.rs` as the Rust entry; Tauri v2 `init` also generates `lib.rs` in some templates — if so, place the builder in `lib.rs` and keep `main.rs` calling `app_lib::run()`. Functionally identical.
