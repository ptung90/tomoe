# Tomoe Spec #2 — Flashcards Records Workspace (design)

Date: 2026-07-14
Status: Approved (brainstorming) → ready for implementation plan
Module: `src/lib/modules/flashcards/`

## Goal

Build the record-first editing UI for the flashcards module: pick a schema,
list its records, edit a selected record in a detail form with multi-locale
inputs and rich text. Replaces the placeholder Workspace. Card render, pack,
image search/crop, and AI are later specs and are out of scope here.

## Scope

**In scope**
- Two-pane workspace: record list (left) + record detail form (right).
- Schema/field editor (schema name + fields: `key`/`label`/`type`/`multilingual`); **no** `cardTemplates`.
- Record CRUD: add, delete, **duplicate**.
- Rich-text WYSIWYG for `text-long` fields (TipTap), **stored as Markdown**.
- Plain `<input>` for `text` fields.
- Image field: URL input / paste / pick-file (→ data-URL) + thumbnail + clear. **No** search or crop.
- Project locale management: add/remove locale, set `activeLocale`; multilingual fields show one input per locale (stacked).
- JSON copy/paste, records-only (per schema): copy to clipboard as JSON array; paste overwrite/append.

**Out of scope (later specs)**
- Card preview strip, `cardTemplates` + slot mapping (spec #3).
- Record status draft/synced badge, linked-card chips, pack (spec #3/#4).
- Image search API + crop (spec #5).
- AI record generate/rewrite (spec #7).
- Sort / search / column-hide in the record list (later polish).

## Approach (approved)

**Rich text = port the flashcard-creator TipTap stack** (`@tiptap/core`,
`@tiptap/starter-kit`, `@tiptap/extension-text-align`,
`@tiptap/extension-underline`) wrapped in a Svelte component. Content is
**stored as Markdown** — load via `marked` (md→HTML), save via `turndown`
(HTML→md, porting the `tightListItem` + `alignedParagraph` rules). Markdown
keeps compatibility with legacy import (`parseProject`) and future card render
(spec #3), which expect Markdown strings.

Rejected: hand-rolled `contenteditable` (reinvents selection/lists/align, bug
prone); markdown-with-preview (not true WYSIWYG).

## Architecture

Everything under `src/lib/modules/flashcards/`.

```
Workspace.svelte             # 2 pane: <SchemaRecordList/> | <RecordDetail/>  (replaces placeholder)
components/
  SchemaRecordList.svelte    # left pane: schema groups → record rows; +add record, schema menu, locale bar
  RecordDetail.svelte        # right pane: header (title, duplicate, delete) + per-schema field form
  RecordField.svelte         # one field: routes by type → text | text-long | image; handles multilingual (stacked per-locale)
  RichText.svelte            # TipTap wrapper (use:action lifecycle) + format toolbar; props: value(md), onChange(md)
  ImageField.svelte          # thumbnail + URL input + paste + pick-file(→dataURL) + clear
  SchemaEditorModal.svelte   # modal: schema name + field list (key/label/type/multilingual), add/remove/reorder fields
  LocaleBar.svelte           # add/remove project locale + set activeLocale
lib/
  richtext.ts                # tiptap Editor factory + mdToHtml (marked) + htmlToMd (turndown)
  recordOps.ts               # pure (project, args) => newProject: record + schema + locale operations
```

### Units and boundaries

- **`recordOps.ts` — pure logic.** Every mutation is a pure function
  `(project: Project, ...args) => Project`. No Svelte, no DOM. This is the
  TDD surface. Functions: `addRecord`, `deleteRecord`, `duplicateRecord`,
  `setField`, `addSchema`, `updateSchema`, `deleteSchema`, `migrateRecordFields`,
  `addLocale`, `removeLocale`, `setActiveLocale`, `importRecords` (overwrite/append).
- **`richtext.ts` — editor + markdown round-trip.** `createEditor(el, markdown, onUpdate)`,
  `mdToHtml(md)`, `htmlToMd(html)`. Testable without a component (round-trip unit tests).
- **Components** are thin: read `$project` + UI stores, call `commit(recordOps.x(...))`.
  Each is understandable and testable in isolation.

## Stores & data flow

Extend existing [stores.ts](../../../src/lib/modules/flashcards/stores.ts)
(already has `project`, `commit`, `undo`, `redo`, `dirty`, `filePath`).

Add UI-only writables (NOT in history):
- `selectedRecordId: string | null`
- `activeSchemaId: string | null` (for "+ Add record" target)
- `schemaEditorOpen: string | '__new__' | null`

`activeLocale` stays inside `Project` (it is serialized). **Switching locale
calls `commit`** — it is an intentional, infrequent action, so one undo step is
acceptable; this keeps a single source of truth (no separate mirror store).

**Data flow (edit a field):**
```
RichText onChange(md)
  → commit(recordOps.setField($project, recordId, key, md, locale))
  → History.push → dirty=true
  → $project updates → list + form re-render reactively
```

**Debounce:** text keystrokes are debounced (~300ms) before `commit` so a burst
of typing collapses into one undo step rather than one-per-keystroke. Debounce
lives in the component layer; `recordOps.setField` stays pure.

## Rich text detail

- `richtext.ts`: `createEditor` builds `new Editor({ element, extensions:
  [StarterKit, TextAlign.configure({types:['heading','paragraph']}), Underline],
  content: mdToHtml(markdown), onUpdate })`. `htmlToMd` uses a Turndown instance
  with the two ported rules (tight list items, aligned paragraphs).
- `RichText.svelte`: `use:` action creates the editor on mount, `destroy()`s on
  teardown; toolbar buttons call `editor.chain().focus().toggleBold()` etc.;
  button active state from `editor.isActive(...)` updated on `selectionUpdate`/`transaction`.
- Because only the active module's Workspace is mounted and the form re-mounts on
  record switch, `RichText` owns its editor lifecycle fully (create/destroy) — no
  cross-record editor leakage. One instance per (field, locale).

## Schema editor

`SchemaEditorModal.svelte` (follows `ConfigModal` pattern):
- Edit `schema.name`; field list with add/remove and up/down reorder.
- Per field: `key`, `label`, `type` (`text` | `text-long` | `image`), `multilingual` checkbox.
- Save → `commit(recordOps.updateSchema(...))`, which runs `migrateRecordFields`
  so existing records gain/convert fields (string↔multilingual object) per the
  ported `_migrateRecordFields` logic.
- New schema via `schemaEditorOpen = '__new__'`. Delete schema (confirm) removes
  its records too.

## Locale / JSON / duplicate

- **Locale** (`LocaleBar`): add locale (text code, e.g. `ja`) → `recordOps.addLocale`
  seeds empty string for that locale in every multilingual field; remove locale
  strips it; set active. Locale switcher highlights `activeLocale`.
- **JSON copy/paste** (per-schema, in `SchemaRecordList` schema menu): copy the
  schema's records to clipboard as a JSON array (`navigator.clipboard.writeText`);
  paste reads clipboard, validates each record's `schemaId`, then overwrite
  (replace that schema's records) or append. Malformed JSON → error toast.
- **Duplicate** (`RecordDetail` header): `recordOps.duplicateRecord` clones with a
  new id, inserts right after the original, selects the clone.

## Error handling

- Clipboard paste: try/catch JSON parse → `showToast(..., 'error')` on failure; no state change.
- Destructive actions (delete record/schema, paste overwrite) use `@tauri-apps/plugin-dialog` `confirm`.
- Image pick-file / paste failures → error toast, field unchanged.

## Testing

- `recordOps.test.ts` — TDD all pure ops incl. multilingual `setField`, schema
  update/migrate, locale add/remove, import overwrite/append edge cases.
- `richtext.test.ts` — md↔html round-trip incl. tight lists + aligned paragraphs.
- Component tests (vitest + @testing-library/svelte): `RecordDetail` renders the
  right inputs per field type/multilingual; `SchemaRecordList` select-record;
  `ImageField` set/clear.
- Gates: `npm run check` (0 errors) · `npm test` (green, 0 unhandled) · `npm run build` (ok).

## Dependencies added

`@tiptap/core`, `@tiptap/starter-kit`, `@tiptap/extension-text-align`,
`@tiptap/extension-underline`, `marked`, `turndown` (+ `@types/turndown`).
Pulls in ProseMirror; acceptable for a desktop app.

## References

- Old app record UI to port: `d:\github\flashcard-creator\src\js\records\records.js`
  (record list, detail form, image field, TipTap init, toolbar) and
  `schema-editor.js` (schema/field editing). Skip the card-preview, pack, AI,
  status-badge, and card-chip parts (later specs).
- Markdown helpers: old `src/js/core/utils.js` (`mdParse`/`mdParseInline` via `marked`).
- Data model: [model.ts](../../../src/lib/modules/flashcards/model.ts).
- Reuse Calm Paper patterns from `src/lib/modules/json-table/` components.
