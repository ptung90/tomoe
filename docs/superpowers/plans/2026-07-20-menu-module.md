# Menu Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `menu` module to Tomoe for building weekly meal-plan tables (kindergarten "Thực đơn tháng X - Tuần Y") — auto-filled from a dish bank with rotation + ingredient balancing, editable per cell, exported as PNG (primary) / PDF / print.

**Architecture:** A fresh, isolated module at `src/lib/modules/menu/` implementing the `TomoeModule` contract, backed by one `History<MenuDoc>` in its own `stores.ts` (same shape as flashcards). Pure logic (parse/serialize, `fillWeek`, `renderWeekTable`) lives in plain TS utils for TDD; Svelte handles UI only. The dish bank is a shared `localStorage` library (like the flashcards Schema Library), not part of the document.

**Tech Stack:** Svelte 5 (runes), TypeScript, Vite, vitest (+ jsdom, @testing-library/svelte), Tauri v2 (`plugin-fs`, `plugin-dialog`), `html-to-image` (PNG), `jspdf` (PDF), `@anthropic-ai/sdk` (AI). All already in `package.json` — nothing to install.

## Global Constraints

- Design system = **Calm Paper**: app chrome styles with tokens (`var(--accent)`, `var(--bg)`, `var(--surface)`, `var(--border)`, `var(--text)`, `var(--text-muted)`, `var(--accent-weak)`), never hardcoded hex. **Exception:** the rendered menu `<table>` uses `MenuStyle` colors (self-contained) so exports look identical in light/dark.
- lucide icons: **subpath imports only** (`lucide-svelte/icons/<name>`), never the barrel.
- Svelte 5 runes (`$state`/`$derived`/`$effect`); prefer stores + small focused components.
- TDD for all pure logic (model, routing, fillWeek, render, dishBank). Write the failing test first.
- `npm run check` must stay at 0 errors; `npm test` must stay green.
- Serialized files end with a trailing `\n`.
- Project file ext for this module = **`.menu.tomoe.json`**.
- Commit after every task with the shown message. **Never** `git add -A` / `git add .`; stage only the exact paths listed (repo has unrelated dirty files + signing files that must never be staged).

---

## File structure

```
src/lib/modules/menu/
  model.ts        # MenuDoc/Template/Week/MenuStyle types, defaults, uid, serialize/parse, looksLikeMenu
  stores.ts       # History<MenuDoc> store + dirty/undo/redo + all document actions + UI-only state
  render.ts       # renderWeekTable(week, template, settings) -> HTML string (pure)
  fillWeek.ts     # pure rotation + ingredient-balancing auto-fill
  dishBank.ts     # localStorage dish-bank library (load/add/update/remove/import/harvest)
  module.ts       # TomoeModule facade
  ai.ts           # generateWeek via Anthropic SDK (+ config in localStorage)
  io/
    saveService.ts # serialize + write (Tauri) + markSaved + toast
  export/
    exportImage.ts # html-to-image PNG + Tauri save dialog
    exportPdf.ts   # jspdf PDF + print
  Workspace.svelte        # left week list + center table preview + top actions
  TemplateEditor.svelte   # add/remove/reorder periods & categories
  DishBankModal.svelte    # dish CRUD grouped by categoryKey
  AiWeekModal.svelte      # AI week generation
tests/
  menu-model.test.ts, menu-routing.test.ts, menu-stores.test.ts, menu-render.test.ts,
  menu-fillWeek.test.ts, menu-dishBank.test.ts, menu-saveService.test.ts,
  menu-export.test.ts, menu-ai.test.ts, MenuWorkspace.test.ts
```

Files modified: `src/lib/modules/registry.ts` (register + routing), `src/lib/fileService.ts` (open dialog filter).

---

## Phase 1 — Model, routing, save/load, shell wiring

### Task 1: Model — types, defaults, serialize/parse, sniff

**Files:**
- Create: `src/lib/modules/menu/model.ts`
- Test: `tests/menu-model.test.ts`

**Interfaces:**
- Produces: `MenuDoc`, `MenuTemplate`, `MenuPeriod`, `MenuCategory`, `MenuWeek`, `MenuStyle`, `FontSpec`, `EditLogEntry`; `newMenuDoc(): MenuDoc`; `DEFAULT_TEMPLATE: MenuTemplate`; `DEFAULT_MENU_STYLE: MenuStyle`; `uid(prefix?): string`; `cellKey(categoryId, dayIndex): string`; `serializeMenuDoc(d): string`; `parseMenuDoc(text): MenuDoc`; `looksLikeMenu(text): boolean`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/menu-model.test.ts
import { describe, it, expect } from 'vitest';
import {
  newMenuDoc, serializeMenuDoc, parseMenuDoc, looksLikeMenu, cellKey, DEFAULT_TEMPLATE,
} from '../src/lib/modules/menu/model';

describe('menu model', () => {
  it('newMenuDoc has the default template (Trưa/Xế) and no weeks', () => {
    const d = newMenuDoc();
    expect(d.weeks).toEqual([]);
    expect(d.template.periods.map((p) => p.label)).toEqual(['Trưa', 'Xế']);
    const com = d.template.periods[0].categories.find((c) => c.key === 'com');
    expect(com?.defaultValue).toBe('Cơm trắng');
  });

  it('cellKey composes category id + day index', () => {
    expect(cellKey('cat1', 3)).toBe('cat1:3');
  });

  it('serialize → parse round-trips and ends with a newline', () => {
    const d = newMenuDoc();
    d.projectName = 'Thực đơn mầm non';
    d.weeks.push({ id: 'w1', title: 'Tuần 2', cells: { 'cat1:0': 'Thịt kho trứng' } });
    const text = serializeMenuDoc(d);
    expect(text.endsWith('\n')).toBe(true);
    const back = parseMenuDoc(text);
    expect(back.projectName).toBe('Thực đơn mầm non');
    expect(back.weeks[0].cells['cat1:0']).toBe('Thịt kho trứng');
  });

  it('parse tolerates missing optional fields', () => {
    const back = parseMenuDoc(JSON.stringify({ template: DEFAULT_TEMPLATE, weeks: [] }));
    expect(back.projectName).toBe('Untitled');
    expect(Array.isArray(back.weeks)).toBe(true);
    expect(back.settings.headerColor).toBeTruthy();
  });

  it('looksLikeMenu: true only for objects with a template.periods + weeks array', () => {
    expect(looksLikeMenu(serializeMenuDoc(newMenuDoc()))).toBe(true);
    expect(looksLikeMenu(JSON.stringify({ schemas: [], records: [] }))).toBe(false);
    expect(looksLikeMenu('not json')).toBe(false);
    expect(looksLikeMenu(JSON.stringify({ template: {}, weeks: [] }))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- menu-model`
Expected: FAIL — cannot resolve `../src/lib/modules/menu/model`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/modules/menu/model.ts
export interface FontSpec { family: string; size: number; weight?: number; color: string }
export interface EditLogEntry { by: string; at: string }

export interface MenuCategory {
  id: string;
  key: string;                    // "man","rau","canh","com","traicay","trangmieng"
  label: string;
  hideLabel?: boolean;
  defaultValue?: string;
  balanceByIngredient?: boolean;  // opt-in; default off
  maxPerTypePerWeek?: number;     // default 2 when balancing
}
export interface MenuPeriod { id: string; label: string; categories: MenuCategory[] }
export interface MenuTemplate { days: string[]; periods: MenuPeriod[] }
export interface MenuWeek {
  id: string;
  title: string;
  month?: number;
  weekNo?: number;
  cells: Record<string, string>; // key = `${categoryId}:${dayIndex}`
}
export interface MenuStyle {
  headerColor: string;
  headerTextColor: string;
  title: FontSpec;
  cell: FontSpec;
  border: { width: number; color: string };
  zebra: boolean;
  paperSize: 'A4' | 'A5' | 'Letter';
  orientation: 'portrait' | 'landscape';
}
export interface MenuDoc {
  version: number;
  projectName: string;
  projectIcon: string;
  template: MenuTemplate;
  weeks: MenuWeek[];
  settings: MenuStyle;
  editLog?: EditLogEntry[];
}

let _n = 0;
export function uid(prefix = 'm'): string {
  _n += 1;
  const r = Math.abs(Math.floor((performance.now() * 1000) % 1e9)).toString(36);
  return `${prefix}_${_n.toString(36)}${r}`;
}
export function cellKey(categoryId: string, dayIndex: number): string { return `${categoryId}:${dayIndex}`; }

export const DEFAULT_TEMPLATE: MenuTemplate = {
  days: ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6'],
  periods: [
    { id: 'p_trua', label: 'Trưa', categories: [
      { id: 'c_man',  key: 'man',  label: 'Món mặn', balanceByIngredient: true, maxPerTypePerWeek: 2 },
      { id: 'c_rau',  key: 'rau',  label: 'Món rau' },
      { id: 'c_canh', key: 'canh', label: 'Món canh' },
      { id: 'c_com',  key: 'com',  label: 'Món cơm', defaultValue: 'Cơm trắng' },
    ] },
    { id: 'p_xe', label: 'Xế', categories: [
      { id: 'c_traicay',   key: 'traicay',   label: 'Trái cây' },
      { id: 'c_trangmieng', key: 'trangmieng', label: 'Tráng miệng', hideLabel: true },
    ] },
  ],
};

export const DEFAULT_MENU_STYLE: MenuStyle = {
  headerColor: '#84b063',
  headerTextColor: '#1f3d0c',
  title: { family: 'Lexend', size: 20, weight: 700, color: '#1f3d0c' },
  cell: { family: 'Lexend', size: 13, weight: 400, color: '#1a1a1a' },
  border: { width: 1, color: '#4b7031' },
  zebra: false,
  paperSize: 'A4',
  orientation: 'landscape',
};

export function newMenuDoc(): MenuDoc {
  return {
    version: 1, projectName: 'Untitled', projectIcon: '🍱',
    template: structuredClone(DEFAULT_TEMPLATE),
    weeks: [],
    settings: structuredClone(DEFAULT_MENU_STYLE),
    editLog: [],
  };
}

export function serializeMenuDoc(d: MenuDoc): string { return JSON.stringify(d, null, 2) + '\n'; }

export function parseMenuDoc(text: string): MenuDoc {
  const raw = JSON.parse(text) as any;
  const base = newMenuDoc();
  const t = raw?.template && typeof raw.template === 'object' ? raw.template : base.template;
  const template: MenuTemplate = {
    days: Array.isArray(t.days) && t.days.length ? t.days.map(String) : base.template.days,
    periods: Array.isArray(t.periods) ? t.periods : base.template.periods,
  };
  const s = raw?.settings || {};
  const settings: MenuStyle = {
    ...base.settings, ...s,
    title: { ...base.settings.title, ...(s.title || {}) },
    cell: { ...base.settings.cell, ...(s.cell || {}) },
    border: { ...base.settings.border, ...(s.border || {}) },
  };
  const weeks: MenuWeek[] = (Array.isArray(raw?.weeks) ? raw.weeks : []).map((w: any) => ({
    id: w?.id || uid('w'),
    title: typeof w?.title === 'string' ? w.title : 'Tuần',
    month: typeof w?.month === 'number' ? w.month : undefined,
    weekNo: typeof w?.weekNo === 'number' ? w.weekNo : undefined,
    cells: w?.cells && typeof w.cells === 'object' ? w.cells : {},
  }));
  return {
    version: typeof raw?.version === 'number' ? raw.version : 1,
    projectName: raw?.projectName ?? base.projectName,
    projectIcon: raw?.projectIcon ?? base.projectIcon,
    template, weeks, settings,
    editLog: Array.isArray(raw?.editLog)
      ? raw.editLog.filter((e: any) => e && typeof e.by === 'string' && typeof e.at === 'string')
      : [],
  };
}

export function looksLikeMenu(text: string): boolean {
  try {
    const o = JSON.parse(text);
    if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
    return !!o.template && Array.isArray(o.template.periods) && Array.isArray(o.weeks);
  } catch { return false; }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- menu-model`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/modules/menu/model.ts tests/menu-model.test.ts
git commit -m "feat(menu): document model — types, defaults, serialize/parse, sniff"
```

---

### Task 2: Stores — history-backed document + core actions

**Files:**
- Create: `src/lib/modules/menu/stores.ts`
- Test: `tests/menu-stores.test.ts`

**Interfaces:**
- Consumes: `model.ts` (`MenuDoc`, `newMenuDoc`, `parseMenuDoc`, `uid`, `cellKey`); `../../history` (`createHistory`, `push`, `undo`, `redo`, `canUndo`, `canRedo`).
- Produces stores: `doc: Readable<MenuDoc>`, `dirty`, `canUndo`, `canRedo`, `filePath`, `diskBaselineHash`, `selectedWeekId`, `templateEditorOpen`, `dishBankOpen`, `aiModalOpen`. Functions: `initDoc()`, `loadDoc(d, path, rawText?)`, `commit(next)`, `undo()`, `redo()`, `markSaved(path, savedText?)`, `stampEditLog(by, at)`, `selectWeek(id)`, `setProjectName(name)`, `setSettings(patch)`. (Week/template/fill actions are added in later tasks in this same file.)

- [ ] **Step 1: Write the failing test**

```ts
// tests/menu-stores.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import * as S from '../src/lib/modules/menu/stores';
import { newMenuDoc } from '../src/lib/modules/menu/model';

beforeEach(() => S.initDoc());

describe('menu stores', () => {
  it('starts clean, not dirty, cannot undo', () => {
    expect(get(S.dirty)).toBe(false);
    expect(get(S.canUndo)).toBe(false);
    expect(get(S.doc).weeks).toEqual([]);
  });

  it('commit flips dirty and enables undo; undo restores', () => {
    const d = newMenuDoc(); d.projectName = 'X';
    S.commit(d);
    expect(get(S.dirty)).toBe(true);
    expect(get(S.doc).projectName).toBe('X');
    expect(get(S.canUndo)).toBe(true);
    S.undo();
    expect(get(S.doc).projectName).toBe('Untitled');
  });

  it('setSettings merges into settings as one undo step', () => {
    S.setSettings({ headerColor: '#123456' });
    expect(get(S.doc).settings.headerColor).toBe('#123456');
    expect(get(S.canUndo)).toBe(true);
  });

  it('loadDoc resets dirty and selects the first week', () => {
    const d = newMenuDoc(); d.weeks.push({ id: 'w1', title: 'T', cells: {} });
    S.loadDoc(d, '/tmp/x.menu.tomoe.json');
    expect(get(S.dirty)).toBe(false);
    expect(get(S.selectedWeekId)).toBe('w1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- menu-stores`
Expected: FAIL — cannot resolve `stores`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/modules/menu/stores.ts
import { writable, derived, get, type Readable, type Writable } from 'svelte/store';
import * as H from '../../history';
import { newMenuDoc, parseMenuDoc, type MenuDoc, type MenuStyle } from './model';
import { hashContent } from '../flashcards/lib/fileSync';

const history = writable<H.History<MenuDoc>>(H.createHistory(newMenuDoc()));
export const doc: Readable<MenuDoc> = derived(history, (h) => h.present);
export const canUndo: Readable<boolean> = derived(history, (h) => H.canUndo(h));
export const canRedo: Readable<boolean> = derived(history, (h) => H.canRedo(h));
export const dirty: Writable<boolean> = writable(false);
export const filePath: Writable<string | null> = writable(null);
export const diskBaselineHash: Writable<string | null> = writable(null);

// UI-only state (not in history)
export const selectedWeekId: Writable<string | null> = writable(null);
export const templateEditorOpen: Writable<boolean> = writable(false);
export const dishBankOpen: Writable<boolean> = writable(false);
export const aiModalOpen: Writable<boolean> = writable(false);

export function initDoc(): void {
  history.set(H.createHistory(newMenuDoc()));
  filePath.set(null); dirty.set(false); diskBaselineHash.set(null);
  selectedWeekId.set(null); templateEditorOpen.set(false); dishBankOpen.set(false); aiModalOpen.set(false);
}
export function loadDoc(d: MenuDoc, path: string | null, rawText?: string): void {
  history.set(H.createHistory(d));
  filePath.set(path); dirty.set(false);
  diskBaselineHash.set(rawText != null ? hashContent(rawText) : null);
  selectedWeekId.set(d.weeks[0]?.id ?? null);
  templateEditorOpen.set(false); dishBankOpen.set(false); aiModalOpen.set(false);
}
export function commit(next: MenuDoc): void { history.update((h) => H.push(h, next)); dirty.set(true); }
export function undo(): void { history.update((h) => H.undo(h)); dirty.set(true); }
export function redo(): void { history.update((h) => H.redo(h)); dirty.set(true); }
export function markSaved(path: string, savedText?: string): void {
  filePath.set(path); dirty.set(false);
  diskBaselineHash.set(savedText != null ? hashContent(savedText) : null);
}

const EDIT_LOG_CAP = 50;
export function stampEditLog(by: string, at: string): void {
  history.update((h) => {
    const editLog = [...(h.present.editLog ?? []), { by, at }].slice(-EDIT_LOG_CAP);
    return { ...h, present: { ...h.present, editLog } };
  });
}

export function selectWeek(id: string | null): void { selectedWeekId.set(id); }
export function setProjectName(name: string): void { commit({ ...get(doc), projectName: name }); }
export function setSettings(patch: Partial<MenuStyle>): void {
  const p = get(doc);
  commit({ ...p, settings: { ...p.settings, ...patch } });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- menu-stores`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/modules/menu/stores.ts tests/menu-stores.test.ts
git commit -m "feat(menu): history-backed store with core doc actions"
```

---

### Task 3: Save service (Tauri write + toast)

**Files:**
- Create: `src/lib/modules/menu/io/saveService.ts`
- Test: `tests/menu-saveService.test.ts`

**Interfaces:**
- Consumes: `stores.ts` (`doc`, `filePath`, `markSaved`, `stampEditLog`), `model.ts` (`serializeMenuDoc`), shell (`showToast`, `userName`), `@tauri-apps/plugin-fs` (`writeFile`), `@tauri-apps/plugin-dialog` (`save`).
- Produces: `saveToPath(path): Promise<void>`, `pickSaveTo(): Promise<void>`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/menu-saveService.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const writeFile = vi.fn(async () => {});
const saveDialog = vi.fn(async () => '/tmp/new.menu.tomoe.json');
vi.mock('@tauri-apps/plugin-fs', () => ({ writeFile: (...a: any[]) => writeFile(...a), readTextFile: vi.fn() }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ save: (...a: any[]) => saveDialog(...a) }));

import * as S from '../src/lib/modules/menu/stores';
import { saveToPath, pickSaveTo } from '../src/lib/modules/menu/io/saveService';

beforeEach(() => { S.initDoc(); writeFile.mockClear(); saveDialog.mockClear(); });

describe('menu saveService', () => {
  it('saveToPath writes UTF-8 bytes and marks saved', async () => {
    await saveToPath('/tmp/x.menu.tomoe.json');
    expect(writeFile).toHaveBeenCalledOnce();
    const [path, bytes] = writeFile.mock.calls[0];
    expect(path).toBe('/tmp/x.menu.tomoe.json');
    expect(bytes).toBeInstanceOf(Uint8Array);
  });

  it('pickSaveTo prompts then writes to the chosen path', async () => {
    await pickSaveTo();
    expect(saveDialog).toHaveBeenCalledOnce();
    expect(writeFile.mock.calls[0][0]).toBe('/tmp/new.menu.tomoe.json');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- menu-saveService`
Expected: FAIL — cannot resolve `saveService`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/modules/menu/io/saveService.ts
import { writeFile } from '@tauri-apps/plugin-fs';
import { save as saveDialog } from '@tauri-apps/plugin-dialog';
import { get } from 'svelte/store';
import * as S from '../stores';
import { serializeMenuDoc } from '../model';
import { showToast, userName } from '../../../shell';

async function doWrite(path: string): Promise<void> {
  S.stampEditLog(get(userName).trim() || 'unknown', new Date().toISOString());
  const text = serializeMenuDoc(get(S.doc));
  try {
    await writeFile(path, new TextEncoder().encode(text));
    S.markSaved(path, text);
    showToast('Saved');
  } catch (e) { showToast(`Could not save: ${(e as Error).message}`, 'error'); }
}

export async function saveToPath(path: string): Promise<void> { await doWrite(path); }

export async function pickSaveTo(): Promise<void> {
  const np = await saveDialog({ filters: [{ name: 'Tomoe Menu', extensions: ['menu.tomoe.json'] }] });
  if (!np) return;
  await doWrite(np);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- menu-saveService`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/modules/menu/io/saveService.ts tests/menu-saveService.test.ts
git commit -m "feat(menu): save service (Tauri write + toast)"
```

---

### Task 4: Module facade, registry registration, open routing

**Files:**
- Create: `src/lib/modules/menu/module.ts`
- Create: `src/lib/modules/menu/Workspace.svelte` (placeholder for now; filled in Task 8)
- Modify: `src/lib/modules/registry.ts`
- Modify: `src/lib/fileService.ts:64` (open dialog filter)
- Test: `tests/menu-routing.test.ts`

**Interfaces:**
- Consumes: `stores.ts`, `model.ts` (`parseMenuDoc`, `looksLikeMenu`), `io/saveService.ts`.
- Produces: `menu: TomoeModule`; `registry.pickModuleForOpen` routes `.menu.tomoe.json` and menu-content to `menu`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/menu-routing.test.ts
import { describe, it, expect } from 'vitest';
import { pickModuleForOpen, MODULES } from '../src/lib/modules/registry';
import { serializeMenuDoc, newMenuDoc } from '../src/lib/modules/menu/model';

describe('menu routing', () => {
  it('menu module is registered', () => {
    expect(MODULES.some((m) => m.id === 'menu')).toBe(true);
  });
  it('.menu.tomoe.json routes to menu (not flashcards)', () => {
    expect(pickModuleForOpen('x.menu.tomoe.json', '{}').id).toBe('menu');
  });
  it('.tomoe.json (non-menu) still routes to flashcards', () => {
    expect(pickModuleForOpen('x.tomoe.json', '{}').id).toBe('flashcards');
  });
  it('menu content sniff wins over the flashcards projectName sniff', () => {
    // A menu doc has projectName too — must NOT be captured by flashcards.
    const text = serializeMenuDoc(newMenuDoc());
    expect(pickModuleForOpen('untitled.json', text).id).toBe('menu');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- menu-routing`
Expected: FAIL — no `menu` module / wrong routing.

- [ ] **Step 3: Write the implementations**

Create the placeholder Workspace:

```svelte
<!-- src/lib/modules/menu/Workspace.svelte -->
<script lang="ts">
  import * as S from './stores';
  const doc = S.doc;
</script>

<div class="menu-workspace">
  <p>Menu module — {$doc.weeks.length} week(s).</p>
</div>

<style>
  .menu-workspace { flex:1; padding:16px; background:var(--bg); color:var(--text); overflow:auto; }
</style>
```

Create the facade:

```ts
// src/lib/modules/menu/module.ts
import { get } from 'svelte/store';
import type { TomoeModule } from '../types';
import Workspace from './Workspace.svelte';
import * as S from './stores';
import { parseMenuDoc, looksLikeMenu } from './model';
import { saveToPath, pickSaveTo } from './io/saveService';

export const menu: TomoeModule = {
  id: 'menu', label: 'Thực đơn', extensions: ['menu.tomoe.json'],
  matches: (text) => looksLikeMenu(text),
  Workspace,
  newDoc: () => S.initDoc(),
  open: (text, path) =>
    S.loadDoc(parseMenuDoc(text), path && path.endsWith('.menu.tomoe.json') ? path : null, text),
  save: async () => { const p = get(S.filePath); if (p) return saveToPath(p); return pickSaveTo(); },
  saveAs: () => pickSaveTo(),
  dirty: S.dirty, canUndo: S.canUndo, canRedo: S.canRedo, undo: S.undo, redo: S.redo,
};
```

Update the registry — register `menu` and route it BEFORE flashcards (extension) and BEFORE the generic sniff loop (because `looksLikeFlashcards` also matches a MenuDoc's `projectName`):

```ts
// src/lib/modules/registry.ts
import type { TomoeModule } from './types';
import { flashcards } from './flashcards/module';
import { jsonTable } from './json-table/module';
import { menu } from './menu/module';

export const MODULES: TomoeModule[] = [flashcards, menu, jsonTable];

export function getModule(id: string): TomoeModule {
  return MODULES.find((m) => m.id === id) ?? MODULES[0];
}

export function pickModuleForOpen(path: string, text: string): TomoeModule {
  if (path.endsWith('.menu.tomoe.json')) return menu;
  if (path.endsWith('.tomoe.json')) return flashcards;
  if (menu.matches?.(text)) return menu;               // check menu before the generic loop
  const sniff = MODULES.find((m) => m.matches?.(text));
  if (sniff) return sniff;
  return jsonTable;
}
```

Update the open dialog filter so menu files are selectable:

```ts
// src/lib/fileService.ts  (in pickOpen, replace the extensions array on the filter)
  const sel = await open({ multiple: false, filters: [{ name: 'Tomoe / JSON', extensions: ['menu.tomoe.json', 'tomoe.json', 'schema.json', 'json'] }] });
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npm test -- menu-routing && npm run check`
Expected: routing PASS (4 tests); check 0 errors. StartScreen auto-lists `MODULES`, so a "New Thực đơn" button now appears with no extra code.

- [ ] **Step 5: Commit**

```bash
git add src/lib/modules/menu/module.ts src/lib/modules/menu/Workspace.svelte src/lib/modules/registry.ts src/lib/fileService.ts tests/menu-routing.test.ts
git commit -m "feat(menu): module facade + registry routing + open filter"
```

---

## Phase 2 — Template editor, week editor, render

### Task 5: `renderWeekTable` (pure HTML)

**Files:**
- Create: `src/lib/modules/menu/render.ts`
- Test: `tests/menu-render.test.ts`

**Interfaces:**
- Consumes: `model.ts` (`MenuWeek`, `MenuTemplate`, `MenuStyle`, `cellKey`).
- Produces: `renderWeekTable(week, template, settings): string`, `escapeHtml(s): string`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/menu-render.test.ts
import { describe, it, expect } from 'vitest';
import { renderWeekTable } from '../src/lib/modules/menu/render';
import { newMenuDoc, cellKey } from '../src/lib/modules/menu/model';

describe('renderWeekTable', () => {
  const { template, settings } = newMenuDoc();
  const trua = template.periods[0];          // Trưa: 4 categories
  const week = { id: 'w', title: 'Thực đơn tháng 6 - Tuần 2',
    cells: { [cellKey(trua.categories[0].id, 0)]: 'Thịt kho trứng' } };

  it('renders the title', () => {
    expect(renderWeekTable(week, template, settings)).toContain('Thực đơn tháng 6 - Tuần 2');
  });
  it('period label spans its categories via rowspan', () => {
    const html = renderWeekTable(week, template, settings);
    expect(html).toMatch(/rowspan="4"[^>]*>\s*Trưa/);
  });
  it('places a filled cell', () => {
    expect(renderWeekTable(week, template, settings)).toContain('Thịt kho trứng');
  });
  it('hideLabel category renders an empty label cell (no "Tráng miệng")', () => {
    expect(renderWeekTable(week, template, settings)).not.toContain('Tráng miệng');
  });
  it('renders one column header per day', () => {
    const html = renderWeekTable(week, template, settings);
    for (const d of template.days) expect(html).toContain(d);
  });
  it('escapes HTML in cell text', () => {
    const w = { id: 'w', title: 'T', cells: { [cellKey(trua.categories[0].id, 0)]: '<b>x</b>' } };
    expect(renderWeekTable(w, template, settings)).toContain('&lt;b&gt;x&lt;/b&gt;');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- menu-render`
Expected: FAIL — cannot resolve `render`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/modules/menu/render.ts
import { cellKey, type MenuWeek, type MenuTemplate, type MenuStyle } from './model';

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}

export function renderWeekTable(week: MenuWeek, template: MenuTemplate, s: MenuStyle): string {
  const nDays = template.days.length;
  const totalCols = nDays + 2; // period-label col + category-label col + one per day
  const border = `${s.border.width}px solid ${s.border.color}`;
  const cellStyle = `border:${border};padding:6px 8px;font-family:${s.cell.family};font-size:${s.cell.size}px;color:${s.cell.color};vertical-align:middle;`;
  const headStyle = `${cellStyle}background:${s.headerColor};color:${s.headerTextColor};font-weight:600;text-align:center;`;

  const rows: string[] = [];
  // Title row (spans all columns)
  rows.push(
    `<tr><td colspan="${totalCols}" style="${headStyle}font-size:${s.title.size}px;font-family:${s.title.family};color:${s.title.color};">${escapeHtml(week.title)}</td></tr>`);
  // Day-header row (two empty corner cells + day labels)
  rows.push(
    `<tr><td style="${headStyle}"></td><td style="${headStyle}"></td>` +
    template.days.map((d) => `<td style="${headStyle}">${escapeHtml(d)}</td>`).join('') + `</tr>`);
  // Body rows
  for (const period of template.periods) {
    period.categories.forEach((cat, i) => {
      const tds: string[] = [];
      if (i === 0) tds.push(`<td rowspan="${period.categories.length}" style="${headStyle}">${escapeHtml(period.label)}</td>`);
      tds.push(`<td style="${headStyle}text-align:left;">${cat.hideLabel ? '' : escapeHtml(cat.label)}</td>`);
      for (let day = 0; day < nDays; day++) {
        const v = week.cells[cellKey(cat.id, day)] ?? '';
        const zebra = s.zebra && day % 2 === 1 ? 'background:rgba(0,0,0,0.03);' : '';
        tds.push(`<td style="${cellStyle}text-align:center;${zebra}">${escapeHtml(v)}</td>`);
      }
      rows.push(`<tr>${tds.join('')}</tr>`);
    });
  }
  return `<table style="border-collapse:collapse;width:100%;background:#fff;">${rows.join('')}</table>`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- menu-render`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/modules/menu/render.ts tests/menu-render.test.ts
git commit -m "feat(menu): renderWeekTable — pure HTML table with rowspan periods"
```

---

### Task 6: Template actions (periods & categories)

**Files:**
- Modify: `src/lib/modules/menu/stores.ts` (append actions)
- Test: `tests/menu-stores.test.ts` (append a describe block)

**Interfaces:**
- Produces (in `stores.ts`): `addCategory(periodId)`, `removeCategory(catId)`, `renameCategory(catId, label)`, `setCategoryKey(catId, key)`, `moveCategory(catId, delta)`, `setCategoryFlag(catId, patch)` where patch is `Partial<Pick<MenuCategory,'hideLabel'|'defaultValue'|'balanceByIngredient'|'maxPerTypePerWeek'>>`, `addPeriod()`, `removePeriod(periodId)`, `renamePeriod(periodId, label)`, `setDays(days: string[])`.

- [ ] **Step 1: Write the failing test (append)**

```ts
// tests/menu-stores.test.ts — append
import { uid } from '../src/lib/modules/menu/model';

describe('menu template actions', () => {
  beforeEach(() => S.initDoc());
  it('addCategory appends to a period', () => {
    const pid = get(S.doc).template.periods[0].id;
    S.addCategory(pid);
    expect(get(S.doc).template.periods[0].categories.length).toBe(5);
  });
  it('renameCategory + setCategoryFlag update in place', () => {
    const cat = get(S.doc).template.periods[0].categories[0];
    S.renameCategory(cat.id, 'Mặn');
    S.setCategoryFlag(cat.id, { balanceByIngredient: false, defaultValue: 'x' });
    const after = get(S.doc).template.periods[0].categories[0];
    expect(after.label).toBe('Mặn');
    expect(after.balanceByIngredient).toBe(false);
    expect(after.defaultValue).toBe('x');
  });
  it('moveCategory reorders within its period', () => {
    const cats = get(S.doc).template.periods[0].categories;
    const second = cats[1].id;
    S.moveCategory(second, -1);
    expect(get(S.doc).template.periods[0].categories[0].id).toBe(second);
  });
  it('setDays replaces the day columns', () => {
    S.setDays(['T2', 'T3', 'T4', 'T5', 'T6', 'T7']);
    expect(get(S.doc).template.days.length).toBe(6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- menu-stores`
Expected: FAIL — `addCategory` is not a function.

- [ ] **Step 3: Write the implementation (append to `stores.ts`)**

```ts
// src/lib/modules/menu/stores.ts — append
import { uid, type MenuCategory, type MenuPeriod } from './model';

function mapPeriods(fn: (p: MenuPeriod) => MenuPeriod): void {
  const p = get(doc);
  commit({ ...p, template: { ...p.template, periods: p.template.periods.map(fn) } });
}
function mapCategory(catId: string, fn: (c: MenuCategory) => MenuCategory): void {
  mapPeriods((p) => ({ ...p, categories: p.categories.map((c) => (c.id === catId ? fn(c) : c)) }));
}

export function addCategory(periodId: string): void {
  mapPeriods((p) => p.id !== periodId ? p
    : { ...p, categories: [...p.categories, { id: uid('c'), key: 'man', label: 'Nhóm mới' }] });
}
export function removeCategory(catId: string): void {
  mapPeriods((p) => ({ ...p, categories: p.categories.filter((c) => c.id !== catId) }));
}
export function renameCategory(catId: string, label: string): void { mapCategory(catId, (c) => ({ ...c, label })); }
export function setCategoryKey(catId: string, key: string): void { mapCategory(catId, (c) => ({ ...c, key })); }
export function setCategoryFlag(
  catId: string,
  patch: Partial<Pick<MenuCategory, 'hideLabel' | 'defaultValue' | 'balanceByIngredient' | 'maxPerTypePerWeek'>>,
): void { mapCategory(catId, (c) => ({ ...c, ...patch })); }
export function moveCategory(catId: string, delta: number): void {
  mapPeriods((p) => {
    const i = p.categories.findIndex((c) => c.id === catId);
    if (i === -1) return p;
    const j = i + delta;
    if (j < 0 || j >= p.categories.length) return p;
    const cats = p.categories.slice();
    [cats[i], cats[j]] = [cats[j], cats[i]];
    return { ...p, categories: cats };
  });
}
export function addPeriod(): void {
  const p = get(doc);
  const period: MenuPeriod = { id: uid('p'), label: 'Buổi mới', categories: [{ id: uid('c'), key: 'man', label: 'Nhóm' }] };
  commit({ ...p, template: { ...p.template, periods: [...p.template.periods, period] } });
}
export function removePeriod(periodId: string): void {
  const p = get(doc);
  commit({ ...p, template: { ...p.template, periods: p.template.periods.filter((x) => x.id !== periodId) } });
}
export function renamePeriod(periodId: string, label: string): void {
  mapPeriods((p) => (p.id === periodId ? { ...p, label } : p));
}
export function setDays(days: string[]): void {
  const p = get(doc);
  commit({ ...p, template: { ...p.template, days: days.slice() } });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- menu-stores`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/modules/menu/stores.ts tests/menu-stores.test.ts
git commit -m "feat(menu): template actions (periods & categories)"
```

---

### Task 7: Week actions

**Files:**
- Modify: `src/lib/modules/menu/stores.ts` (append actions)
- Test: `tests/menu-stores.test.ts` (append a describe block)

**Interfaces:**
- Produces: `addWeek()`, `duplicateWeek(id)`, `deleteWeek(id)`, `moveWeek(id, delta)`, `setWeekTitle(id, title)`, `setCell(weekId, catId, dayIndex, value)`. Each `commit`s and (for add/duplicate) selects the new week.

- [ ] **Step 1: Write the failing test (append)**

```ts
// tests/menu-stores.test.ts — append
import { cellKey } from '../src/lib/modules/menu/model';

describe('menu week actions', () => {
  beforeEach(() => S.initDoc());
  it('addWeek creates + selects a week', () => {
    S.addWeek();
    expect(get(S.doc).weeks.length).toBe(1);
    expect(get(S.selectedWeekId)).toBe(get(S.doc).weeks[0].id);
  });
  it('setCell writes a cell keyed by category+day', () => {
    S.addWeek();
    const w = get(S.doc).weeks[0];
    const cat = get(S.doc).template.periods[0].categories[0];
    S.setCell(w.id, cat.id, 2, 'Cá kho');
    expect(get(S.doc).weeks[0].cells[cellKey(cat.id, 2)]).toBe('Cá kho');
  });
  it('duplicateWeek copies cells into a new selected week', () => {
    S.addWeek();
    const w = get(S.doc).weeks[0];
    const cat = get(S.doc).template.periods[0].categories[0];
    S.setCell(w.id, cat.id, 0, 'X');
    S.duplicateWeek(w.id);
    expect(get(S.doc).weeks.length).toBe(2);
    expect(get(S.doc).weeks[1].cells[cellKey(cat.id, 0)]).toBe('X');
  });
  it('deleteWeek clears selection when the selected week goes', () => {
    S.addWeek();
    const id = get(S.doc).weeks[0].id;
    S.deleteWeek(id);
    expect(get(S.doc).weeks.length).toBe(0);
    expect(get(S.selectedWeekId)).toBe(null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- menu-stores`
Expected: FAIL — `addWeek` is not a function.

- [ ] **Step 3: Write the implementation (append to `stores.ts`)**

```ts
// src/lib/modules/menu/stores.ts — append
import { cellKey, type MenuWeek } from './model';

function mapWeek(weekId: string, fn: (w: MenuWeek) => MenuWeek): void {
  const p = get(doc);
  commit({ ...p, weeks: p.weeks.map((w) => (w.id === weekId ? fn(w) : w)) });
}

export function addWeek(): void {
  const p = get(doc);
  const n = p.weeks.length + 1;
  const week: MenuWeek = { id: uid('w'), title: `Tuần ${n}`, cells: {} };
  commit({ ...p, weeks: [...p.weeks, week] });
  selectedWeekId.set(week.id);
}
export function duplicateWeek(id: string): void {
  const p = get(doc);
  const src = p.weeks.find((w) => w.id === id);
  if (!src) return;
  const copy: MenuWeek = { ...structuredClone(src), id: uid('w'), title: `${src.title} (bản sao)` };
  const i = p.weeks.findIndex((w) => w.id === id);
  const weeks = p.weeks.slice(); weeks.splice(i + 1, 0, copy);
  commit({ ...p, weeks });
  selectedWeekId.set(copy.id);
}
export function deleteWeek(id: string): void {
  const p = get(doc);
  commit({ ...p, weeks: p.weeks.filter((w) => w.id !== id) });
  if (get(selectedWeekId) === id) selectedWeekId.set(get(doc).weeks[0]?.id ?? null);
}
export function moveWeek(id: string, delta: number): void {
  const p = get(doc);
  const i = p.weeks.findIndex((w) => w.id === id);
  if (i === -1) return;
  const j = i + delta;
  if (j < 0 || j >= p.weeks.length) return;
  const weeks = p.weeks.slice();
  [weeks[i], weeks[j]] = [weeks[j], weeks[i]];
  commit({ ...p, weeks });
}
export function setWeekTitle(id: string, title: string): void { mapWeek(id, (w) => ({ ...w, title })); }
export function setCell(weekId: string, catId: string, dayIndex: number, value: string): void {
  mapWeek(weekId, (w) => ({ ...w, cells: { ...w.cells, [cellKey(catId, dayIndex)]: value } }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- menu-stores`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/modules/menu/stores.ts tests/menu-stores.test.ts
git commit -m "feat(menu): week actions (add/duplicate/delete/move/setCell)"
```

---

### Task 8: Workspace UI — week list + editable table + template editor

**Files:**
- Rewrite: `src/lib/modules/menu/Workspace.svelte`
- Create: `src/lib/modules/menu/TemplateEditor.svelte`
- Test: `tests/MenuWorkspace.test.ts`

**Interfaces:**
- Consumes: all `stores.ts` actions from Tasks 2/6/7, `render.ts` (`renderWeekTable`).
- Produces: rendered UI. `TemplateEditor` is a modal driven by `S.templateEditorOpen`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/MenuWorkspace.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/svelte';
import { get } from 'svelte/store';
import Workspace from '../src/lib/modules/menu/Workspace.svelte';
import * as S from '../src/lib/modules/menu/stores';

beforeEach(() => S.initDoc());

describe('MenuWorkspace', () => {
  it('shows an empty state and can add a week', async () => {
    render(Workspace);
    await fireEvent.click(screen.getByRole('button', { name: /thêm tuần/i }));
    expect(get(S.doc).weeks.length).toBe(1);
  });
  it('renders the week table with day headers once a week exists', async () => {
    S.addWeek();
    render(Workspace);
    expect(await screen.findByText('Thứ 2')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- MenuWorkspace`
Expected: FAIL — no "Thêm tuần" button (placeholder Workspace).

- [ ] **Step 3: Write the implementations**

```svelte
<!-- src/lib/modules/menu/TemplateEditor.svelte -->
<script lang="ts">
  import X from 'lucide-svelte/icons/x';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import ChevronUp from 'lucide-svelte/icons/chevron-up';
  import ChevronDown from 'lucide-svelte/icons/chevron-down';
  import * as S from './stores';
  const doc = S.doc;
  function close() { S.templateEditorOpen.set(false); }
</script>

<div class="backdrop" role="presentation" onclick={close}>
  <div class="panel" role="dialog" aria-label="Sửa cấu trúc" onclick={(e) => e.stopPropagation()}>
    <header><h2>Cấu trúc thực đơn</h2><button class="icon" aria-label="Đóng" onclick={close}><X size={18} /></button></header>
    <label class="days">Các ngày (cách nhau bằng dấu phẩy)
      <input value={$doc.template.days.join(', ')}
        onchange={(e) => S.setDays((e.currentTarget as HTMLInputElement).value.split(',').map((s) => s.trim()).filter(Boolean))} />
    </label>
    {#each $doc.template.periods as period (period.id)}
      <fieldset>
        <legend>
          <input value={period.label} onchange={(e) => S.renamePeriod(period.id, (e.currentTarget as HTMLInputElement).value)} />
          <button class="icon" aria-label="Xóa buổi" onclick={() => S.removePeriod(period.id)}><Trash2 size={15} /></button>
        </legend>
        {#each period.categories as cat (cat.id)}
          <div class="cat">
            <input class="lbl" value={cat.label} onchange={(e) => S.renameCategory(cat.id, (e.currentTarget as HTMLInputElement).value)} />
            <input class="key" value={cat.key} title="mã nhóm (gắn món)" onchange={(e) => S.setCategoryKey(cat.id, (e.currentTarget as HTMLInputElement).value)} />
            <input class="dv" placeholder="mặc định" value={cat.defaultValue ?? ''} onchange={(e) => S.setCategoryFlag(cat.id, { defaultValue: (e.currentTarget as HTMLInputElement).value || undefined })} />
            <label title="Ẩn nhãn"><input type="checkbox" checked={!!cat.hideLabel} onchange={(e) => S.setCategoryFlag(cat.id, { hideLabel: (e.currentTarget as HTMLInputElement).checked })} /> ẩn</label>
            <label title="Cân bằng nguyên liệu"><input type="checkbox" checked={!!cat.balanceByIngredient} onchange={(e) => S.setCategoryFlag(cat.id, { balanceByIngredient: (e.currentTarget as HTMLInputElement).checked })} /> cân bằng</label>
            <button class="icon" aria-label="Lên" onclick={() => S.moveCategory(cat.id, -1)}><ChevronUp size={14} /></button>
            <button class="icon" aria-label="Xuống" onclick={() => S.moveCategory(cat.id, 1)}><ChevronDown size={14} /></button>
            <button class="icon" aria-label="Xóa nhóm" onclick={() => S.removeCategory(cat.id)}><Trash2 size={14} /></button>
          </div>
        {/each}
        <button class="add" onclick={() => S.addCategory(period.id)}>+ Nhóm món</button>
      </fieldset>
    {/each}
    <button class="add" onclick={() => S.addPeriod()}>+ Buổi</button>
  </div>
</div>

<style>
  .backdrop { position:fixed; inset:0; background:rgba(0,0,0,.4); display:flex; align-items:center; justify-content:center; z-index:50; }
  .panel { background:var(--surface); color:var(--text); border:1px solid var(--border); border-radius:12px; padding:16px 20px; width:min(720px,92vw); max-height:88vh; overflow:auto; }
  header { display:flex; align-items:center; justify-content:space-between; }
  h2 { margin:0 0 4px; font-size:16px; }
  fieldset { border:1px solid var(--border); border-radius:8px; margin:10px 0; padding:8px 10px; }
  legend { display:flex; gap:6px; align-items:center; }
  .cat { display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin:4px 0; }
  input { border:1px solid var(--border); border-radius:6px; padding:4px 6px; background:var(--bg); color:var(--text); font:inherit; }
  .lbl { width:130px; } .key { width:90px; } .dv { width:110px; }
  .icon { border:none; background:transparent; color:var(--text-muted); cursor:pointer; padding:3px; border-radius:5px; }
  .icon:hover { background:var(--accent-weak); color:var(--accent); }
  .add { border:1px dashed var(--border); background:transparent; color:var(--accent); border-radius:6px; padding:5px 10px; cursor:pointer; font:inherit; }
</style>
```

```svelte
<!-- src/lib/modules/menu/Workspace.svelte -->
<script lang="ts">
  import Plus from 'lucide-svelte/icons/plus';
  import Copy from 'lucide-svelte/icons/copy';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import Settings2 from 'lucide-svelte/icons/settings-2';
  import * as S from './stores';
  import { cellKey } from './model';
  import TemplateEditor from './TemplateEditor.svelte';

  const doc = S.doc;
  const selectedWeekId = S.selectedWeekId;
  const templateEditorOpen = S.templateEditorOpen;

  const current = $derived($doc.weeks.find((w) => w.id === $selectedWeekId) ?? null);
</script>

<div class="menu-ws">
  <aside class="weeks">
    <button class="primary" onclick={() => S.addWeek()}><Plus size={15} /> Thêm tuần</button>
    <button onclick={() => S.templateEditorOpen.set(true)}><Settings2 size={15} /> Cấu trúc</button>
    <ul>
      {#each $doc.weeks as w (w.id)}
        <li class:active={w.id === $selectedWeekId}>
          <button class="wk" onclick={() => S.selectWeek(w.id)}>{w.title}</button>
          <button class="icon" aria-label="Nhân bản" onclick={() => S.duplicateWeek(w.id)}><Copy size={13} /></button>
          <button class="icon" aria-label="Xóa" onclick={() => S.deleteWeek(w.id)}><Trash2 size={13} /></button>
        </li>
      {/each}
    </ul>
  </aside>

  <section class="editor">
    {#if current}
      <input class="title" value={current.title}
        onchange={(e) => S.setWeekTitle(current.id, (e.currentTarget as HTMLInputElement).value)} />
      <div class="grid" style={`grid-template-columns: 120px 120px repeat(${$doc.template.days.length}, 1fr);`}>
        <div class="h"></div><div class="h"></div>
        {#each $doc.template.days as d}<div class="h">{d}</div>{/each}
        {#each $doc.template.periods as period (period.id)}
          {#each period.categories as cat, i (cat.id)}
            <div class="h period">{i === 0 ? period.label : ''}</div>
            <div class="h">{cat.hideLabel ? '' : cat.label}</div>
            {#each $doc.template.days as _d, day}
              <input class="cell" value={current.cells[cellKey(cat.id, day)] ?? ''}
                oninput={(e) => S.setCell(current.id, cat.id, day, (e.currentTarget as HTMLInputElement).value)} />
            {/each}
          {/each}
        {/each}
      </div>
    {:else}
      <div class="empty">Chưa có tuần nào. Bấm <strong>Thêm tuần</strong> để bắt đầu.</div>
    {/if}
  </section>
</div>

{#if $templateEditorOpen}<TemplateEditor />{/if}

<style>
  .menu-ws { flex:1; display:flex; min-height:0; background:var(--bg); color:var(--text); }
  .weeks { width:220px; border-right:1px solid var(--border); padding:12px; display:flex; flex-direction:column; gap:8px; overflow:auto; }
  .weeks ul { list-style:none; margin:8px 0 0; padding:0; display:flex; flex-direction:column; gap:2px; }
  .weeks li { display:flex; align-items:center; gap:2px; border-radius:6px; }
  .weeks li.active { background:var(--accent-weak); }
  .wk { flex:1; text-align:left; border:none; background:transparent; color:var(--text); font:inherit; padding:6px 8px; cursor:pointer; border-radius:6px; }
  .weeks button.primary { background:var(--accent); color:#fff; }
  .weeks > button { display:inline-flex; align-items:center; gap:6px; border:1px solid var(--border); background:transparent; color:var(--text); border-radius:8px; padding:7px 10px; cursor:pointer; font:inherit; }
  .icon { border:none; background:transparent; color:var(--text-muted); cursor:pointer; padding:4px; border-radius:5px; }
  .icon:hover { background:var(--accent-weak); color:var(--accent); }
  .editor { flex:1; padding:16px; overflow:auto; }
  .title { font-size:18px; font-weight:700; border:1px solid transparent; background:transparent; color:var(--text); width:100%; padding:4px 6px; border-radius:6px; }
  .title:hover, .title:focus { border-color:var(--border); }
  .grid { display:grid; gap:1px; background:var(--border); border:1px solid var(--border); margin-top:12px; }
  .grid .h { background:var(--surface); padding:6px 8px; font-weight:600; font-size:13px; display:flex; align-items:center; }
  .grid .period { justify-content:center; }
  .cell { border:none; background:var(--bg); color:var(--text); padding:6px 8px; font:inherit; font-size:13px; }
  .cell:focus { outline:2px solid var(--accent); outline-offset:-2px; }
  .empty { color:var(--text-muted); margin-top:40px; text-align:center; }
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- MenuWorkspace && npm run check`
Expected: PASS (2 tests); check 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/modules/menu/Workspace.svelte src/lib/modules/menu/TemplateEditor.svelte tests/MenuWorkspace.test.ts
git commit -m "feat(menu): Workspace week editor + template editor modal"
```

---

## Phase 3 — Dish bank, rotation, ingredient balancing

### Task 9: Dish bank (localStorage library)

**Files:**
- Create: `src/lib/modules/menu/dishBank.ts`
- Test: `tests/menu-dishBank.test.ts`

**Interfaces:**
- Produces: `Dish` type; `loadBank(): Dish[]`; `addDish({name, categoryKey, ingredientType?}): string`; `updateDish(id, patch)`; `removeDish(id)`; `dishesByCategory(key): Dish[]`; `bankVersion: Readable<number>`; `bank: Readable<Dish[]>`; `harvestDishes(entries: {name, categoryKey, ingredientType?}[]): number` (adds only names not already present in that category, returns count added).

- [ ] **Step 1: Write the failing test**

```ts
// tests/menu-dishBank.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import * as B from '../src/lib/modules/menu/dishBank';

beforeEach(() => localStorage.clear());

describe('menu dishBank', () => {
  it('add + read back by category', () => {
    B.addDish({ name: 'Cá kho', categoryKey: 'man', ingredientType: 'ca' });
    B.addDish({ name: 'Rau muống', categoryKey: 'rau' });
    expect(B.dishesByCategory('man').map((d) => d.name)).toEqual(['Cá kho']);
    expect(B.dishesByCategory('rau').length).toBe(1);
  });
  it('update + remove', () => {
    const id = B.addDish({ name: 'Thịt kho', categoryKey: 'man' });
    B.updateDish(id, { ingredientType: 'thit' });
    expect(B.loadBank()[0].ingredientType).toBe('thit');
    B.removeDish(id);
    expect(B.loadBank().length).toBe(0);
  });
  it('bank store recomputes after a mutation', () => {
    expect(get(B.bank).length).toBe(0);
    B.addDish({ name: 'X', categoryKey: 'man' });
    expect(get(B.bank).length).toBe(1);
  });
  it('harvest skips names already present in the same category', () => {
    B.addDish({ name: 'Cá kho', categoryKey: 'man' });
    const added = B.harvestDishes([
      { name: 'Cá kho', categoryKey: 'man' },      // dup → skipped
      { name: 'Cá kho', categoryKey: 'canh' },      // different cat → added
      { name: 'Tôm rim', categoryKey: 'man' },      // new → added
    ]);
    expect(added).toBe(2);
    expect(B.loadBank().length).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- menu-dishBank`
Expected: FAIL — cannot resolve `dishBank`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/modules/menu/dishBank.ts
import { writable, derived, type Readable } from 'svelte/store';
import { uid } from './model';

export interface Dish { id: string; name: string; categoryKey: string; ingredientType?: string; tags?: string[] }

const KEY = 'tomoe.menu.dishBank';
const _version = writable(0);
export const bankVersion: Readable<number> = derived(_version, (n) => n);

export function loadBank(): Dish[] {
  try { const raw = localStorage.getItem(KEY); const arr = raw ? JSON.parse(raw) : []; return Array.isArray(arr) ? arr : []; }
  catch { return []; }
}
function persist(list: Dish[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* ignore */ }
  _version.update((n) => n + 1);
}
export const bank: Readable<Dish[]> = derived(_version, () => loadBank());

export function addDish(entry: { name: string; categoryKey: string; ingredientType?: string }): string {
  const id = uid('dish');
  persist([...loadBank(), { id, name: entry.name.trim(), categoryKey: entry.categoryKey, ingredientType: entry.ingredientType?.trim() || undefined }]);
  return id;
}
export function updateDish(id: string, patch: Partial<Omit<Dish, 'id'>>): void {
  persist(loadBank().map((d) => (d.id === id ? { ...d, ...patch } : d)));
}
export function removeDish(id: string): void { persist(loadBank().filter((d) => d.id !== id)); }
export function dishesByCategory(key: string): Dish[] { return loadBank().filter((d) => d.categoryKey === key); }

export function harvestDishes(entries: { name: string; categoryKey: string; ingredientType?: string }[]): number {
  const list = loadBank();
  const seen = new Set(list.map((d) => `${d.categoryKey}::${d.name.toLowerCase()}`));
  let added = 0;
  for (const e of entries) {
    const name = e.name.trim();
    if (!name) continue;
    const k = `${e.categoryKey}::${name.toLowerCase()}`;
    if (seen.has(k)) continue;
    seen.add(k);
    list.push({ id: uid('dish'), name, categoryKey: e.categoryKey, ingredientType: e.ingredientType?.trim() || undefined });
    added++;
  }
  if (added) persist(list);
  return added;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- menu-dishBank`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/modules/menu/dishBank.ts tests/menu-dishBank.test.ts
git commit -m "feat(menu): dish bank localStorage library"
```

---

### Task 10: `fillWeek` — rotation + ingredient balancing (pure)

**Files:**
- Create: `src/lib/modules/menu/fillWeek.ts`
- Test: `tests/menu-fillWeek.test.ts`

**Interfaces:**
- Consumes: `model.ts` (`MenuTemplate`, `MenuWeek`, `cellKey`), `dishBank.ts` (`Dish`).
- Produces:
  ```ts
  interface FillOpts { mode: 'empty-only' | 'overwrite'; avoidWeeks?: number; rng?: () => number }
  interface FillResult { cells: Record<string, string>; warnings: string[] }
  function fillWeek(template: MenuTemplate, bank: Dish[], recentWeeks: MenuWeek[], target: MenuWeek, opts: FillOpts): FillResult
  ```
  `recentWeeks` = weeks BEFORE the target, most-recent last. Pure: with a supplied `rng` the output is deterministic.

- [ ] **Step 1: Write the failing test**

```ts
// tests/menu-fillWeek.test.ts
import { describe, it, expect } from 'vitest';
import { fillWeek } from '../src/lib/modules/menu/fillWeek';
import { newMenuDoc, cellKey } from '../src/lib/modules/menu/model';
import type { Dish } from '../src/lib/modules/menu/dishBank';

const seq = (vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]; };

describe('fillWeek', () => {
  const { template } = newMenuDoc();
  const com = template.periods[0].categories.find((c) => c.id === 'c_com')!;
  const man = template.periods[0].categories.find((c) => c.id === 'c_man')!;
  const emptyWeek = { id: 'w', title: 'T', cells: {} as Record<string, string> };

  it('fills defaultValue categories with the constant (Cơm trắng) every day', () => {
    const { cells } = fillWeek(template, [], [], emptyWeek, { mode: 'overwrite', rng: () => 0 });
    for (let d = 0; d < template.days.length; d++) expect(cells[cellKey(com.id, d)]).toBe('Cơm trắng');
  });

  it('empty-only keeps an existing hand-edited cell', () => {
    const bank: Dish[] = [{ id: 'd1', name: 'Cá kho', categoryKey: 'man' }, { id: 'd2', name: 'Thịt kho', categoryKey: 'man' }];
    const week = { id: 'w', title: 'T', cells: { [cellKey(man.id, 0)]: 'GIỮ NGUYÊN' } };
    const { cells } = fillWeek(template, bank, [], week, { mode: 'empty-only', rng: () => 0 });
    expect(cells[cellKey(man.id, 0)]).toBe('GIỮ NGUYÊN');
  });

  it('does not repeat a dish within the same week when the bank is large enough', () => {
    const bank: Dish[] = Array.from({ length: 5 }, (_, i) => ({ id: `d${i}`, name: `Man${i}`, categoryKey: 'man' }));
    const { cells } = fillWeek(template, bank, [], emptyWeek, { mode: 'overwrite', rng: () => 0 });
    const picks = template.days.map((_d, day) => cells[cellKey(man.id, day)]);
    expect(new Set(picks).size).toBe(picks.length);
  });

  it('balances ingredientType: with 5 thit + 5 ca, no more than maxPerTypePerWeek (2) of one type appears', () => {
    const bank: Dish[] = [
      ...Array.from({ length: 5 }, (_, i) => ({ id: `t${i}`, name: `Thit${i}`, categoryKey: 'man', ingredientType: 'thit' })),
      ...Array.from({ length: 5 }, (_, i) => ({ id: `c${i}`, name: `Ca${i}`, categoryKey: 'man', ingredientType: 'ca' })),
    ];
    const { cells } = fillWeek(template, bank, [], emptyWeek, { mode: 'overwrite', rng: () => 0 });
    const types = template.days.map((_d, day) => bank.find((b) => b.name === cells[cellKey(man.id, day)])!.ingredientType);
    const thit = types.filter((t) => t === 'thit').length;
    expect(thit).toBeLessThanOrEqual(2);
  });

  it('warns and relaxes when the bank cannot cover a category without repeats', () => {
    const bank: Dish[] = [{ id: 'd1', name: 'Only', categoryKey: 'man' }];
    const { cells, warnings } = fillWeek(template, bank, [], emptyWeek, { mode: 'overwrite', rng: () => 0 });
    expect(cells[cellKey(man.id, 0)]).toBe('Only');
    expect(warnings.some((w) => w.includes('Món mặn'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- menu-fillWeek`
Expected: FAIL — cannot resolve `fillWeek`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/modules/menu/fillWeek.ts
import { cellKey, type MenuTemplate, type MenuWeek, type MenuCategory } from './model';
import type { Dish } from './dishBank';

export interface FillOpts { mode: 'empty-only' | 'overwrite'; avoidWeeks?: number; rng?: () => number }
export interface FillResult { cells: Record<string, string>; warnings: string[] }

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1)) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Names used in the last `avoidWeeks` weeks for a given category, keyed by categoryId. */
function recentNames(recentWeeks: MenuWeek[], catId: string, avoidWeeks: number, nDays: number): Set<string> {
  const set = new Set<string>();
  const slice = recentWeeks.slice(-avoidWeeks);
  for (const w of slice) for (let d = 0; d < nDays; d++) {
    const v = w.cells[cellKey(catId, d)];
    if (v) set.add(v);
  }
  return set;
}

function pickForCategory(
  cat: MenuCategory, bank: Dish[], nDays: number, recent: Set<string>, rng: () => number,
): { values: string[]; relaxed: boolean } {
  const candidates = shuffle(bank.filter((d) => d.categoryKey === cat.key), rng);
  const values: string[] = [];
  const usedNames = new Set<string>();
  const typeCount = new Map<string, number>();
  const cap = cat.maxPerTypePerWeek ?? 2;
  let relaxed = false;

  for (let day = 0; day < nDays; day++) {
    // Tiered candidate filters, from strict to relaxed. First non-empty tier wins.
    const notUsed = candidates.filter((d) => !usedNames.has(d.name));
    const notRecent = notUsed.filter((d) => !recent.has(d.name));
    const balanced = cat.balanceByIngredient
      ? (() => {
          const min = Math.min(...notRecent.map((d) => typeCount.get(d.ingredientType ?? '') ?? 0), Infinity);
          return notRecent.filter((d) => (typeCount.get(d.ingredientType ?? '') ?? 0) === min
            && (typeCount.get(d.ingredientType ?? '') ?? 0) < cap);
        })()
      : notRecent;

    let pool = balanced;
    if (!pool.length) { pool = notRecent; }             // relax balance/cap
    if (!pool.length) { pool = notUsed; relaxed = true; } // relax recent window
    if (!pool.length) { pool = candidates; relaxed = true; } // relax in-week uniqueness
    if (!pool.length) { values.push(''); continue; }      // truly empty bank for this category

    const chosen = pool[0];
    values.push(chosen.name);
    usedNames.add(chosen.name);
    const t = chosen.ingredientType ?? '';
    typeCount.set(t, (typeCount.get(t) ?? 0) + 1);
  }
  return { values, relaxed };
}

export function fillWeek(
  template: MenuTemplate, bank: Dish[], recentWeeks: MenuWeek[], target: MenuWeek, opts: FillOpts,
): FillResult {
  const rng = opts.rng ?? Math.random;
  const avoidWeeks = opts.avoidWeeks ?? 2;
  const nDays = template.days.length;
  const cells: Record<string, string> = { ...target.cells };
  const warnings: string[] = [];

  for (const period of template.periods) {
    for (const cat of period.categories) {
      if (cat.defaultValue) {
        for (let d = 0; d < nDays; d++) {
          const k = cellKey(cat.id, d);
          if (opts.mode === 'overwrite' || !cells[k]) cells[k] = cat.defaultValue;
        }
        continue;
      }
      const recent = recentNames(recentWeeks, cat.id, avoidWeeks, nDays);
      const { values, relaxed } = pickForCategory(cat, bank, nDays, recent, rng);
      for (let d = 0; d < nDays; d++) {
        const k = cellKey(cat.id, d);
        if (opts.mode === 'empty-only' && cells[k]) continue;
        cells[k] = values[d] ?? '';
      }
      if (relaxed || values.some((v) => v === '')) {
        warnings.push(`Kho món chưa đủ cho nhóm "${cat.label}" — có thể lặp hoặc còn ô trống.`);
      }
    }
  }
  return { cells, warnings };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- menu-fillWeek`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/modules/menu/fillWeek.ts tests/menu-fillWeek.test.ts
git commit -m "feat(menu): fillWeek — rotation + ingredient balancing"
```

---

### Task 11: Store actions — fill, re-roll a cell, harvest

**Files:**
- Modify: `src/lib/modules/menu/stores.ts` (append)
- Test: `tests/menu-stores.test.ts` (append)

**Interfaces:**
- Consumes: `fillWeek.ts` (`fillWeek`), `dishBank.ts` (`loadBank`, `harvestDishes`, `dishesByCategory`), shell `showToast`.
- Produces: `fillCurrentWeek(mode)`, `rerollCell(weekId, catId, dayIndex)`, `harvestCurrentWeek(): number`. `fillCurrentWeek` commits the filled cells and toasts any warnings.

- [ ] **Step 1: Write the failing test (append)**

```ts
// tests/menu-stores.test.ts — append
import * as B from '../src/lib/modules/menu/dishBank';

describe('menu fill/harvest actions', () => {
  beforeEach(() => { S.initDoc(); localStorage.clear(); });
  it('fillCurrentWeek fills default + bank-backed categories', () => {
    B.addDish({ name: 'Cá kho', categoryKey: 'man' });
    S.addWeek();
    S.fillCurrentWeek('overwrite');
    const w = get(S.doc).weeks[0];
    const com = get(S.doc).template.periods[0].categories.find((c) => c.id === 'c_com')!;
    const man = get(S.doc).template.periods[0].categories.find((c) => c.id === 'c_man')!;
    expect(w.cells[`${com.id}:0`]).toBe('Cơm trắng');
    expect(w.cells[`${man.id}:0`]).toBe('Cá kho');
  });
  it('rerollCell replaces one cell using the bank', () => {
    B.addDish({ name: 'Tôm rim', categoryKey: 'man' });
    S.addWeek();
    const w = get(S.doc).weeks[0];
    const man = get(S.doc).template.periods[0].categories.find((c) => c.id === 'c_man')!;
    S.rerollCell(w.id, man.id, 0);
    expect(get(S.doc).weeks[0].cells[`${man.id}:0`]).toBe('Tôm rim');
  });
  it('harvestCurrentWeek adds current cells into the bank', () => {
    S.addWeek();
    const w = get(S.doc).weeks[0];
    const man = get(S.doc).template.periods[0].categories.find((c) => c.id === 'c_man')!;
    S.setCell(w.id, man.id, 0, 'Gà kho sả');
    const added = S.harvestCurrentWeek();
    expect(added).toBeGreaterThanOrEqual(1);
    expect(B.dishesByCategory('man').some((d) => d.name === 'Gà kho sả')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- menu-stores`
Expected: FAIL — `fillCurrentWeek` is not a function.

- [ ] **Step 3: Write the implementation (append to `stores.ts`)**

```ts
// src/lib/modules/menu/stores.ts — append
import { fillWeek } from './fillWeek';
import { loadBank, harvestDishes, dishesByCategory } from './dishBank';
import { showToast } from '../../shell';

/** Weeks positioned before the given week id, in document order. */
function weeksBefore(weekId: string): MenuWeek[] {
  const p = get(doc);
  const i = p.weeks.findIndex((w) => w.id === weekId);
  return i <= 0 ? [] : p.weeks.slice(0, i);
}

export function fillCurrentWeek(mode: 'empty-only' | 'overwrite'): void {
  const id = get(selectedWeekId);
  const p = get(doc);
  const week = p.weeks.find((w) => w.id === id);
  if (!week) return;
  const { cells, warnings } = fillWeek(p.template, loadBank(), weeksBefore(week.id), week, { mode });
  commit({ ...get(doc), weeks: get(doc).weeks.map((w) => (w.id === week.id ? { ...w, cells } : w)) });
  if (warnings.length) showToast(warnings[0], 'error');
}

export function rerollCell(weekId: string, catId: string, dayIndex: number): void {
  const p = get(doc);
  const cat = p.template.periods.flatMap((pr) => pr.categories).find((c) => c.id === catId);
  if (!cat) return;
  const week = p.weeks.find((w) => w.id === weekId);
  if (!week) return;
  if (cat.defaultValue) { setCell(weekId, catId, dayIndex, cat.defaultValue); return; }
  const current = week.cells[cellKey(catId, dayIndex)] ?? '';
  const pool = dishesByCategory(cat.key).filter((d) => d.name !== current);
  const src = pool.length ? pool : dishesByCategory(cat.key);
  if (!src.length) { showToast(`Kho món chưa có nhóm "${cat.label}"`, 'error'); return; }
  const chosen = src[Math.floor(Math.random() * src.length)];
  setCell(weekId, catId, dayIndex, chosen.name);
}

export function harvestCurrentWeek(): number {
  const id = get(selectedWeekId);
  const p = get(doc);
  const week = p.weeks.find((w) => w.id === id);
  if (!week) return 0;
  const entries: { name: string; categoryKey: string }[] = [];
  for (const period of p.template.periods) for (const cat of period.categories) {
    if (cat.defaultValue) continue;
    for (let d = 0; d < p.template.days.length; d++) {
      const v = week.cells[cellKey(cat.id, d)];
      if (v) entries.push({ name: v, categoryKey: cat.key });
    }
  }
  const added = harvestDishes(entries);
  showToast(added ? `Đã thêm ${added} món vào kho` : 'Không có món mới để thêm');
  return added;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- menu-stores`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/modules/menu/stores.ts tests/menu-stores.test.ts
git commit -m "feat(menu): fill week / reroll cell / harvest-to-bank actions"
```

---

### Task 12: Dish Bank modal + fill/re-roll UI

**Files:**
- Create: `src/lib/modules/menu/DishBankModal.svelte`
- Modify: `src/lib/modules/menu/Workspace.svelte` (add fill buttons, per-cell re-roll, open bank button)
- Test: `tests/MenuWorkspace.test.ts` (append)

**Interfaces:**
- Consumes: `dishBank.ts` (`bank`, `addDish`, `updateDish`, `removeDish`), `stores.ts` (`dishBankOpen`, `fillCurrentWeek`, `rerollCell`, `harvestCurrentWeek`).

- [ ] **Step 1: Write the failing test (append)**

```ts
// tests/MenuWorkspace.test.ts — append
import * as B2 from '../src/lib/modules/menu/dishBank';

describe('MenuWorkspace fill', () => {
  beforeEach(() => { S.initDoc(); localStorage.clear(); });
  it('"Tự bốc cả tuần (đè)" fills default cells', async () => {
    S.addWeek();
    render(Workspace);
    await fireEvent.click(screen.getByRole('button', { name: /bốc đè/i }));
    const com = get(S.doc).template.periods[0].categories.find((c) => c.id === 'c_com')!;
    expect(get(S.doc).weeks[0].cells[`${com.id}:0`]).toBe('Cơm trắng');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- MenuWorkspace`
Expected: FAIL — no "bốc đè" button.

- [ ] **Step 3: Write the implementations**

```svelte
<!-- src/lib/modules/menu/DishBankModal.svelte -->
<script lang="ts">
  import X from 'lucide-svelte/icons/x';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import Plus from 'lucide-svelte/icons/plus';
  import * as S from './stores';
  import { bank, addDish, updateDish, removeDish } from './dishBank';

  let name = $state('');
  let categoryKey = $state('man');
  let ingredientType = $state('');

  function add() {
    if (!name.trim()) return;
    addDish({ name, categoryKey, ingredientType: ingredientType || undefined });
    name = ''; ingredientType = '';
  }
  function close() { S.dishBankOpen.set(false); }
  const grouped = $derived(Object.entries(
    $bank.reduce((m, d) => { (m[d.categoryKey] ??= []).push(d); return m; }, {} as Record<string, typeof $bank>)));
</script>

<div class="backdrop" role="presentation" onclick={close}>
  <div class="panel" role="dialog" aria-label="Kho món" onclick={(e) => e.stopPropagation()}>
    <header><h2>Kho món</h2><button class="icon" aria-label="Đóng" onclick={close}><X size={18} /></button></header>
    <div class="add-row">
      <input placeholder="Tên món" bind:value={name} />
      <input placeholder="nhóm (mã)" bind:value={categoryKey} class="k" />
      <input placeholder="nguyên liệu" bind:value={ingredientType} class="k" />
      <button class="primary" onclick={add}><Plus size={14} /> Thêm</button>
    </div>
    {#each grouped as [key, dishes] (key)}
      <h3>{key}</h3>
      <ul>
        {#each dishes as d (d.id)}
          <li>
            <input value={d.name} onchange={(e) => updateDish(d.id, { name: (e.currentTarget as HTMLInputElement).value })} />
            <input class="k" value={d.ingredientType ?? ''} placeholder="nguyên liệu"
              onchange={(e) => updateDish(d.id, { ingredientType: (e.currentTarget as HTMLInputElement).value || undefined })} />
            <button class="icon" aria-label="Xóa món" onclick={() => removeDish(d.id)}><Trash2 size={14} /></button>
          </li>
        {/each}
      </ul>
    {/each}
    <button class="harvest" onclick={() => S.harvestCurrentWeek()}>Gom món từ tuần hiện tại vào kho</button>
  </div>
</div>

<style>
  .backdrop { position:fixed; inset:0; background:rgba(0,0,0,.4); display:flex; align-items:center; justify-content:center; z-index:50; }
  .panel { background:var(--surface); color:var(--text); border:1px solid var(--border); border-radius:12px; padding:16px 20px; width:min(680px,92vw); max-height:88vh; overflow:auto; }
  header { display:flex; align-items:center; justify-content:space-between; }
  h2 { margin:0; font-size:16px; } h3 { margin:14px 0 4px; font-size:13px; color:var(--text-muted); text-transform:uppercase; }
  .add-row { display:flex; gap:6px; margin-top:10px; }
  ul { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:3px; }
  li { display:flex; gap:6px; align-items:center; }
  input { border:1px solid var(--border); border-radius:6px; padding:5px 7px; background:var(--bg); color:var(--text); font:inherit; flex:1; }
  input.k { flex:0 0 110px; }
  .primary { background:var(--accent); color:#fff; border:none; border-radius:6px; padding:5px 12px; cursor:pointer; display:inline-flex; align-items:center; gap:5px; }
  .icon { border:none; background:transparent; color:var(--text-muted); cursor:pointer; padding:4px; border-radius:5px; }
  .icon:hover { background:var(--accent-weak); color:var(--accent); }
  .harvest { margin-top:16px; border:1px dashed var(--border); background:transparent; color:var(--accent); border-radius:6px; padding:7px 12px; cursor:pointer; font:inherit; width:100%; }
</style>
```

In `Workspace.svelte`: add imports and a toolbar above the grid, a per-cell re-roll button, and render the modal.

```svelte
<!-- src/lib/modules/menu/Workspace.svelte — add to <script> imports -->
  import Dices from 'lucide-svelte/icons/dices';
  import BookOpen from 'lucide-svelte/icons/book-open';
  import RefreshCw from 'lucide-svelte/icons/refresh-cw';
  import DishBankModal from './DishBankModal.svelte';
  const dishBankOpen = S.dishBankOpen;
```

```svelte
<!-- src/lib/modules/menu/Workspace.svelte — inside <section class="editor">, right after the <input class="title"> -->
      <div class="actions">
        <button onclick={() => S.fillCurrentWeek('empty-only')}><Dices size={14} /> Bốc ô trống</button>
        <button onclick={() => S.fillCurrentWeek('overwrite')}><Dices size={14} /> Bốc đè cả tuần</button>
        <button onclick={() => S.dishBankOpen.set(true)}><BookOpen size={14} /> Kho món</button>
      </div>
```

```svelte
<!-- src/lib/modules/menu/Workspace.svelte — replace the day cell <input class="cell"> with a wrapper carrying a re-roll button -->
            {#each $doc.template.days as _d, day}
              <div class="cellwrap">
                <input class="cell" value={current.cells[cellKey(cat.id, day)] ?? ''}
                  oninput={(e) => S.setCell(current.id, cat.id, day, (e.currentTarget as HTMLInputElement).value)} />
                <button class="reroll" aria-label="Bốc lại ô" title="Bốc lại"
                  onclick={() => S.rerollCell(current.id, cat.id, day)}><RefreshCw size={12} /></button>
              </div>
            {/each}
```

```svelte
<!-- src/lib/modules/menu/Workspace.svelte — add near the TemplateEditor render at the bottom -->
{#if $dishBankOpen}<DishBankModal />{/if}
```

```svelte
<!-- src/lib/modules/menu/Workspace.svelte — add to <style> -->
  .actions { display:flex; gap:8px; margin-top:8px; }
  .actions button { display:inline-flex; align-items:center; gap:6px; border:1px solid var(--border); background:transparent; color:var(--text); border-radius:8px; padding:6px 10px; cursor:pointer; font:inherit; }
  .actions button:hover { background:var(--accent-weak); color:var(--accent); }
  .cellwrap { position:relative; display:flex; }
  .cellwrap .cell { flex:1; }
  .reroll { position:absolute; right:2px; top:50%; transform:translateY(-50%); border:none; background:transparent; color:var(--text-muted); opacity:0; cursor:pointer; padding:2px; border-radius:4px; }
  .cellwrap:hover .reroll { opacity:1; }
  .reroll:hover { background:var(--accent-weak); color:var(--accent); }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- MenuWorkspace && npm run check`
Expected: PASS; check 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/modules/menu/DishBankModal.svelte src/lib/modules/menu/Workspace.svelte tests/MenuWorkspace.test.ts
git commit -m "feat(menu): dish bank modal + fill/re-roll UI"
```

---

## Phase 4 — Export

### Task 13: PNG export

**Files:**
- Create: `src/lib/modules/menu/export/exportImage.ts`
- Test: `tests/menu-export.test.ts`

**Interfaces:**
- Consumes: `render.ts` (`renderWeekTable`), `html-to-image` (`toPng`), `@tauri-apps/plugin-dialog` (`save`), `@tauri-apps/plugin-fs` (`writeFile`), shell `showToast`, `model.ts` types.
- Produces: `exportWeekPng(week, template, settings, opts?): Promise<void>` — renders the table offscreen at a fixed width on white, rasterizes via `toPng`, prompts for a path (default filename from the week title), writes the decoded bytes. `slugifyTitle(title): string`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/menu-export.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const toPng = vi.fn(async () => 'data:image/png;base64,iVBORw0KGgo=');
const saveDialog = vi.fn(async () => '/tmp/tuan-2.png');
const writeFile = vi.fn(async () => {});
vi.mock('html-to-image', () => ({ toPng: (...a: any[]) => toPng(...a) }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ save: (...a: any[]) => saveDialog(...a) }));
vi.mock('@tauri-apps/plugin-fs', () => ({ writeFile: (...a: any[]) => writeFile(...a) }));

import { exportWeekPng, slugifyTitle } from '../src/lib/modules/menu/export/exportImage';
import { newMenuDoc } from '../src/lib/modules/menu/model';

beforeEach(() => { toPng.mockClear(); saveDialog.mockClear(); writeFile.mockClear(); });

describe('menu PNG export', () => {
  it('slugifyTitle strips Vietnamese diacritics + punctuation', () => {
    expect(slugifyTitle('Thực đơn tháng 6 - Tuần 2')).toBe('thuc-don-thang-6-tuan-2');
  });
  it('renders, rasterizes and writes decoded PNG bytes', async () => {
    const { template, settings } = newMenuDoc();
    await exportWeekPng({ id: 'w', title: 'Tuần 2', cells: {} }, template, settings);
    expect(toPng).toHaveBeenCalledOnce();
    expect(saveDialog).toHaveBeenCalledOnce();
    expect(writeFile.mock.calls[0][1]).toBeInstanceOf(Uint8Array);
  });
  it('does nothing if the save dialog is cancelled', async () => {
    saveDialog.mockResolvedValueOnce(null as any);
    const { template, settings } = newMenuDoc();
    await exportWeekPng({ id: 'w', title: 'T', cells: {} }, template, settings);
    expect(writeFile).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- menu-export`
Expected: FAIL — cannot resolve `exportImage`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/modules/menu/export/exportImage.ts
import { toPng } from 'html-to-image';
import { save as saveDialog } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { renderWeekTable } from '../render';
import { showToast } from '../../../shell';
import type { MenuWeek, MenuTemplate, MenuStyle } from '../model';

export function slugifyTitle(title: string): string {
  return title.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'd')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'thuc-don';
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const b64 = dataUrl.split(',')[1] ?? '';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Render the week table into a detached, offscreen node at a fixed width on white, rasterize,
 *  then prompt + write. Width is fixed so the PNG is crisp and consistent regardless of viewport. */
export async function exportWeekPng(
  week: MenuWeek, template: MenuTemplate, settings: MenuStyle, opts?: { width?: number; pixelRatio?: number },
): Promise<void> {
  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:-99999px;top:0;width:${opts?.width ?? 1000}px;background:#fff;padding:16px;`;
  host.innerHTML = renderWeekTable(week, template, settings);
  document.body.appendChild(host);
  try {
    const dataUrl = await toPng(host, { pixelRatio: opts?.pixelRatio ?? 2, backgroundColor: '#ffffff' });
    const path = await saveDialog({ defaultPath: `${slugifyTitle(week.title)}.png`, filters: [{ name: 'PNG', extensions: ['png'] }] });
    if (!path) return;
    await writeFile(path, dataUrlToBytes(dataUrl));
    showToast('Đã xuất PNG');
  } catch (e) {
    showToast(`Không xuất được ảnh: ${(e as Error).message}`, 'error');
  } finally {
    document.body.removeChild(host);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- menu-export`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/modules/menu/export/exportImage.ts tests/menu-export.test.ts
git commit -m "feat(menu): PNG export via html-to-image"
```

---

### Task 14: PDF export + print

**Files:**
- Create: `src/lib/modules/menu/export/exportPdf.ts`
- Test: `tests/menu-export.test.ts` (append)

**Interfaces:**
- Consumes: `exportImage.ts` internals are NOT reused; this renders its own offscreen node, uses `html-to-image` `toPng` to get an image, then `jspdf` to place it. `@tauri-apps/plugin-dialog` (`save`), `@tauri-apps/plugin-fs` (`writeFile`).
- Produces: `exportWeekPdf(week, template, settings): Promise<void>`.

- [ ] **Step 1: Write the failing test (append)**

```ts
// tests/menu-export.test.ts — append
const addImage = vi.fn();
const pdfSave = vi.fn();
const output = vi.fn(() => new ArrayBuffer(8));
vi.mock('jspdf', () => ({ default: vi.fn().mockImplementation(() => ({
  addImage, save: pdfSave, output,
  internal: { pageSize: { getWidth: () => 297, getHeight: () => 210 } },
})) }));

import { exportWeekPdf } from '../src/lib/modules/menu/export/exportPdf';
import { newMenuDoc as ndoc } from '../src/lib/modules/menu/model';

describe('menu PDF export', () => {
  it('rasterizes then places the image into a jsPDF doc and writes it', async () => {
    const { template, settings } = ndoc();
    await exportWeekPdf({ id: 'w', title: 'Tuần 2', cells: {} }, template, settings);
    expect(addImage).toHaveBeenCalledOnce();
    expect(writeFile).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- menu-export`
Expected: FAIL — cannot resolve `exportPdf`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/modules/menu/export/exportPdf.ts
import { toPng } from 'html-to-image';
import jsPDF from 'jspdf';
import { save as saveDialog } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { renderWeekTable } from '../render';
import { slugifyTitle } from './exportImage';
import { showToast } from '../../../shell';
import type { MenuWeek, MenuTemplate, MenuStyle } from '../model';

export async function exportWeekPdf(week: MenuWeek, template: MenuTemplate, settings: MenuStyle): Promise<void> {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-99999px;top:0;width:1000px;background:#fff;padding:16px;';
  host.innerHTML = renderWeekTable(week, template, settings);
  document.body.appendChild(host);
  try {
    const dataUrl = await toPng(host, { pixelRatio: 2, backgroundColor: '#ffffff' });
    const landscape = settings.orientation === 'landscape';
    const pdf = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'mm', format: settings.paperSize.toLowerCase() as any });
    const pw = pdf.internal.pageSize.getWidth();
    const margin = 8;
    const imgW = pw - margin * 2;
    // Preserve aspect ratio from the rendered node.
    const ratio = host.offsetHeight / host.offsetWidth || 0.5;
    pdf.addImage(dataUrl, 'PNG', margin, margin, imgW, imgW * ratio);
    const path = await saveDialog({ defaultPath: `${slugifyTitle(week.title)}.pdf`, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    if (!path) return;
    await writeFile(path, new Uint8Array(pdf.output('arraybuffer')));
    showToast('Đã xuất PDF');
  } catch (e) {
    showToast(`Không xuất được PDF: ${(e as Error).message}`, 'error');
  } finally {
    document.body.removeChild(host);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- menu-export`
Expected: PASS (all export tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/modules/menu/export/exportPdf.ts tests/menu-export.test.ts
git commit -m "feat(menu): PDF export via jspdf"
```

---

### Task 15: Export buttons + live preview in Workspace

**Files:**
- Modify: `src/lib/modules/menu/Workspace.svelte`
- Test: `tests/MenuWorkspace.test.ts` (append)

**Interfaces:**
- Consumes: `export/exportImage.ts` (`exportWeekPng`), `export/exportPdf.ts` (`exportWeekPdf`), `render.ts` (`renderWeekTable`).

- [ ] **Step 1: Write the failing test (append)**

```ts
// tests/MenuWorkspace.test.ts — append
vi.mock('../src/lib/modules/menu/export/exportImage', () => ({ exportWeekPng: vi.fn(), slugifyTitle: (s: string) => s }));
vi.mock('../src/lib/modules/menu/export/exportPdf', () => ({ exportWeekPdf: vi.fn() }));
import { exportWeekPng } from '../src/lib/modules/menu/export/exportImage';

describe('MenuWorkspace export', () => {
  beforeEach(() => S.initDoc());
  it('clicking "Xuất PNG" calls exportWeekPng for the current week', async () => {
    S.addWeek();
    render(Workspace);
    await fireEvent.click(screen.getByRole('button', { name: /xuất png/i }));
    expect(exportWeekPng).toHaveBeenCalledOnce();
  });
});
```

Note: the `vi.mock` calls above must sit at the top of the test file with the other mocks (hoisted). Move them there when appending.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- MenuWorkspace`
Expected: FAIL — no "Xuất PNG" button.

- [ ] **Step 3: Write the implementation (edit `Workspace.svelte`)**

```svelte
<!-- src/lib/modules/menu/Workspace.svelte — add to <script> imports -->
  import ImageDown from 'lucide-svelte/icons/image-down';
  import FileDown from 'lucide-svelte/icons/file-down';
  import { renderWeekTable } from './render';
  import { exportWeekPng } from './export/exportImage';
  import { exportWeekPdf } from './export/exportPdf';

  const previewHtml = $derived(current ? renderWeekTable(current, $doc.template, $doc.settings) : '');
```

```svelte
<!-- src/lib/modules/menu/Workspace.svelte — add two buttons to the .actions row -->
        <button onclick={() => current && exportWeekPng(current, $doc.template, $doc.settings)}><ImageDown size={14} /> Xuất PNG</button>
        <button onclick={() => current && exportWeekPdf(current, $doc.template, $doc.settings)}><FileDown size={14} /> Xuất PDF</button>
```

```svelte
<!-- src/lib/modules/menu/Workspace.svelte — add a live preview below the .grid (inside {#if current}) -->
      <h3 class="pv-title">Xem trước</h3>
      <div class="preview">{@html previewHtml}</div>
```

```svelte
<!-- src/lib/modules/menu/Workspace.svelte — add to <style> -->
  .pv-title { margin:18px 0 6px; font-size:12px; color:var(--text-muted); text-transform:uppercase; }
  .preview { overflow-x:auto; }
```

- [ ] **Step 4: Run test + typecheck**

Run: `npm test -- MenuWorkspace && npm run check`
Expected: PASS; check 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/modules/menu/Workspace.svelte tests/MenuWorkspace.test.ts
git commit -m "feat(menu): export buttons + live table preview"
```

---

## Phase 5 — AI week generation

### Task 16: AI service — `generateWeek`

**Files:**
- Create: `src/lib/modules/menu/ai.ts`
- Test: `tests/menu-ai.test.ts`

**Interfaces:**
- Consumes: `@anthropic-ai/sdk` (default export `Anthropic`), `model.ts` (`MenuTemplate`).
- Produces: `AiConfig` type; `DEFAULT_AI_MODEL`; `loadAiConfig()`, `setAiConfig(patch)`, `aiConfig` store; `generateWeek(config, template, instruction): Promise<{ cells: Record<string,string>; newDishes: {name;categoryKey;ingredientType?}[] }>`. The prompt tells the model the template's categories (id + key + label) and days, and asks for JSON `{ cells: { "<categoryId>:<dayIndex>": "..." }, newDishes: [...] }`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/menu-ai.test.ts
import { describe, it, expect, vi } from 'vitest';

const create = vi.fn(async () => ({
  content: [{ type: 'text', text: '{"cells":{"c_man:0":"Cá kho"},"newDishes":[{"name":"Cá kho","categoryKey":"man","ingredientType":"ca"}]}' }],
}));
vi.mock('@anthropic-ai/sdk', () => ({ default: vi.fn().mockImplementation(() => ({ messages: { create } })) }));

import { generateWeek } from '../src/lib/modules/menu/ai';
import { newMenuDoc } from '../src/lib/modules/menu/model';

describe('menu ai generateWeek', () => {
  it('parses cells + newDishes out of the model JSON response', async () => {
    const { template } = newMenuDoc();
    const res = await generateWeek({ apiKey: 'k', model: 'claude-x' }, template, 'thực đơn tháng 6, mầm non');
    expect(res.cells['c_man:0']).toBe('Cá kho');
    expect(res.newDishes[0].categoryKey).toBe('man');
    expect(create).toHaveBeenCalledOnce();
  });
  it('returns empty result when there is no api key', async () => {
    const { template } = newMenuDoc();
    const res = await generateWeek({ apiKey: '', model: 'claude-x' }, template, 'x');
    expect(res.cells).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- menu-ai`
Expected: FAIL — cannot resolve `ai`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/modules/menu/ai.ts
import Anthropic from '@anthropic-ai/sdk';
import { writable, derived, type Readable } from 'svelte/store';
import type { MenuTemplate } from './model';

export interface AiConfig { apiKey: string; model: string }
export const DEFAULT_AI_MODEL = 'claude-haiku-4-5-20251001';

export function loadAiConfig(): AiConfig {
  try {
    return {
      apiKey: localStorage.getItem('tomoe.ai.apiKey') ?? '',
      model: localStorage.getItem('tomoe.menu.ai.model') ?? DEFAULT_AI_MODEL,
    };
  } catch { return { apiKey: '', model: DEFAULT_AI_MODEL }; }
}
const _cfg = writable<AiConfig>(loadAiConfig());
export const aiConfig: Readable<AiConfig> = derived(_cfg, (c) => c);
export function setAiConfig(patch: Partial<AiConfig>): void {
  _cfg.update((c) => {
    const next = { ...c, ...patch };
    try {
      if (patch.apiKey !== undefined) localStorage.setItem('tomoe.ai.apiKey', next.apiKey);
      if (patch.model !== undefined) localStorage.setItem('tomoe.menu.ai.model', next.model);
    } catch { /* ignore */ }
    return next;
  });
}

export interface GenWeekResult { cells: Record<string, string>; newDishes: { name: string; categoryKey: string; ingredientType?: string }[] }

function buildPrompt(template: MenuTemplate, instruction: string): string {
  const cats = template.periods.flatMap((p) =>
    p.categories.map((c) => `- id="${c.id}" key="${c.key}" nhóm="${c.label}"${c.defaultValue ? ` (mặc định: ${c.defaultValue})` : ''}`)).join('\n');
  return [
    'Bạn là trợ lý lên thực đơn cho trường mầm non Việt Nam.',
    `Số ngày trong tuần: ${template.days.length} (${template.days.join(', ')}), dayIndex chạy 0..${template.days.length - 1}.`,
    'Các nhóm món:', cats,
    `Yêu cầu người dùng: ${instruction}`,
    'Trả về DUY NHẤT một JSON hợp lệ, không văn bản khác, dạng:',
    '{"cells": {"<categoryId>:<dayIndex>": "Tên món"}, "newDishes": [{"name":"...","categoryKey":"<key>","ingredientType":"thit|ca|trung|tom|..."}]}',
    'Đa dạng nguyên liệu trong tuần (đừng lặp toàn thịt hoặc toàn cá).',
  ].join('\n');
}

function extractJson(text: string): any {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) return {};
  return JSON.parse(text.slice(start, end + 1));
}

export async function generateWeek(config: AiConfig, template: MenuTemplate, instruction: string): Promise<GenWeekResult> {
  if (!config.apiKey) return { cells: {}, newDishes: [] };
  const client = new Anthropic({ apiKey: config.apiKey, dangerouslyAllowBrowser: true });
  const resp: any = await client.messages.create({
    model: config.model, max_tokens: 2048,
    messages: [{ role: 'user', content: buildPrompt(template, instruction) }],
  });
  const text = (resp.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
  let parsed: any = {};
  try { parsed = extractJson(text); } catch { parsed = {}; }
  const cells: Record<string, string> = {};
  if (parsed.cells && typeof parsed.cells === 'object') {
    for (const [k, v] of Object.entries(parsed.cells)) if (typeof v === 'string') cells[k] = v;
  }
  const newDishes = Array.isArray(parsed.newDishes)
    ? parsed.newDishes.filter((d: any) => d && typeof d.name === 'string' && typeof d.categoryKey === 'string')
        .map((d: any) => ({ name: d.name, categoryKey: d.categoryKey, ingredientType: typeof d.ingredientType === 'string' ? d.ingredientType : undefined }))
    : [];
  return { cells, newDishes };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- menu-ai`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/modules/menu/ai.ts tests/menu-ai.test.ts
git commit -m "feat(menu): AI generateWeek (Anthropic) + config"
```

---

### Task 17: AI modal + store wiring + Workspace button

**Files:**
- Create: `src/lib/modules/menu/AiWeekModal.svelte`
- Modify: `src/lib/modules/menu/stores.ts` (append `aiGenerateCurrentWeek`)
- Modify: `src/lib/modules/menu/Workspace.svelte` (AI button + render modal)
- Test: `tests/menu-stores.test.ts` (append)

**Interfaces:**
- Produces (in `stores.ts`): `aiGenerateCurrentWeek(instruction): Promise<number>` — calls `generateWeek` with `loadAiConfig()`, applies returned cells to the current week (`commit`), harvests `newDishes` into the bank, returns the number of cells applied.

- [ ] **Step 1: Write the failing test (append)**

```ts
// tests/menu-stores.test.ts — append (place the vi.mock at the top of the file with other hoisted mocks)
vi.mock('../src/lib/modules/menu/ai', () => ({
  loadAiConfig: () => ({ apiKey: 'k', model: 'm' }),
  generateWeek: vi.fn(async () => ({ cells: { 'c_man:0': 'Cá kho' }, newDishes: [{ name: 'Cá kho', categoryKey: 'man' }] })),
}));

describe('menu AI action', () => {
  beforeEach(() => { S.initDoc(); localStorage.clear(); });
  it('aiGenerateCurrentWeek applies returned cells + harvests dishes', async () => {
    S.addWeek();
    const n = await S.aiGenerateCurrentWeek('thực đơn tháng 6');
    expect(n).toBe(1);
    expect(get(S.doc).weeks[0].cells['c_man:0']).toBe('Cá kho');
    expect(B.dishesByCategory('man').some((d) => d.name === 'Cá kho')).toBe(true);
  });
});
```

Note: `import { vi } from 'vitest'` must be present at the top of the test file.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- menu-stores`
Expected: FAIL — `aiGenerateCurrentWeek` is not a function.

- [ ] **Step 3: Write the implementations**

```ts
// src/lib/modules/menu/stores.ts — append
import { generateWeek, loadAiConfig } from './ai';
import { harvestDishes as _harvest } from './dishBank';

export async function aiGenerateCurrentWeek(instruction: string): Promise<number> {
  const id = get(selectedWeekId);
  const p = get(doc);
  const week = p.weeks.find((w) => w.id === id);
  if (!week) return 0;
  const { cells, newDishes } = await generateWeek(loadAiConfig(), p.template, instruction);
  const n = Object.keys(cells).length;
  if (n) {
    commit({ ...get(doc), weeks: get(doc).weeks.map((w) => (w.id === week.id ? { ...w, cells: { ...w.cells, ...cells } } : w)) });
  }
  if (newDishes.length) _harvest(newDishes);
  showToast(n ? `AI đã điền ${n} ô` : 'AI không trả về kết quả', n ? 'success' : 'error');
  return n;
}
```

(`showToast(message, kind: 'success' | 'error' = 'success')` — the `'success'` kind is supported, verified in `src/lib/shell.ts`.)

```svelte
<!-- src/lib/modules/menu/AiWeekModal.svelte -->
<script lang="ts">
  import X from 'lucide-svelte/icons/x';
  import Sparkles from 'lucide-svelte/icons/sparkles';
  import * as S from './stores';
  import { aiConfig, setAiConfig } from './ai';

  let instruction = $state('Thực đơn 1 tuần cho trường mầm non, món Việt, đa dạng nguyên liệu.');
  let busy = $state(false);
  const cfg = aiConfig;

  async function run() {
    busy = true;
    try { await S.aiGenerateCurrentWeek(instruction); S.aiModalOpen.set(false); }
    finally { busy = false; }
  }
  function close() { S.aiModalOpen.set(false); }
</script>

<div class="backdrop" role="presentation" onclick={close}>
  <div class="panel" role="dialog" aria-label="Sinh thực đơn bằng AI" onclick={(e) => e.stopPropagation()}>
    <header><h2><Sparkles size={16} /> Sinh tuần bằng AI</h2><button class="icon" aria-label="Đóng" onclick={close}><X size={18} /></button></header>
    <label>API key (Anthropic)
      <input type="password" value={$cfg.apiKey} onchange={(e) => setAiConfig({ apiKey: (e.currentTarget as HTMLInputElement).value })} />
    </label>
    <label>Yêu cầu
      <textarea rows="4" bind:value={instruction}></textarea>
    </label>
    <button class="primary" disabled={busy || !$cfg.apiKey} onclick={run}>{busy ? 'Đang sinh…' : 'Sinh thực đơn'}</button>
  </div>
</div>

<style>
  .backdrop { position:fixed; inset:0; background:rgba(0,0,0,.4); display:flex; align-items:center; justify-content:center; z-index:50; }
  .panel { background:var(--surface); color:var(--text); border:1px solid var(--border); border-radius:12px; padding:16px 20px; width:min(520px,92vw); }
  header { display:flex; align-items:center; justify-content:space-between; }
  h2 { margin:0; font-size:16px; display:flex; align-items:center; gap:6px; }
  label { display:flex; flex-direction:column; gap:4px; margin-top:12px; font-size:13px; color:var(--text-muted); }
  input, textarea { border:1px solid var(--border); border-radius:6px; padding:7px 9px; background:var(--bg); color:var(--text); font:inherit; }
  .primary { margin-top:14px; background:var(--accent); color:#fff; border:none; border-radius:8px; padding:9px 16px; cursor:pointer; font:inherit; font-weight:600; }
  .primary:disabled { opacity:.5; cursor:default; }
  .icon { border:none; background:transparent; color:var(--text-muted); cursor:pointer; padding:4px; border-radius:5px; }
</style>
```

```svelte
<!-- src/lib/modules/menu/Workspace.svelte — add import + button + modal render -->
  import Sparkles from 'lucide-svelte/icons/sparkles';
  import AiWeekModal from './AiWeekModal.svelte';
  const aiModalOpen = S.aiModalOpen;
```

```svelte
<!-- add to the .actions row -->
        <button onclick={() => S.aiModalOpen.set(true)}><Sparkles size={14} /> AI</button>
```

```svelte
<!-- add near the other modal renders at the bottom -->
{#if $aiModalOpen}<AiWeekModal />{/if}
```

- [ ] **Step 4: Run tests + full suite + typecheck**

Run: `npm test -- menu-stores && npm run check && npm test`
Expected: menu-stores PASS; check 0 errors; full suite green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/modules/menu/AiWeekModal.svelte src/lib/modules/menu/stores.ts src/lib/modules/menu/Workspace.svelte tests/menu-stores.test.ts
git commit -m "feat(menu): AI week modal + generate action wiring"
```

---

## Self-review notes (coverage vs spec)

- Model / file scope (many weeks, dish bank separate) → Tasks 1, 9. ✅
- Routing collision (`.menu.tomoe.json` + projectName sniff vs flashcards) → Task 4 (menu checked before flashcards sniff). ✅
- Customizable template (periods/categories, hideLabel, defaultValue, balance toggle, days) → Tasks 1, 6, 8. ✅
- Rotation + ingredient balancing (opt-in per category, cap default 2, exhaustion warnings) → Task 10. ✅
- Per-cell edit + re-roll; fill empty-only vs overwrite; no lock → Tasks 8, 11, 12. ✅
- Render like the reference table + PNG (primary) + PDF/print → Tasks 5, 13, 14, 15. ✅
- Dish bank CRUD + harvest → Tasks 9, 11, 12. ✅
- AI generation → Tasks 16, 17. ✅
- Shell wiring (contract, StartScreen auto, save/undo/redo) → Tasks 2, 3, 4. ✅

**Verified against the codebase (not assumptions):**
- `showToast(message, kind: 'success' | 'error' = 'success')` in `src/lib/shell.ts` — both kinds supported.
- `hashContent` exported from `src/lib/modules/flashcards/lib/fileSync.ts` (imported in Task 2).
- `userName` exported from `src/lib/shell.ts` (imported in Task 3 as `../../../shell` from `menu/io/`).
- `StartScreen` iterates `MODULES` → a "New Thực đơn" button appears automatically once `menu` is registered (Task 4); no StartScreen edit needed.
