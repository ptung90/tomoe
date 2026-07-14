# Tomoe — Handoff (roadmap #1–#8 complete)

Snapshot for a fresh Claude Code session in `d:\github\tomoe`.
Read `CLAUDE.md` first for architecture/conventions; this doc is the status +
what-to-do-next.

## Where things stand

Roadmap: **all eight specs merged to `master`** —
**#1 Foundation ✅ · #2 Records ✅ · #3 Card render+preview ✅ · #4 Pack/edit/apply ✅ · #5 Images ✅ · #6 Export ✅ · #7 AI ✅ · #8 Polish (recent files) ✅.**
Each was built spec → plan → subagent-driven-development (per-task reviews +
whole-branch review + fix wave) and merged with a `--no-ff` commit. Specs/plans
live in `docs/superpowers/specs/` and `docs/superpowers/plans/`.

- **#2 Records workspace** — schema/field editor, record CRUD + duplicate, multi-locale form, rich-text (TipTap→Markdown), image field, locale management, JSON copy/paste, editable project name.
- **#3 Card render + live preview** — pure `lib/card-render.ts` (`buildCardHTML`, 7 layouts) + `lib/card-render.css`; `cardMapping.ts`; `CardPreview` pane + `StyleControls`.
- **#4 Pack / card edit / apply** (a+b+c) — persisted `Card`s via `cardOps.ts` (`packRecords`/`packAllForSchema`/`regenerateCard`/`deleteCard`/`setCardCell`/`applyCardToRecords`, `isCardStale`); `CardGallery` (synced/stale/edited status) + `CardEditorModal`; 3card packs 3 records/page.
- **#5 Images** — `lib/imageSearch.ts` `searchWikimedia` (keyless) + `ImageSearchModal` + `CropModal` (cropperjs); `ImageField` Search/Crop actions.
- **#6 Export** — `lib/printCards.ts` `collectPrintCards` (gallery card set) + `PrintView` (`@media print` isolation, scoped via `:has(.print-view)`) + Workspace Print button → `window.print()` (Save-as-PDF). No PDF lib.
- **#7 AI** — `lib/ai.ts` (pure prompt + tolerant parse; `generateRecords` via `@anthropic-ai/sdk` behind an injectable factory) + `aiConfig` (localStorage, never in the doc) + `aiGenerateRecords` (append) + `AiGenerateModal` + ✨ Sparkles action. Anthropic-only, `claude-opus-4-8`.
- **#8 Polish** — shell `recentFiles.ts` (localStorage, cap 10, dedup) recorded at `fileService.openPath`; StartScreen Recent section (reopen/remove/clear).

**Automated gates (all green on `master`):**
- `npm run check` → 0 errors (1 pre-existing json-table `TreeNode` `state_referenced_locally` warning).
- `npm test` → 62 files / 279 tests pass, **0 unhandled errors**.
- `npm run build` (vite) → OK. `cd src-tauri && cargo check` → OK (run after any Rust change).

**Manual GUI verified** (human): #2 records + rich-text; #3 card preview (7 layouts/orientation/styles/save-reopen). **#5–#8 GUI/network/API-key checks are pending the human morning preview** (see the checklist below and the overnight plan doc).

## What was built (Foundation)

- Fork of json-table-editor rebranded **Tomoe** (`com.ptung.tomoe`, window "Tomoe", file assoc `.tomoe.json` + `.json`).
- **json-table module** — the generic JSON editor, kept intact under `src/lib/modules/json-table/`; AI stripped.
- **flashcards module** — `Project` data model (`model.ts`, ports flashcard-creator defaults + legacy-JSON import), own stores, `TomoeModule` facade, placeholder two-pane Workspace.
- **Shell** — `types.ts` contract; `registry.ts` (MODULES + ext→sniff routing); `shell.ts` (activeModuleId/theme/toast/config); `fileService.ts` open-router with unsaved-changes guard; `StartScreen.svelte`; rewritten `App.svelte` (only active Workspace mounted); module-agnostic `Toolbar.svelte`; theme-only `ConfigModal.svelte`; unified Toast; teal-600 accent.

## HUMAN-pending (not doable by automated gates)

**Morning preview checklist for the overnight specs #5–#8** (network / GUI / API-key — see `docs/superpowers/plans/2026-07-14-overnight-specs-5-8.md`):
1. **#5 Images** — ✨ open the image field's Search → live Wikimedia results (needs network); pick one; Crop an image (cropperjs canvas).
2. **#6 Export** — Print button (Cards view) → webview print dialog shows one card per page at the right size → **Save as PDF** produces a correct PDF; app chrome not printed.
3. **#7 AI** — paste a real Anthropic API key (✨ on a schema) → enter an instruction → Generate → records appear. (Live network + `dangerouslyAllowBrowser` CORS in the webview — the ONLY path automated gates could not exercise.)
4. **#8 Recent files** — open a couple files, return to / relaunch the Start screen → they show under **Recent** → click reopens; × removes; Clear empties.

**Still from Foundation (re-confirm if not already done):**
5. `npm run tauri dev`: start screen; New JSON Table; New Flashcards; ext→sniff routing (`.tomoe.json`/plain `.json`/legacy flashcard-creator `.json`); per-module Save extension + isolated undo/redo; theme toggle + dark mode (teal `#2dd4bf`).
6. `npm run tauri build` → an NSIS installer named **Tomoe** is produced and installs/launches.

## Deferred minors (address in later specs, non-blocking)

- flashcards Workspace: add a `beforeunload`/close guard once the records UI can dirty the store (spec #2).
- json-table: the two-column-mode toggle lost its toolbar button (store + default `true` intact) — restore via a per-module toolbar-extras slot when convenient.
- Toolbar doesn't surface the bound filename (shows module label + dirty dot) — minor UX, optional.
- `TomoeModule.icon?` is contract surface with no consumer yet (StartScreen could use it).

## Next — roadmap done; candidate follow-ups (all documented, non-blocking)

The eight-spec roadmap is complete. Recorded follow-ups, if the human wants more:
- **AI (#7) extensions** — OpenAI/other providers; AI **edit/rewrite** of an existing record/field; chat panel; structured-outputs (`output_config.format`); follow-up suggestions. (MVP was Anthropic-only generate-records.)
- **Export (#6) extensions** — per-schema/selection print scope; page config (margins/headers); a real PDF lib if webview Save-as-PDF proves insufficient.
- **Polish (#8) deferrals** — **backup-on-save** + **save-time recent recording** (both need a shell-level save chokepoint / module-contract change that doesn't exist yet); multi-language niceties.
- **Images (#5) deferrals** — Unsplash/others (need keys); attribution capture; per-image background-size/position.
- Start any of these with brainstorming → writing-plans → subagent-driven-development.

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
