# Tomoe — Foundation Implementation Plan (rev 2, multi-module)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Fork `json-table-editor` into **Tomoe**, a multi-module Tauri+Svelte desktop app with two isolated modules — **json-table** (the kept generic editor) and **flashcards** (scaffolded) — a start screen, extension+sniff file routing, teal theme, and native `.tomoe.json` / `.json` I/O. Runnable `.exe`.

**Architecture:** Isolated modules + thin shell. Each module owns its stores/undo/save (json-table keeps its internals intact; flashcards is new). The shell coordinates the active module, shows a start screen, and routes file-open by extension then content sniff. Only the active module's `Workspace` is mounted; stores are per-module (performance constraints §Global).

**Tech Stack:** Tauri v2, Svelte 5 (runes), TypeScript, Vite 5, vitest, `@tauri-apps/plugin-fs`, `@tauri-apps/plugin-dialog`, lucide-svelte.

## Global Constraints

- Source template: `d:\github\json-table-editor` (copy out; don't modify it). New project: `d:\github\tomoe`.
- App identity: productName **Tomoe**, identifier **com.ptung.tomoe**, window title **Tomoe**.
- File routing: `.tomoe.json` → flashcards; `.json` → json-table **unless** content sniffs flashcard (object with array `schemas` AND array `cards`) → flashcards. Save writes each module's own extension.
- Accent Teal-600: light `--accent:#0d9488`, dark `--accent:#2dd4bf`; `--accent-weak` via `color-mix(in srgb, var(--accent) 10%/22%, var(--surface))`. Calm Paper tokens only, no hardcoded hex.
- **Performance (binding):** (1) only the active module's `Workspace` is mounted; (2) per-module isolated stores — no shared mega-document, no cross-module reactivity.
- lucide icons: subpath imports only.
- `history.ts` reused unchanged per module.
- Every task leaves `npm run check` clean and `npm test` green.
- AI chat stripped from Foundation (both modules); re-added in spec #7.
- Out of scope: flashcard records UI, card render/preview, pack, images, export, AI, extra modules.

---

## File Structure (Foundation end state, `d:\github\tomoe`)

```
src/
  App.svelte                       # shell: Toolbar + StartScreen | active Workspace + overlays
  app.css, main.ts                 # kept
  lib/
    shell.ts                       # NEW: activeModuleId, theme, toast, config
    fileService.ts                 # NEW (shell): pickOpen/openPath → route to module
    theme.ts, actions/resize.ts    # kept
    components/
      Toolbar.svelte               # adapted: delegates to active module
      StartScreen.svelte           # NEW: module launcher
      Toast.svelte, ConfigModal.svelte  # kept/adapted
    modules/
      types.ts                     # NEW: TomoeModule contract
      registry.ts                  # NEW: MODULES + pickModuleForOpen
      json-table/                  # MOVED from fork's lib (generic JSON domain)
        jsonModel.ts, jsonText.ts, nodeUtils.ts, pathUtils.ts, nodeLabel.ts, treeFilter.ts
        stores.ts                  # its own state (moved)
        io.ts                      # its open/save helpers (from fork fileService)
        module.ts                  # NEW: TomoeModule facade
        Workspace.svelte           # NEW: the fork's old two-pane body (TreePane+DetailPane)
        components/*, editors/*     # MOVED
      flashcards/
        model.ts                   # NEW: Project types/defaults/(de)serialize
        stores.ts                  # NEW: Project history store
        module.ts                  # NEW: TomoeModule facade
        Workspace.svelte           # NEW: two-pane placeholder
tests/
  flashcards-model.test.ts, routing.test.ts, flashcards-io.test.ts  # NEW
  (json-table tests moved + import paths fixed; AI tests deleted)
src-tauri/                         # kept, rebranded
docs/design-theme/                 # kept (teal accent)
```

---

## Task 1: Fork, install, rebrand

**Files:** create `d:\github\tomoe` (copy), modify `package.json`, `src-tauri/tauri.conf.json`.

- [ ] **Step 1: Copy template** (rsync-free — export the committed tree, which excludes node_modules/.git/target/gen/dist since they are gitignored)
```bash
mkdir -p /d/github/tomoe
cd /d/github/json-table-editor
git archive --format=tar HEAD | tar -x -C /d/github/tomoe
cd /d/github/tomoe
rm -rf .superpowers .claude    # drop any tracked scratch if present
git init -q && git add -A && git commit -q -m "chore: fork json-table-editor as Tomoe baseline"
```
> If `git archive` misses any needed untracked config, fall back to `cp -r /d/github/json-table-editor/. /d/github/tomoe/ && cd /d/github/tomoe && rm -rf node_modules .git dist src-tauri/target src-tauri/gen .superpowers .claude`.

- [ ] **Step 2: Install** — `cd /d/github/tomoe && npm install`.

- [ ] **Step 3: package.json** — `"name":"tomoe"`, `"version":"0.1.0"`.

- [ ] **Step 4: tauri.conf.json** — `productName:"Tomoe"`, `version:"0.1.0"`, `identifier:"com.ptung.tomoe"`, `app.windows[0].title:"Tomoe"`; `bundle.fileAssociations` → `[{ "ext":["tomoe.json","json"], "name":"Tomoe Project", "description":"Tomoe project file", "role":"Editor" }]`.

- [ ] **Step 5: Verify** — `npm run check` 0 errors; `npm test` green; `npm run tauri dev` opens a **Tomoe** window (old JSON UI). (If Rust/Tauri missing, install prerequisites and retry — this step gates the toolchain.)

- [ ] **Step 6: Commit** — `git add package.json src-tauri/tauri.conf.json && git commit -m "chore: rebrand fork to Tomoe"`.

---

## Task 2: Relocate the generic-JSON domain into a `json-table` module (keep it working)

**Files:** move fork `src/lib/*` generic-JSON files under `src/lib/modules/json-table/`; create `json-table/Workspace.svelte`; delete AI; temporarily point `App.svelte` at the json-table Workspace so it still runs.

**Interfaces:** Produces a self-contained `modules/json-table/` whose `stores.ts` + `io.ts` expose the existing API (`data`, `dirty`, `canUndo/canRedo`, `undo/redo`, `loadDocument`, `pickOpen`, `saveCurrent`, `pickSave`, `selectedPath`, edit ops). `Workspace.svelte` = the old App body.

- [ ] **Step 1: Move files** into `src/lib/modules/json-table/`:
  - `jsonModel.ts, jsonText.ts, nodeUtils.ts, pathUtils.ts, nodeLabel.ts, treeFilter.ts, stores.ts` → `modules/json-table/`
  - `components/{TreePane,TreeNode,DetailPane,NodeView,TwoLevelView,ParentTwoLevelView,TextEditorView,Breadcrumb}.svelte` → `modules/json-table/components/`
  - `editors/*` → `modules/json-table/editors/`
  - the fork's `fileService.ts` → `modules/json-table/io.ts`
  Use `git mv` so history is retained.

- [ ] **Step 2: Strip AI** — delete `src/lib/ai/`, remove AI stores from the moved `stores.ts` (aiToken/aiModel/chat*/sendChat/insertAnswer/appendAnswer/setAiConfig), delete `components/ChatWidget.svelte`, `ChatMessage.svelte`, and tests `aiOpenai/aiPrompt/aiStores/ChatMessage/ChatWidget`. Remove the `ChatWidget`/`ConfigModal` AI bits from wherever they were mounted.

- [ ] **Step 3: Create `modules/json-table/Workspace.svelte`** — the fork's old `App.svelte` two-pane body (TreePane + divider + DetailPane + BigEditor). Move `BigEditor.svelte` under `modules/json-table/editors/` and mount it here. Import from the new relative paths.

- [ ] **Step 4: Fix all import paths** across the moved files + their tests (update `../` depths, move tests alongside or fix paths). Temporarily set `src/App.svelte` to render just `<JsonTableWorkspace />` + `<Toast />` so the app runs during this task.

- [ ] **Step 5: Verify** — `npm run check` 0 errors; `npm test` green (json-table tests, paths fixed; AI tests gone); `npm run tauri dev` → JSON editor works exactly as the fork did.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "refactor: relocate generic-JSON editor into json-table module; strip AI"`.

---

## Task 3: Flashcards data model (`flashcards/model.ts`) — TDD

**Files:** create `src/lib/modules/flashcards/model.ts`; test `tests/flashcards-model.test.ts`.

**Interfaces:** Produces `Project`, `Settings`, `FontSpec`, `Schema`, `SchemaField`, `CardTemplate`, `RecordItem`, `Card`, `CardSection`, `CardImage`, `Locale`, `LocalizedText`; `DEFAULT_SETTINGS`; `newProject()`; `serializeProject(p)`; `parseProject(text)`; `uid(prefix?)`.

- [ ] **Step 1: Failing tests** — `tests/flashcards-model.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { newProject, serializeProject, parseProject, DEFAULT_SETTINGS } from '../src/lib/modules/flashcards/model';

describe('flashcards model', () => {
  it('newProject: empty arrays + default settings + version 1', () => {
    const p = newProject();
    expect(p.schemas).toEqual([]); expect(p.records).toEqual([]); expect(p.cards).toEqual([]);
    expect(p.locales).toContain('en'); expect(p.version).toBe(1);
    expect(p.settings.paperSize).toBe(DEFAULT_SETTINGS.paperSize);
  });
  it('serialize -> parse round-trips', () => {
    const p = newProject(); p.projectName = 'Birds';
    p.records.push({ id: 'rec_1', schemaId: 's1', fieldsHash: '', fields: { name: { en: 'Owl', vi: 'Cú' } } });
    expect(parseProject(serializeProject(p))).toEqual(p);
  });
  it('serialize ends with newline', () => { expect(serializeProject(newProject()).endsWith('\n')).toBe(true); });
  it('parseProject accepts legacy flashcard-creator JSON', () => {
    const legacy = JSON.stringify({ project_name:'Old', project_icon:'🐦',
      settings:{ paperSize:'A5' }, schemas:[], records:[],
      cards:[{ id:'c1', layout:'2x2', imageHeightPercent:80, images:[], title:'x', sections:[] }] });
    const p = parseProject(legacy);
    expect(p.projectName).toBe('Old'); expect(p.projectIcon).toBe('🐦');
    expect(p.settings.paperSize).toBe('A5'); expect(p.cards.length).toBe(1);
    expect(p.settings.border.color).toBe(DEFAULT_SETTINGS.border.color); // deep-merged default
    expect(p.locales).toContain('en');
  });
});
```

- [ ] **Step 2: Run → fail** — `npx vitest run tests/flashcards-model.test.ts` → FAIL (not found).

- [ ] **Step 3: Implement `model.ts`** (types per spec §4; `DEFAULT_SETTINGS` from FC_CONFIG):
```ts
export type Locale = string;
export type LocalizedText = string | Record<Locale, string>;
export interface FontSpec { family: string; size: number; weight?: number; color: string; lineHeight: number; textAlign?: string }
export interface Settings {
  paperSize: 'A4'|'A5'|'A6'|'Letter'; orientation: 'portrait'|'landscape';
  margin: number; padding: number; imgPadding: number;
  textVAlign: 'top'|'middle'|'bottom'; threeCardFit: boolean;
  border: { width: number; style: string; color: string; radius: number };
  image: { backgroundSize: string; backgroundPosition: string };
  titleFont: FontSpec; contentFont: FontSpec;
  pdfImageFormat: 'jpeg'|'png'; pdfJpegQuality: number; pdfScale: number; customCss: string;
}
export interface SchemaField { id: string; key: string; label: string; type: 'text'|'text-long'|'image'; multilingual?: boolean }
export interface CardTemplate { id: string; templateType: 'single'|'compound'; layout: string; locale?: string; size?: string|null; orientation?: string; hideTitle?: boolean; hideSectionLabels?: boolean; cardClass?: string|null; cardConfig?: Record<string, unknown>; mapping: { titleSlot?: string; labelSlot?: string; textSlot?: string; imageSlot?: string; imageSlots?: string[]; sections?: string[] } }
export interface Schema { id: string; name: string; fields: SchemaField[]; cardTemplates: CardTemplate[] }
export interface RecordItem { id: string; schemaId: string; fieldsHash: string; fields: Record<string, LocalizedText> }
export interface CardSection { id: string; label: LocalizedText; content: LocalizedText; recordId?: string; customClass?: string; fontSize?: number; textAlign?: string; labelSize?: number }
export interface CardImage { slot: number; url: string; recordId?: string; size?: string|null; color?: string; attribution?: unknown; search_query?: string }
export interface Card { id: string; layout: string; imageHeightPercent: number; imageGridSplit?: { row: number; col: number; inner: number; rowBorders?: boolean }; images: CardImage[]; title: LocalizedText; sections: CardSection[]; orientation?: string|null; hideTitle?: boolean; hideSectionLabels?: boolean; titleFont?: FontSpec|null; contentFont?: FontSpec|null; customCss?: string; cssClass?: string; recordId?: string; templateId?: string; packedRecordIds?: string[]; [k: string]: unknown }
export interface Project { version: number; projectName: string; projectIcon: string; settings: Settings; schemas: Schema[]; records: RecordItem[]; cards: Card[]; locales: Locale[]; activeLocale: Locale }

export const DEFAULT_SETTINGS: Settings = {
  paperSize: 'A5', orientation: 'portrait', margin: 9, padding: 2, imgPadding: 0,
  textVAlign: 'middle', threeCardFit: false,
  border: { width: 4, style: 'double', color: '#6B21A8', radius: 0 },
  image: { backgroundSize: 'cover', backgroundPosition: 'center' },
  titleFont: { family: 'sans-serif', size: 14, weight: 700, color: '#1a1a1a', lineHeight: 1.0 },
  contentFont: { family: 'sans-serif', size: 12, weight: 400, color: '#1a1a1a', lineHeight: 1.1 },
  pdfImageFormat: 'jpeg', pdfJpegQuality: 0.85, pdfScale: 2, customCss: '',
};
let _n = 0;
export function uid(prefix = 'id'): string { _n += 1; const r = Math.abs(Math.floor((performance.now()*1000)%1e9)).toString(36); return `${prefix}_${_n.toString(36)}${r}`; }
export function newProject(): Project {
  return { version: 1, projectName: 'Untitled', projectIcon: '🗂️', settings: structuredClone(DEFAULT_SETTINGS), schemas: [], records: [], cards: [], locales: ['en','vi'], activeLocale: 'en' };
}
export function serializeProject(p: Project): string { return JSON.stringify(p, null, 2) + '\n'; }
export function parseProject(text: string): Project {
  const raw = JSON.parse(text) as any; const base = newProject();
  const s = raw.settings || {};
  const settings: Settings = { ...base.settings, ...s,
    border: { ...base.settings.border, ...(s.border||{}) },
    image: { ...base.settings.image, ...(s.image||{}) },
    titleFont: { ...base.settings.titleFont, ...(s.titleFont||{}) },
    contentFont: { ...base.settings.contentFont, ...(s.contentFont||{}) } };
  return { version: typeof raw.version==='number'?raw.version:1,
    projectName: raw.projectName ?? raw.project_name ?? base.projectName,
    projectIcon: raw.projectIcon ?? raw.project_icon ?? base.projectIcon,
    settings, schemas: raw.schemas ?? [], records: raw.records ?? [], cards: raw.cards ?? [],
    locales: raw.locales ?? base.locales, activeLocale: raw.activeLocale ?? base.activeLocale };
}
export function looksLikeFlashcards(text: string): boolean {
  try { const o = JSON.parse(text); return !!o && typeof o==='object' && Array.isArray(o.schemas) && Array.isArray(o.cards); }
  catch { return false; }
}
```

- [ ] **Step 4: Run → pass** — `npx vitest run tests/flashcards-model.test.ts` → PASS (4/4).

- [ ] **Step 5: Commit** — `git add src/lib/modules/flashcards/model.ts tests/flashcards-model.test.ts && git commit -m "feat: flashcards Project model + legacy import + tests"`.

---

## Task 4: Module contract + flashcards module (stores, facade, workspace)

**Files:** create `src/lib/modules/types.ts`, `flashcards/stores.ts`, `flashcards/module.ts`, `flashcards/Workspace.svelte`; test `tests/flashcards-io.test.ts`.

**Interfaces:** Consumes `model.ts`, `history.ts`. Produces `TomoeModule` interface (spec §2) and the `flashcards` module object.

- [ ] **Step 1: `types.ts`** — the `TomoeModule` interface exactly as in spec §2.

- [ ] **Step 2: `flashcards/stores.ts`**:
```ts
import { writable, derived, get, type Readable, type Writable } from 'svelte/store';
import * as H from '../../history';
import { newProject, type Project } from './model';
const history = writable<H.History<Project>>(H.createHistory(newProject()));
export const project: Readable<Project> = derived(history, (h) => h.present);
export const canUndo: Readable<boolean> = derived(history, (h) => H.canUndo(h));
export const canRedo: Readable<boolean> = derived(history, (h) => H.canRedo(h));
export const dirty: Writable<boolean> = writable(false);
export const filePath: Writable<string|null> = writable(null);
export function initProject(): void { history.set(H.createHistory(newProject())); filePath.set(null); dirty.set(false); }
export function loadProject(p: Project, path: string|null): void { history.set(H.createHistory(p)); filePath.set(path); dirty.set(false); }
export function commit(next: Project): void { history.update((h) => H.push(h, next)); dirty.set(true); }
export function undo(): void { history.update((h) => H.undo(h)); dirty.set(true); }
export function redo(): void { history.update((h) => H.redo(h)); dirty.set(true); }
export function markSaved(path: string): void { filePath.set(path); dirty.set(false); }
export function setProjectName(name: string): void { commit({ ...get(project), projectName: name }); }
```

- [ ] **Step 3: `flashcards/module.ts`**:
```ts
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { save } from '@tauri-apps/plugin-dialog';
import { get } from 'svelte/store';
import type { TomoeModule } from '../types';
import Workspace from './Workspace.svelte';
import * as S from './stores';
import { parseProject, serializeProject, looksLikeFlashcards } from './model';
import { showToast } from '../../shell';

async function writeTo(path: string) {
  try { await writeTextFile(path, serializeProject(get(S.project))); S.markSaved(path); showToast('Saved'); }
  catch (e) { showToast(`Could not save: ${(e as Error).message}`, 'error'); }
}
export const flashcards: TomoeModule = {
  id: 'flashcards', label: 'Flashcards', extensions: ['tomoe.json'],
  matches: (text) => looksLikeFlashcards(text),
  Workspace,
  newDoc: () => S.initProject(),
  open: (text, path) => S.loadProject(parseProject(text), path && path.endsWith('.tomoe.json') ? path : null),
  save: async () => { const p = get(S.filePath); if (p) return writeTo(p); const np = await save({ filters: [{ name: 'Tomoe Project', extensions: ['tomoe.json'] }] }); if (np) await writeTo(np); },
  dirty: S.dirty, canUndo: S.canUndo, canRedo: S.canRedo, undo: S.undo, redo: S.redo,
};
```

- [ ] **Step 4: `flashcards/Workspace.svelte`** — two-pane placeholder (spec §3.2), Calm Paper tokens, `dragX` divider, showing `$project.projectName` and schema/record/card counts (bind `import { project } from './stores'`).

- [ ] **Step 5: `tests/flashcards-io.test.ts`** — mock `@tauri-apps/plugin-fs`/`dialog` and `../src/lib/shell` (stub `showToast`); assert `flashcards.open(serializeProject(newProject()), '/x.tomoe.json')` loads project; `flashcards.save()` with bound path calls `writeTextFile` with a string ending in `\n`. (Model the mocks on the fork's `fileService.test.ts`.)

- [ ] **Step 6: Verify** — `npm run check` 0 errors; `npx vitest run tests/flashcards-io.test.ts` PASS. (App still renders json-table from Task 2; flashcards not wired yet — that's Task 5.)

- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat: module contract + flashcards module (stores, facade, workspace)"`.

---

## Task 5: Shell — registry, routing, start screen, App, Toolbar (wire both modules)

**Files:** create `src/lib/shell.ts`, `src/lib/fileService.ts` (shell), `src/lib/modules/registry.ts`, `src/lib/components/StartScreen.svelte`; create `modules/json-table/module.ts` (facade over moved stores/io); rewrite `src/App.svelte`; adapt `Toolbar.svelte`, `ConfigModal.svelte`.

**Interfaces:** Consumes both module facades. Produces the shell (`activeModuleId`, `setActiveModule`, `showToast`, theme), `MODULES`, `pickModuleForOpen`, shell `pickOpen/openPath`.

- [ ] **Step 1: `shell.ts`**:
```ts
import { writable, type Writable } from 'svelte/store';
import { loadTheme, type Theme } from './theme';
export const activeModuleId: Writable<string|null> = writable(null); // null = start screen
export const theme: Writable<Theme> = writable(loadTheme());
export const toast: Writable<{ message: string; kind: 'success'|'error' }|null> = writable(null);
export const configOpen: Writable<boolean> = writable(false);
export function setActiveModule(id: string|null): void { activeModuleId.set(id); }
let t: ReturnType<typeof setTimeout>|undefined;
export function showToast(message: string, kind: 'success'|'error' = 'success'): void { toast.set({ message, kind }); if (t) clearTimeout(t); t = setTimeout(() => toast.set(null), 2500); }
```

- [ ] **Step 2: `modules/json-table/module.ts`** — facade over the moved json-table stores/io:
```ts
import type { TomoeModule } from '../types';
import Workspace from './Workspace.svelte';
import * as S from './stores';           // moved fork stores
import { pickOpenInternal, saveInternal, openText } from './io';  // adapt names to what io.ts exports
export const jsonTable: TomoeModule = {
  id: 'json-table', label: 'JSON Table', extensions: ['json'],
  Workspace,
  newDoc: () => S.loadDocument(null, null),   // empty doc
  open: (text, path) => openText(text, path), // parse JSON into its store
  save: () => saveInternal(),
  dirty: S.dirty, canUndo: S.canUndo, canRedo: S.canRedo, undo: S.undo, redo: S.redo,
};
```
> Adapt the imported names to json-table's actual `stores.ts`/`io.ts` exports (from Task 2). Add a small `openText(text, path)` helper in `io.ts` if it only had `openPath` — parse then `loadDocument`.

- [ ] **Step 3: `modules/registry.ts`**:
```ts
import type { TomoeModule } from './types';
import { flashcards } from './flashcards/module';
import { jsonTable } from './json-table/module';
export const MODULES: TomoeModule[] = [flashcards, jsonTable];
export function getModule(id: string): TomoeModule { return MODULES.find((m) => m.id === id) ?? MODULES[0]; }
export function pickModuleForOpen(path: string, text: string): TomoeModule {
  if (path.endsWith('.tomoe.json')) return flashcards;
  const sniff = MODULES.find((m) => m.matches?.(text));
  if (sniff) return sniff;
  return jsonTable;
}
```

- [ ] **Step 4: shell `fileService.ts`**:
```ts
import { readTextFile } from '@tauri-apps/plugin-fs';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { setActiveModule, showToast } from './shell';
import { pickModuleForOpen } from './modules/registry';
export async function openPath(path: string): Promise<void> {
  try { const text = await readTextFile(path); const mod = pickModuleForOpen(path, text); setActiveModule(mod.id); mod.open(text, path); }
  catch (e) { showToast(`Cannot open file: ${(e as Error).message}`, 'error'); }
}
export async function pickOpen(): Promise<void> {
  const sel = await open({ multiple: false, filters: [{ name: 'Tomoe / JSON', extensions: ['tomoe.json','json'] }] });
  if (typeof sel === 'string') await openPath(sel);
}
export async function loadStartupFile(): Promise<void> { try { const p = await invoke<string|null>('take_startup_file'); if (p) await openPath(p); } catch {} }
export function listenForOpenFile(): void { listen<string>('open-file', (e) => { if (e.payload) openPath(e.payload); }); }
```

- [ ] **Step 5: `StartScreen.svelte`** — Calm Paper card buttons: for each of `MODULES`, a "New {label}" button → `mod.newDoc(); setActiveModule(mod.id)`; plus "Open file…" → `pickOpen()`. Centered layout using `.btn`/`--surface` tokens.

- [ ] **Step 6: Rewrite `App.svelte`**:
```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import Toolbar from './lib/components/Toolbar.svelte';
  import StartScreen from './lib/components/StartScreen.svelte';
  import Toast from './lib/components/Toast.svelte';
  import ConfigModal from './lib/components/ConfigModal.svelte';
  import { activeModuleId, theme } from './lib/shell';
  import { getModule } from './lib/modules/registry';
  import { pickOpen, loadStartupFile, listenForOpenFile } from './lib/fileService';
  import { applyTheme } from './lib/theme';
  const mod = $derived($activeModuleId ? getModule($activeModuleId) : null);
  function onKeydown(e: KeyboardEvent) {
    const k = e.key.toLowerCase();
    if (e.ctrlKey && k === 'o') { e.preventDefault(); pickOpen(); }
    else if (mod && e.ctrlKey && k === 's') { e.preventDefault(); mod.save(); }
    else if (mod && e.ctrlKey && k === 'z') { e.preventDefault(); mod.undo(); }
    else if (mod && e.ctrlKey && (k === 'y' || (e.shiftKey && k === 'z'))) { e.preventDefault(); mod.redo(); }
  }
  $effect(() => { applyTheme($theme); });
  onMount(() => { listenForOpenFile(); loadStartupFile(); window.addEventListener('keydown', onKeydown); return () => window.removeEventListener('keydown', onKeydown); });
</script>
<div class="app">
  <Toolbar />
  {#if mod}
    {#key mod.id}<mod.Workspace />{/key}
  {:else}
    <StartScreen />
  {/if}
  <Toast />
  <ConfigModal />
</div>
<style>.app { height:100vh; display:flex; flex-direction:column; }</style>
```
> Only the active module's Workspace is mounted (`{#if mod}` + `{#key}`) — satisfies the perf constraint.

- [ ] **Step 7: Adapt `Toolbar.svelte`** — buttons: New (→ `setActiveModule(null)` back to start screen), Open (`pickOpen`), Save (`mod?.save()`), Undo (`mod?.undo()`, disabled unless `$modCanUndo`), Redo, theme toggle (`theme.set`), Settings (`configOpen.set(true)`). Since undo/dirty are per-module stores, subscribe reactively: read `mod`'s stores via `$derived`/`$effect` (e.g. bind to `mod?.dirty`). Disable file/edit buttons when `mod` is null. Keep Calm Paper `.toolbar`/`.btn-ghost` + lucide subpath icons.

- [ ] **Step 8: Adapt `ConfigModal.svelte`** — theme settings only (system/light/dark via `theme`), close on backdrop/Esc. Remove AI fields.

- [ ] **Step 9: `routing.test.ts`**:
```ts
import { describe, it, expect } from 'vitest';
import { pickModuleForOpen } from '../src/lib/modules/registry';
describe('open routing', () => {
  it('.tomoe.json → flashcards', () => expect(pickModuleForOpen('/a.tomoe.json', '{}').id).toBe('flashcards'));
  it('.json with schemas+cards → flashcards (sniff)', () => expect(pickModuleForOpen('/a.json', JSON.stringify({schemas:[],cards:[{}]})).id).toBe('flashcards'));
  it('plain .json object → json-table', () => expect(pickModuleForOpen('/a.json', '{"foo":1}').id).toBe('json-table'));
  it('invalid JSON → json-table (fallback)', () => expect(pickModuleForOpen('/a.json', 'not json').id).toBe('json-table'));
});
```
> registry imports `.svelte` module facades; ensure vitest is configured for Svelte (the fork already is). If importing facades pulls Tauri APIs at module load, guard those in functions (they are) so the test only touches `pickModuleForOpen`.

- [ ] **Step 10: Verify** — `npm run check` 0 errors; `npm test` green (model + io + routing + json-table tests); `npm run tauri dev`: start screen → "New JSON Table" gives the working editor; "New Flashcards" gives the placeholder; back-to-start via New; Open routes correctly; Ctrl+S/Z/Y affect only the active module.

- [ ] **Step 11: Commit** — `git add -A && git commit -m "feat: multi-module shell — registry, routing, start screen, toolbar delegation"`.

---

## Task 6: Teal accent

**Files:** `docs/design-theme/theme.css`.

- [ ] **Step 1** — set `--accent`/`--accent-weak` in all three blocks (light `#0d9488`, dark `#2dd4bf`, weak via `color-mix` 10%/22%). Confirm `theme.css` is imported globally.
- [ ] **Step 2: Verify** — `npm run tauri dev`: teal accents in both modules + dark mode brighter teal.
- [ ] **Step 3: Commit** — `git add docs/design-theme/theme.css && git commit -m "style: Tomoe teal-600 accent"`.

---

## Task 7: Foundation verification + installer

- [ ] **Step 1: Flows** — start screen; New JSON Table (edit works); New Flashcards (placeholder + counts); Save flashcards → `.tomoe.json`, reopen → flashcards; Save json-table → `.json`, reopen → json-table; open a **legacy flashcard-creator `.json`** → routes to flashcards via sniff (counts shown); undo/redo isolated per module; theme persists.
- [ ] **Step 2: Gates** — `npm run check` 0 errors; `npm test` green.
- [ ] **Step 3: Build** — `npm run tauri build` → NSIS installer "Tomoe"; install + launch once.
- [ ] **Step 4: Commit fixups** — `git add -A && git commit -m "test: Tomoe foundation verification pass"`.

---

## Self-review notes

- **Spec coverage:** multi-module shell + isolated stores + only-active-mounted (perf) → T5 App `{#if mod}`; json-table kept as module → T2; module contract → T4; flashcards model + legacy import → T3; flashcards module + save/open → T4; start screen → T5; extension+sniff routing → T5 (registry) + T3 (`looksLikeFlashcards`); native I/O `.tomoe.json`/`.json` → T4/T5; teal → T6; verification + installer → T7; AI stripped → T2.
- **Ordering keeps green:** T1 runs (old UI) → T2 json-table module (app renders it) → T3 model additive → T4 flashcards module additive (not yet wired) → T5 shell wires both → T6 visual → T7 verify.
- **Type consistency:** `TomoeModule` (T4) is implemented by both facades (T4 flashcards, T5 json-table) and consumed by registry/App/Toolbar with the same member names (`Workspace`, `newDoc`, `open`, `save`, `dirty`, `canUndo`, `canRedo`, `undo`, `redo`, `extensions`, `matches`).
- **Flagged risks:** json-table store/io export names may differ — T5 Step 2 says adapt the facade to actual exports; routing test import-safety noted (T5 Step 9).
