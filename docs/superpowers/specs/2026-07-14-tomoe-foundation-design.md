# Tomoe — Foundation (spec #1) — Design

**Date:** 2026-07-14
**Status:** Draft for review (rev 2 — multi-module)
**Target project:** new repo `d:\github\tomoe`

> This spec belongs to the new **Tomoe** desktop app. It lives in the
> flashcard-creator repo only as a planning artifact. Copy into
> `tomoe/docs/` once the project is scaffolded.

---

## 0. Vision & roadmap (context)

**Tomoe** is a record-first desktop app (Windows `.exe`) built as a **modular
app on a shared shell**, forked from `json-table-editor` (Tauri v2 + Svelte 5 +
TS + Vite + the "Calm Paper" design system). Foundation ships **two modules**:

- **json-table** — the existing generic JSON tree/table editor (kept, not thrown away), wrapped as a module.
- **flashcards** — the new record-first flashcard module (data model + empty workspace in Foundation; real UI in later specs).

Other modules (expenses, menu, vocab) can be added later behind the same
contract. **Why desktop:** native filesystem access without the browser's
`showDirectoryPicker`/permission friction (Tauri `plugin-fs`).

**Sub-project roadmap** (each its own spec → plan → implement):
1. **Foundation** *(this spec)* — multi-module shell, two modules (json-table kept, flashcards scaffolded), start screen, extension+sniff file routing, native-fs project I/O, teal theme.
2. Flashcards: Records workspace — schema/record list + record detail form (multi-locale), CRUD.
3. Flashcards: Card render + preview — port render engine, template mapping, live preview.
4. Flashcards: Pack/generate + escape-hatch card edit + apply card→record.
5. Flashcards: Images — search (native http), crop, autofill.
6. Flashcards: Export — PDF/print, batch.
7. Flashcards: AI chat.
8. Polish — multi-language first-class, backup, recent files.

---

## 1. Foundation goal

A running Tomoe `.exe` that:
- shows a **start screen** (no document open) to create a new document in a module or open a file;
- **opens files by routing to the right module**: `.tomoe.json` → flashcards; `.json` → json-table, unless its content sniffs as a flashcard project (has `schemas`+`cards`) → flashcards;
- runs each module **independently** (isolated state, only the active module's UI mounted);
- has the json-table module fully working (it already does — it is the fork), and the flashcards module as an empty two-pane workspace placeholder;
- uses the teal Calm Paper theme, native save/open, undo/redo delegated to the active module.

No flashcard records UI, card rendering, pack, images, export, or AI — later specs.

## 2. Module architecture & performance constraints

**Isolated modules, thin shell.** Each module owns its own state (stores +
`history` undo + save/open); the shell only coordinates which module is active
and routes file-open. This maximizes reuse (json-table's internals stay intact)
and guarantees no cross-module runtime cost.

**Module contract** (`src/lib/modules/types.ts`):
```ts
import type { Component } from 'svelte';
import type { Readable } from 'svelte/store';

export interface TomoeModule {
  id: string;                 // 'flashcards' | 'json-table'
  label: string;              // 'Flashcards' | 'JSON Table'
  icon?: Component;
  extensions: string[];       // file extensions this module owns, e.g. ['tomoe.json'] / ['json']
  matches?(text: string): boolean;  // content sniff for ambiguous extensions
  Workspace: Component;       // reads/writes this module's own stores
  newDoc(): void;             // reset this module's store to an empty document
  open(text: string, path: string | null): void;  // parse text into this module's store
  save(): Promise<void>;      // this module serializes + writes (native) + toast
  dirty: Readable<boolean>;
  canUndo: Readable<boolean>;
  canRedo: Readable<boolean>;
  undo(): void;
  redo(): void;
}
```

**Performance constraints (binding):**
1. **Only the active module's `Workspace` is mounted** (dynamic `<svelte:component>` / `{#if}`). Inactive modules are not in the DOM → zero render cost.
2. **Per-module isolated stores.** A module's edits/reactivity never touch another module's stores (they are separate store instances). No shared "mega-document".
3. Module code **may** be lazy-loaded (Vite dynamic `import()`) so only the opened module's bundle parses — optional; eager is acceptable from local disk.

Consequence: runtime performance per module ≈ standalone; the app is only
marginally heavier on disk/RAM (Tauri uses the system webview, so no bundled
Chromium — the binary stays small).

## 3. The two modules

### 3.1 json-table module (`src/lib/modules/json-table/`)
- **Keep** the fork's generic-JSON code, moved under this folder: `jsonModel.ts`, `jsonText.ts`, `nodeUtils.ts`, `pathUtils.ts`, `nodeLabel.ts`, `treeFilter.ts`, `stores.ts` (its own), `fileService`-equivalent open/save, `components/` (TreePane, DetailPane, TwoLevelView, …), `editors/*`, and its tests. Update import paths to the new location.
- **Add** `module.ts` — a thin facade implementing `TomoeModule` over the existing stores/actions (`newDoc`→reset its history to `null`/empty; `open(text)`→`loadDocument(JSON.parse(text))`; `save()`→its existing save; `dirty/canUndo/canRedo/undo/redo`→its stores/functions). `extensions: ['json']`, no `matches` (it's the fallback).
- **Defer** its AI chat (`lib/ai/*`, chat stores/components) — either keep wired inside the module or strip for Foundation; simplest: keep the ChatWidget as-is inside json-table module if it already works, else strip. Decision: **strip AI from Foundation** (both modules) to keep scope tight; re-add per spec #7.

### 3.2 flashcards module (`src/lib/modules/flashcards/`)
- `model.ts` — `Project` + flashcard types, `DEFAULT_SETTINGS`, `newProject`, `serializeProject`, `parseProject` (legacy import) — see §4.
- `stores.ts` — a `Project`-centric store on `history` (its own instance): `project` (derived), `dirty`, `filePath`, `canUndo/canRedo`, `initProject/loadProject/commit/undo/redo/markSaved/setProjectName`.
- `module.ts` — `TomoeModule` facade: `extensions: ['tomoe.json']`; `matches(text)` sniffs flashcard shape (parsed object has arrays `schemas` and `cards`); `newDoc`→init empty project; `open`→`loadProject(parseProject(text), path)`; `save`→serialize + `writeTextFile` + `markSaved` + toast.
- `Workspace.svelte` — two-pane placeholder (schemas/records count + project name), Calm Paper tokens, `dragX` divider.

## 4. Flashcard data model (`flashcards/model.ts`)

TypeScript types ported from flashcard-creator state; Foundation needs types +
`DEFAULT_SETTINGS` + `newProject()` + `serializeProject`/`parseProject`.
(Full type list unchanged from rev 1: `Project`, `Settings`, `FontSpec`,
`Schema`, `SchemaField`, `CardTemplate`, `RecordItem`, `Card`, `CardSection`,
`CardImage`, `Locale`, `LocalizedText`.) Key points:
- `DEFAULT_SETTINGS` transcribed from `config.js` FC_CONFIG (paperSize A5, margin 9, padding 2, border double/#6B21A8/4px, fonts, pdf*, threeCardFit false, …).
- `parseProject(text)` accepts the canonical Tomoe shape **and** legacy flashcard-creator JSON (`project_name`/`project_icon` aliases; partial `settings` deep-merged onto defaults; missing `locales` → `['en','vi']`).
- `serializeProject` → `JSON.stringify(p, null, 2) + '\n'`.

## 5. Shell (`App.svelte` + shell stores)

- **Shell stores** (`src/lib/shell.ts`): `activeModuleId: Writable<string | null>` (null = start screen), `theme`, `toast`/`showToast`, `configOpen`. Theme + toast reused from the fork's `theme.ts` pattern.
- **Registry** (`src/lib/modules/registry.ts`): `MODULES: TomoeModule[]` = `[flashcards, jsonTable]`; helpers `getModule(id)`, `pickModuleForOpen(path, text)`.
- **App.svelte**: renders `Toolbar` + body. Body = **start screen** when `activeModuleId === null`, else the active module's `Workspace` (only that one mounted). Overlays: `Toast`, `ConfigModal`.
- **Start screen** (`components/StartScreen.svelte`): lists modules — "New Flashcards", "New JSON Table" (each calls `module.newDoc()` + sets active) — plus "Open file…" (→ `pickOpen`). Calm Paper card buttons.
- **Toolbar**: New (→ back to start screen or a New menu), Open, Save, Undo, Redo, theme toggle, Settings(⚙). Save/Undo/Redo/dirty **delegate to the active module** (`$activeModule.dirty`, `activeModule.undo()`, …). When no module active, file/edit buttons are disabled.
- **Keyboard**: Ctrl+S/O/Z/Y delegate to the active module (S=save, O=open-router, Z/Y=active module undo/redo).

## 6. File open routing (`pickModuleForOpen` + `openPath`)

- `pickOpen()` (shell fileService): `open({ filters: [{ name:'Tomoe / JSON', extensions:['tomoe.json','json'] }] })` → `openPath(path)`.
- `openPath(path)`: read text; `const mod = pickModuleForOpen(path, text)`; `setActiveModule(mod.id)`; `mod.open(text, path)`.
- `pickModuleForOpen(path, text)`:
  1. if path ends `.tomoe.json` → flashcards;
  2. else (plain `.json`): try `JSON.parse`; if a module's `matches(text)` returns true (flashcards sniff: object with array `schemas` **and** array `cards`) → that module;
  3. else → json-table (fallback).
- Unsaved-changes guard (confirm dialog) delegated to the active module's `dirty` before switching/opening.

## 7. Theme / branding

- Keep "Calm Paper"; change only the accent pair in `theme.css` (all three blocks): light `--accent: #0d9488`, dark `--accent: #2dd4bf`; `--accent-weak: color-mix(in srgb, var(--accent) 10%, var(--surface))` (light) / `... 22% ...` (dark).
- `tauri.conf.json`: productName "Tomoe", identifier `com.ptung.tomoe`, window title "Tomoe", file associations `tomoe.json` + `json`.

## 8. Testing (vitest)

- **flashcards/model.test.ts** — `newProject` shape; serialize→parse round-trip identity; legacy flashcard-creator JSON import normalizes.
- **routing.test.ts** — `pickModuleForOpen`: `.tomoe.json`→flashcards; `.json` with `{schemas:[],cards:[…]}`→flashcards (sniff); plain `.json` object→json-table; invalid JSON→json-table (fallback, no throw).
- **flashcards/module (save/open)** — mock `@tauri-apps/plugin-fs`/`dialog` (as the fork's tests do); open loads project, save writes serialized + trailing newline.
- Keep the json-table module's existing tests passing (paths updated to new folder).

## 9. Out of scope (later specs)

Flashcard records CRUD UI, card rendering/preview, template/layout picker,
pack/generate, card↔record apply, image search/crop/autofill, PDF/print export,
AI chat (stripped in Foundation), custom icons/installer polish, additional modules.

## 10. Verification

- `npm run check` 0 errors; `npm test` green (model + routing + both modules' tests); `npm run tauri dev` launches.
- Start screen appears; "New JSON Table" → json-table editor works (fork behavior); "New Flashcards" → empty flashcards workspace.
- Open a `.tomoe.json` → flashcards; open a plain data `.json` → json-table; open a **legacy flashcard-creator `.json`** → routes to flashcards via sniff (workspace shows its schema/record/card counts).
- Save from flashcards writes `.tomoe.json`; from json-table writes `.json`. Undo/redo affect only the active module. Theme toggle persists.
- `npm run tauri build` → NSIS installer named "Tomoe".

## Risks

- **Rust/Tauri toolchain** required (Tauri prereq). Mitigation: Task 1 verifies `tauri dev` before building further.
- **json-table relocation churn**: moving its files into `modules/json-table/` breaks many import paths. Mitigation: move + fix imports as one task; `npm run check` gate; its tests must stay green.
- **Facade mismatch**: json-table's existing store API may not map 1:1 to the contract. Mitigation: the facade is a thin adapter; add small wrappers where needed rather than changing json-table internals.
- **Sniff false-negatives**: an unusual legacy flashcard file lacking `schemas`/`cards` arrays opens in json-table. Acceptable; user can still edit JSON and re-save.
