# Tomoe — Handoff (Foundation complete)

Snapshot for a fresh Claude Code session in `d:\github\tomoe`.
Read `CLAUDE.md` first for architecture/conventions; this doc is the status +
what-to-do-next.

## Where things stand

**Foundation (spec #1) is COMPLETE** — 8 commits on `master` (`45b8a8b..7c82974`),
built via subagent-driven development (each task reviewed; final whole-branch
review + one fix wave). Specs live in `docs/superpowers/specs/`:
`2026-07-14-tomoe-foundation-design.md`, `-plan.md`.

**Automated gates (all green):**
- `npm run check` → 0 errors (1 pre-existing json-table `TreeNode` `state_referenced_locally` warning).
- `npm test` → 33 files / 123 tests pass, **0 unhandled errors**.
- `npm run build` (vite) → OK. `cd src-tauri && cargo check` → OK.

## What was built (Foundation)

- Fork of json-table-editor rebranded **Tomoe** (`com.ptung.tomoe`, window "Tomoe", file assoc `.tomoe.json` + `.json`).
- **json-table module** — the generic JSON editor, kept intact under `src/lib/modules/json-table/`; AI stripped.
- **flashcards module** — `Project` data model (`model.ts`, ports flashcard-creator defaults + legacy-JSON import), own stores, `TomoeModule` facade, placeholder two-pane Workspace.
- **Shell** — `types.ts` contract; `registry.ts` (MODULES + ext→sniff routing); `shell.ts` (activeModuleId/theme/toast/config); `fileService.ts` open-router with unsaved-changes guard; `StartScreen.svelte`; rewritten `App.svelte` (only active Workspace mounted); module-agnostic `Toolbar.svelte`; theme-only `ConfigModal.svelte`; unified Toast; teal-600 accent.

## HUMAN-pending (not doable by automated gates)

1. `npm run tauri dev` and visually verify: start screen; **New JSON Table** (editor works); **New Flashcards** (placeholder shows project name + schema/record/card counts); open a `.tomoe.json` → flashcards; open a plain data `.json` → json-table; open a **legacy flashcard-creator `.json`** → routes to flashcards (sniff); Save writes each module's own extension; undo/redo isolated per module; theme toggle + dark mode (teal `#2dd4bf`).
2. `npm run tauri build` → confirm an NSIS installer named **Tomoe** is produced and installs/launches.

## Deferred minors (address in later specs, non-blocking)

- flashcards Workspace: add a `beforeunload`/close guard once the records UI can dirty the store (spec #2).
- json-table: the two-column-mode toggle lost its toolbar button (store + default `true` intact) — restore via a per-module toolbar-extras slot when convenient.
- Toolbar doesn't surface the bound filename (shows module label + dirty dot) — minor UX, optional.
- `TomoeModule.icon?` is contract surface with no consumer yet (StartScreen could use it).

## Next: spec #2 — Flashcards Records workspace

Build the record-first editing UI in the flashcards module:
- Left pane: schema list + records (table/list per schema), select a record.
- Right pane (DetailPane): record fields form — text / text-long / image, **multi-locale** inputs; CRUD records; JSON copy/paste (records-only).
- Reuse Calm Paper components/patterns from `json-table/` (ObjectArrayTable/ObjectForm-style) and the flashcards `commit()`/`history` store.
- Port field/record logic from flashcard-creator `src/js/records/records.js` + `schema-editor.js`.

Start it by brainstorming spec #2 (superpowers:brainstorming) → writing-plans → subagent-driven-development.

## References

- Old app to port the flashcard domain from: **`d:\github\flashcard-creator`** (see its `CLAUDE.md`; render engine `src/js/render.js`, records/pack `src/js/records/*`).
- Design system: `docs/design-theme/DESIGN-THEME.md`.
- SDD progress ledger for Foundation: `docs/tomoe-foundation-ledger.md` (copied from the build session).
