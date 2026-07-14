# JSON Table Editor — Design Spec

**Date:** 2026-07-04
**Status:** Approved (design), ready for implementation plan
**Repo:** `d:\github\json-table-editor`

## 1. Purpose

A small, reusable **desktop** app that lets a **non-developer** edit JSON data files as **nested tables**, without ever touching JSON syntax and without the export/import dance.

Primary user: a non-technical person (e.g. adding/removing words in the `reading-folders` printable's data file), reused across the author's other JSON-backed projects.

### Success criteria
- **Double-click a `.json` file → it opens in the app.**
- Edit values and add/remove list items in a **table/grid** UI (familiar, Excel-like).
- **Ctrl+S saves straight back to the same file** — no export/import.
- **Never breaks the JSON structure** (nesting, key order, value types preserved).
- Works **offline**, native (no browser, no permission prompts, no Excel Trust Center block).

### Non-goals (v1)
- Renaming / adding / removing object **keys** (v2).
- Changing a value's **type** (v2).
- Search / filter across the tree (v2).
- Undo/redo, drag-reorder, JSON Schema validation, virtualization for huge files (v2).
- Cross-platform polish (Windows-first; macOS/Linux later).

## 2. Tech stack

- **Tauri v2** — small binary (~5–10 MB, uses Windows WebView2), native file dialogs + direct file writes, `.json` file association.
- **Frontend:** Svelte + Vite + TypeScript. Chosen for tiny bundle and natural recursive components with reactive edit state.
- **Rust:** minimal. File I/O and dialogs via official plugins (`@tauri-apps/plugin-fs`, `@tauri-apps/plugin-dialog`). A few lines to read the file-path argv (single-instance) and hand it to the frontend on launch.
- **Offline only** — no network calls.

## 3. Data model & round-trip

- On open: read text → `JSON.parse` → in-memory model held in a Svelte store, alongside `filePath` and `dirty`.
- On save: `JSON.stringify(model, null, 2)` → write to `filePath`.
- **Structure preservation:** relies on JS object insertion order (preserved for string keys) → key order kept. Nesting and container types kept exactly. Value types kept on edit (see §5).
- **Known caveats (acceptable v1, documented):** number normalization (`1.0` → `1`), integers beyond 2^53 lose precision, comments/trailing formatting not preserved (standard JSON). None affect text-list data like reading-folders.

## 4. Components (frontend)

- **`App.svelte`** — toolbar (Open / Save / Save As), title showing filename + `●` dirty marker, editor area, empty state, keyboard shortcuts (Ctrl+O, Ctrl+S).
- **`lib/Node.svelte`** — **recursive** renderer + editor. Renders by value kind:
  - **object** → 2-column table: `key` (read-only label) | `<Node>` for its value.
  - **array of objects** → table: columns = union of object keys; one row per item; each cell a `<Node>`; per-row 🗑 delete; a ➕ "add row" that appends an object matching the existing key shape (empty-string defaults).
  - **array of scalars** (e.g. `words`) → single-column table; each cell an editable input + 🗑; ➕ appends `""`.
  - **array (mixed/nested items)** → generic list of `<Node>` with 🗑 / ➕.
  - **leaf** → type-aware editor: text (string), number input (number), checkbox (boolean), muted `null` display.
  - Every object/array node has a **▸/▾ collapse** toggle so deeply nested files (root → `folders[]` → `cards[]` → `words[]`) stay navigable.
- **`lib/stores.ts`** — writable stores: `data`, `filePath`, `dirty`.
- **`lib/jsonModel.ts`** — pure helpers (unit-tested): classify a value, update value at a path, add/remove array item, build an "add-row template" from an array-of-objects.
- **`lib/fileService.ts`** — wraps Tauri fs/dialog: `openPath()`, `pickOpen()`, `save(path,text)`, `pickSave()`, and startup-argv handling.

## 5. Editing scope (v1)

- **Edit leaf values, preserving type**: string→text, number→number input, boolean→toggle. `null` shown; editing turns it into a string (rare; noted).
- **Add / remove array items** (rows): the core operation (e.g. add/remove a word).
- Delete takes effect immediately; safety net = **save is explicit**, so closing without saving reverts. (No in-app undo in v1.)

## 6. Data flow

1. **Launch**: if opened-with a file, Rust passes the path (argv) → frontend reads + parses + shows. Else empty state.
2. **Open** (Ctrl+O / toolbar): dialog → path → read → parse → model.
3. **Edit**: mutations update the reactive model → `dirty=true`.
4. **Save** (Ctrl+S): stringify → write to `filePath` (Save As if none) → `dirty=false`.
5. **Close while dirty**: confirm prompt.

## 7. Error handling

- Invalid JSON on open → error dialog (`File JSON không hợp lệ: <msg>`); keep previous/empty state.
- File read/write failure → error dialog with the OS message.
- Save on a doc with no path → Save As dialog.
- Quit/close while `dirty` → confirm dialog.
- Very large files → v1 renders everything (may be slow); virtualization is a v2 note. Typical target files (~tens of KB) are smooth.

## 8. Testing

- **Vitest (pure logic — critical):** round-trip `parse → edit → stringify` preserves structure & key order, tested against the real nested `reading-folders` JSON; plus `jsonModel` add/remove/update helpers.
- **Svelte component tests:** key interactions — editing a cell updates the model; ➕ adds a row; 🗑 removes a row.
- **Manual acceptance:** double-click a `.json`, open `reading-folders-data-full.json`, add a word, Ctrl+S, confirm the file changed and stays valid + structurally intact.

## 9. Repo structure

```
json-table-editor/
  src/
    App.svelte
    lib/Node.svelte
    lib/stores.ts
    lib/jsonModel.ts
    lib/fileService.ts
  src-tauri/
    tauri.conf.json      # fileAssociations: .json ; fs + dialog plugins
    src/main.rs          # argv path -> frontend; single-instance
  tests/                 # vitest
  docs/superpowers/specs/2026-07-04-json-table-editor-design.md
  package.json
```

## 10. Open items deferred to v2
Search/filter, key add/remove/rename, type change, undo/redo, drag-reorder, virtualization, macOS/Linux packaging, installer + auto-update.
