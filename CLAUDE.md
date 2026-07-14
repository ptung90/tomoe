# Tomoe — CLAUDE.md

Project instructions for Claude Code sessions in this repo (`d:\github\tomoe`).

## What Tomoe is

A **record-first desktop app** (Windows `.exe`) built as a **modular app on a
shared shell**. Forked from `json-table-editor`. Turns structured **records**
into rendered output; the first real module is **flashcards** (record → card),
alongside the kept generic **json-table** editor. Other modules (expenses,
menu, vocab) may be added later behind the same contract.

**Status:** Foundation (spec #1) is complete. Records UI, card render, pack,
images, export, and AI are later specs — see the roadmap.

## Stack

- **Tauri v2** (native fs via `@tauri-apps/plugin-fs`, `plugin-dialog`; system webview → small binary).
- **Svelte 5** (runes: `$state`/`$derived`/`$effect`) + **TypeScript** + **Vite 5**.
- **vitest** (+ jsdom, @testing-library/svelte) for tests.
- **lucide-svelte** icons — **subpath imports only** (`lucide-svelte/icons/save`), never the barrel.
- Design system: **"Calm Paper"** (`docs/design-theme/theme.css` + `DESIGN-THEME.md`). Accent = **teal-600** (`#0d9488` light / `#2dd4bf` dark). Style with tokens (`var(--accent)`, `var(--bg)`, …), never hardcoded hex.

## Architecture (must uphold)

**Isolated modules + thin shell.** Each module owns its own stores + `history`
undo + open/save. The shell only coordinates which module is active and routes
file-open.

- **Module contract** — `src/lib/modules/types.ts` `TomoeModule`:
  `{ id, label, icon?, extensions, matches?, Workspace, newDoc(), open(text,path), save(), dirty, canUndo, canRedo, undo(), redo() }`. Both modules implement it; registry/App/Toolbar consume it uniformly — nothing bypasses the contract.
- **Performance constraints (binding):**
  1. **Only the active module's `Workspace` is mounted** (`App.svelte` uses `{#if mod}{#key mod.id}<mod.Workspace/>{/key}{:else}<StartScreen/>`). Inactive modules are NOT in the DOM.
  2. **Per-module isolated stores** — no shared mega-document, no cross-module reactivity.
- **Shell** (`src/lib/shell.ts`): `activeModuleId` (null = start screen), `theme`, `toast`/`showToast`, `configOpen`, `setActiveModule`. One `<Toast/>` mounted; both modules' `showToast` reach it.
- **File routing** (`src/lib/modules/registry.ts` `pickModuleForOpen` + `src/lib/fileService.ts`): `.tomoe.json` → flashcards; else if a module `matches(text)` (flashcards sniff = object with array `schemas` AND array `cards`) → that module; else json-table. `openPath`/New guard unsaved changes via the active module's `dirty` before discarding.
- **Undo:** `src/lib/history.ts` — generic immutable `History<T>`, one instance per module (T = that module's document).

## File structure

```
src/
  App.svelte                     # shell: Toolbar + StartScreen|active Workspace + Toast + ConfigModal
  main.ts, app.css
  lib/
    shell.ts                     # activeModuleId, theme, toast, config
    fileService.ts               # shell open-router (ext→sniff→module)
    history.ts, theme.ts, actions/resize.ts
    components/ Toolbar · StartScreen · Toast · ConfigModal (theme-only)
    modules/
      types.ts                   # TomoeModule contract
      registry.ts                # MODULES + pickModuleForOpen
      json-table/                # kept generic editor (module.ts facade, Workspace, stores, io, jsonModel, components/, editors/)
      flashcards/                # model.ts, stores.ts, module.ts, Workspace.svelte (placeholder)
docs/
  design-theme/                  # Calm Paper (teal accent)
  superpowers/specs/             # design + plan docs (incl. json-table history + Tomoe foundation)
  TOMOE-HANDOFF.md               # what's done / next / references
tests/                           # vitest (model, routing, io, component tests)
src-tauri/                       # Tauri app (conf, capabilities, Rust)
```

## Conventions

- **inject()/no framework** N/A — this is Svelte; prefer runes, stores, small focused components.
- **TDD** for pure logic (model, routing, parse/serialize) — vitest, write failing test first.
- **Data model** for flashcards: `src/lib/modules/flashcards/model.ts` — `Project` (settings/schemas/records/cards/locales), `DEFAULT_SETTINGS` (single source; ported from flashcard-creator `config.js`), `parseProject` accepts legacy flashcard-creator JSON, `serializeProject` adds trailing `\n`. Project file ext = **`.tomoe.json`**.
- **Multi-locale:** `LocalizedText = string | Record<Locale, string>`; `locales`/`activeLocale` on the Project.
- Adding a module = new `modules/<id>/` folder implementing `TomoeModule` + a `MODULES` entry. Keep the shell thin.

## Dev commands

- `npm run tauri dev` — run the desktop app (GUI; interactive, blocks).
- `npm run check` — svelte-check (must be 0 errors).
- `npm test` — vitest (must be green; 0 unhandled errors).
- `npm run build` — vite frontend build (non-GUI compile gate).
- `npm run tauri build` — NSIS installer.
- Rust/cargo required for tauri build; `cd src-tauri && cargo check` gates Rust changes.

## Roadmap (each = its own spec → plan → implement)

1. **Foundation** — ✅ DONE (multi-module shell, json-table kept, flashcards scaffolded, routing, teal).
2. **Flashcards: Records workspace** — schema/record list + record detail form (multi-locale), CRUD. ← NEXT
3. Flashcards: Card render + preview — port the render engine (`buildCardHTML`) + template mapping from flashcard-creator; live preview.
4. Flashcards: Pack/generate + escape-hatch card edit + apply card→record.
5. Flashcards: Images — search (native http), crop (cropperjs), autofill.
6. Flashcards: Export — PDF/print, batch.
7. Flashcards: AI chat — generate/edit records.
8. Polish — multi-language first-class, backup, recent files.

## Reference: the old flashcard-creator app

The flashcard DOMAIN logic to port lives in **`d:\github\flashcard-creator`**
(vanilla JS + Vite). Key files to port from in later specs:
- Render engine + layouts: `src/js/render.js` (`buildCardHTML`, 20 layouts + compound), `src/js/core/state.js` (LAYOUTS/SLOTS/SPLIT), `src/css/preview.css`.
- Records/schema/pack: `src/js/records/{records,pack,schema-editor,ai}.js`.
- Images/crop/export: `src/js/{api,crop,preview}.js`, `src/js/modals.js`.
- Its own `CLAUDE.md` documents the data model, layouts, and quirks in depth.
Port to TS/Svelte; the render engine is mostly pure string-building → a TS util rendered via `{@html}`.
