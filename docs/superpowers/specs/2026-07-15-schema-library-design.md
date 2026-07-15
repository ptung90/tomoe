# Tomoe Spec #12 — Schema Library (reuse a schema across files)

Date: 2026-07-15. Module: `src/lib/modules/flashcards/` (+ a small shell open-router hook).
Decision (user): reuse a flashcards **schema** (fields + its views/cardTemplates + per-view style)
across different `.tomoe.json` files via a **portable `.schema.json` file** and an **app-side
Schema Library**. Sharing flow: export → send the file → the recipient **double-clicks** it →
Tomoe adds it to their library (toast only, non-destructive). All Import/Export/Insert actions
live in a **Schema Library modal**.

## Goal

Let a schema (its fields + views + per-view style, **no records, no packed cards**) be saved once
and reused in any project on the machine, and shared as a single file that "just opens" in Tomoe.

## Current state

- A schema lives inside a project (`.tomoe.json`): `Schema { id, name, fields, cardTemplates[] }`.
  Each `cardTemplate` (a "view", spec #11) carries `layout`, `fields` (selection), `gridCols/gridRows`,
  `imageHeightPercent`, `hideSectionLabels`, `style` (per-view override), etc.
- Style cascade (#10): `project.settings` (global) → `template.style` (per view) → `card.style`.
- No way to move a schema between files today.
- Shell open-router (`fileService.openPath` → `registry.pickModuleForOpen`) routes a file to a module
  and REPLACES the active document via `module.open` — that must NOT happen for a `.schema.json`.
- AI config already demonstrates app-side persistence via `localStorage` (`stores.ts`), NOT in the doc.

## Data

**Library (app-side, `localStorage`, key `tomoe.flashcards.schemaLibrary`)** — a JSON array, shared by
all projects on this machine, never part of a project document:
```ts
interface SchemaLibraryEntry {
  id: string;                 // library entry id (uid)
  name: string;               // schema name (display)
  addedAt: number;            // epoch ms (stamped at add-time by the caller, not in pure code)
  schema: { name: string; fields: SchemaField[]; cardTemplates: CardTemplate[] };  // NO records
  settings: Settings;         // the source project's global style (for empty-project insert)
}
```

**Portable file `.schema.json`** — what export writes / import reads:
```ts
{ tomoeSchema: 1, schema: { name, fields, cardTemplates }, settings: <Settings> }
```
`tomoeSchema` is the format marker (also how the open-router recognizes the file). Excludes records
and packed cards. `serializeProject`-style: pretty JSON + trailing `\n`.

## Pure I/O (`src/lib/modules/flashcards/io/schemaIO.ts`)

- `serializeSchemaExport(schema: Schema, settings: Settings): string` — emit `{ tomoeSchema:1,
  schema:{name,fields,cardTemplates}, settings }` (deep-cloned, records/cards never included) + `\n`.
- `parseSchemaExport(text: string): { schema; settings }` — `JSON.parse`, require `tomoeSchema` marker
  and an object `schema.fields` array + `schema.cardTemplates` array; throw `Error('Not a valid Tomoe
  schema file')` otherwise. Returns the schema + settings (settings merged over `DEFAULT_SETTINGS` for
  forward-safety, like `parseProject`).
- `looksLikeSchemaFile(text): boolean` — true when parseable AND has the `tomoeSchema` marker (used by
  the open-router; pure, never throws).

## Library store (`stores.ts`, localStorage-backed — pattern mirrors `aiConfig`)

- `schemaLibrary: Readable<SchemaLibraryEntry[]>` — loaded from localStorage at init.
- `addToLibrary(entry: { name; schema; settings }): string` — prepend a new entry (uid id, `addedAt`),
  persist, return id. Dedup is NOT enforced (duplicates allowed; user deletes what they don't want).
- `removeFromLibrary(id): void` — drop + persist.
- `addSchemaToLibrary(schemaId): void` — snapshot a schema of the CURRENT project (its fields +
  cardTemplates + the project's global `settings`) into the library.
- `importSchemaFileText(text): { ok: boolean; name?: string; error?: string }` — `parseSchemaExport`,
  add to library; used by both the modal's "Import from file" and the open-router. Never throws
  (returns `{ ok:false, error }` on bad input) so callers can toast.

## Insert into a project (`cardMapping.ts` pure + `stores.ts` action)

- `insertSchema(project, libEntry): Project` (pure) — append a **fresh-id copy** of `libEntry.schema`
  (new `schema.id` via `uid('sch')`; each `cardTemplate.id` regenerated) to `project.schemas`. If
  `project.schemas` was **empty**, also set `project.settings = libEntry.settings` (merged over
  DEFAULT_SETTINGS) so a fresh project adopts the source look; a project that already has schemas
  keeps its own global. Immutable.
- Store `insertLibrarySchema(id): void` — `commit(insertSchema(...))`, select the new schema
  (`activeSchemaId`). Undoable.

## Schema Library modal (`components/SchemaLibraryModal.svelte`)

- Opened from a toolbar/header button in the flashcards Workspace (a library icon); open state via a
  flashcards UI store `schemaLibraryOpen: Writable<boolean>`.
- Lists library entries: name · N fields · N views · addedAt. Empty state explains how to add.
- Per entry: **Insert into project** (`insertLibrarySchema`) · **Export…** (`save` dialog → write
  `serializeSchemaExport(entry.schema, entry.settings)`) · **Delete** (`removeFromLibrary`).
- Header actions: **Import from file…** (`open` dialog → `importSchemaFileText` → toast) · **Add
  current schema** (if the active project has a selected/active schema → `addSchemaToLibrary`).
- Calm Paper tokens; lucide subpath icons; Svelte 5 runes.

## Open-with a `.schema.json` (shell, `fileService.ts` + `tauri.conf.json`)

- **File association**: register `schema.json` (and keep `tomoe.json`) under `bundle > fileAssociations`
  in `src-tauri/tauri.conf.json` so a **double-click** launches Tomoe with the path. (Takes effect only
  after a fresh `tauri build` + reinstall; in `tauri dev`, "Open with → Tomoe" / the in-app Open dialog
  still route it.)
- `openPath(path)`: after reading the text, if `path` ends with `.schema.json` **or**
  `looksLikeSchemaFile(text)` → handle as a **library import**: `importSchemaFileText(text)` → toast
  "Added '<name>' to the schema library" (or an error toast). **Do NOT** run `pickModuleForOpen` /
  `module.open` — the current project/document is untouched (non-destructive). Do NOT switch modules or
  open the modal (user opens the library modal themselves later). Record it in recent files? No — it's
  not a project.
- The in-app Open dialog (`pickOpen`) adds `schema.json` to its accepted extensions so it can be picked
  there too.
- Coupling: `fileService` (shell) calls the flashcards `importSchemaFileText` + `showToast`. This is a
  deliberate, minimal shell→flashcards hook for the schema-file type (documented as such).

## Testing

- `serializeSchemaExport`/`parseSchemaExport`: round-trip preserves schema (fields + cardTemplates incl.
  per-view `style`/`fields`/`gridCols`) + settings; NO records/cards in the output; `parseSchemaExport`
  throws on a non-marker / malformed file; `looksLikeSchemaFile` true only for marked files, false for a
  `.tomoe.json` project and for junk.
- Library store: `addToLibrary`/`removeFromLibrary` persist to a mocked `localStorage`;
  `addSchemaToLibrary` snapshots the current schema + global settings; `importSchemaFileText` returns
  `{ok:false}` (no throw) on bad text.
- `insertSchema`: appends a fresh-id copy (new schema id, new template ids, originals untouched);
  applies `settings` ONLY when the target project was empty; leaves global alone otherwise; immutable.
- Open-router: `looksLikeSchemaFile` gates a `.schema.json` away from `pickModuleForOpen`; a normal
  `.tomoe.json` / generic `.json` still routes to a module (regression).
- Gates: `npm run check` 0 · `npm test` green · `npm run build` OK. Rust/`tauri.conf.json` change gated
  by `cd src-tauri && cargo check` (config parse) — full installer build is the human's verification.

## Out of scope

- Cloud/sync library; editing a schema while it's in the library (insert into a project, then edit);
  merging an imported schema into an existing one; migrating records; per-locale concerns.

## Plan shape (→ writing-plans → subagent-driven)

1. **File I/O + format** — `io/schemaIO.ts`: `serializeSchemaExport`/`parseSchemaExport`/
   `looksLikeSchemaFile`. Pure, TDD.
2. **Library store + insert** — `SchemaLibraryEntry`, localStorage-backed `schemaLibrary` +
   `addToLibrary`/`removeFromLibrary`/`addSchemaToLibrary`/`importSchemaFileText`; `insertSchema`
   (pure) + `insertLibrarySchema` (store). Tests.
3. **Schema Library modal** — list + per-entry Insert/Export/Delete + header Import/Add-current;
   toolbar trigger + `schemaLibraryOpen`. Tests (render, actions).
4. **Open-with routing + file association** — `fileService.openPath` schema-file branch (non-destructive,
   toast) + `pickOpen` extension; `tauri.conf.json` `fileAssociations`. Tests for the router gate.
5. **Whole-branch review + build/visual pass** (incl. `cargo check`; installer/double-click is human-verified).
