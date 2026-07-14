# Tomoe — Handoff (specs #1–#3 complete)

Snapshot for a fresh Claude Code session in `d:\github\tomoe`.
Read `CLAUDE.md` first for architecture/conventions; this doc is the status +
what-to-do-next.

## Where things stand

Roadmap: **#1 Foundation ✅ · #2 Records workspace ✅ · #3 Card render + preview ✅.**
Each was built spec → plan → subagent-driven-development (per-task reviews +
whole-branch review + fix wave) and merged to `master` with a `--no-ff` merge
commit. Specs/plans live in `docs/superpowers/specs/` and `docs/superpowers/plans/`
(`*-foundation-*`, `*-flashcards-records-*`, `*-flashcards-card-render-*`).

- **#2 Records workspace** — schema/field editor, record CRUD + duplicate,
  multi-locale form, rich-text (TipTap→Markdown), image field, locale management,
  JSON copy/paste, editable project name. Left `SchemaRecordList` | `RecordDetail`.
- **#3 Card render + live preview** — pure `lib/card-render.ts` (`buildCardHTML`,
  7 layouts: fulltext/fullimage/2x2/1top-1bot/1top-2bot/2top-1bot/3card) +
  `lib/card-render.css`; `cardMapping.ts` (auto-template + record→card); third
  `CardPreview` pane with layout/paper/orientation controls + `StyleControls`
  (border/fonts, live color pickers).

**Automated gates (all green on `master`):**
- `npm run check` → 0 errors (1 pre-existing json-table `TreeNode` `state_referenced_locally` warning).
- `npm test` → 49 files / 204 tests pass, **0 unhandled errors**.
- `npm run build` (vite) → OK. `cd src-tauri && cargo check` → OK.

**Manual GUI verified** (human): records workspace + rich-text switching; card
preview across all 7 layouts + orientation + style edits + save/reopen.

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

## Next: spec #4 — Pack/generate + escape-hatch card edit + apply card→record

Turn records into persisted `Card` objects in the project (spec #3 only renders a
live preview; it does not create Cards):
- **Pack/generate** — build real `Card`s from records via a schema's template(s);
  compound "pack" of multiple records into one card (e.g. `3card`). Port from
  flashcard-creator `src/js/records/pack.js`.
- **Escape-hatch card edit** — edit a generated card directly (layout, splits,
  sections, images) independent of its record.
- **Apply card→record** — push manual card edits back to the source record.
- Port from flashcard-creator `src/js/records/pack.js` + card-editing pieces.

Start it by brainstorming spec #4 (superpowers:brainstorming) → writing-plans → subagent-driven-development.

## Deferred polish / known minors (non-blocking)

- **UI polish** (spec #3 was functional-only; Calm-Paper-consistent but not designed):
  layout dropdown shows raw ids (`1top-1bot`); `StyleControls` is a dense native
  form; preview toolbar plain; 3-pane can be tight on narrow windows. Candidate for
  a `frontend-design` pass or spec #8.
- Engine ignores `template.size` (latent asymmetry; no UI sets it yet). `recordToCard`
  flattens locale eagerly (fine for single-locale-per-render). Heavy compound layouts
  (8img/6cell/txtgrid/img3/2img/3img), detailed slot-mapping template editor, and
  multiple templates per schema were deferred out of spec #3.

## References

- Old app to port the flashcard domain from: **`d:\github\flashcard-creator`** (see its `CLAUDE.md`; render engine `src/js/render.js`, records/pack `src/js/records/*`).
- Design system: `docs/design-theme/DESIGN-THEME.md`.
- SDD progress ledger for Foundation: `docs/tomoe-foundation-ledger.md` (copied from the build session).
