# JSON Table Editor — UI/UX Redesign Design Spec

**Date:** 2026-07-05
**Status:** Approved (design), ready for implementation plan
**Repo:** `d:\github\json-table-editor`
**Builds on:** `2026-07-04-json-table-editor-design.md` (v1 shipped: all 12 tasks, installer built)

## 1. Purpose

v1 works but the UI is a bare stack of nested HTML tables — dense, hard to navigate when data is deep (`root → folders → cards → words`), plain buttons, emoji icons, no visual system. This redesign makes the app **both easier to use and genuinely polished**, while keeping it a **reusable** JSON editor that works for any project's data shape (not just reading-folders).

### Success criteria
- **Navigating deep data is easy** — a persistent tree + focused detail pane, breadcrumb shows where you are.
- **Works for any JSON shape** — one layout adapts: record-arrays as tables, scalar-arrays as chips, objects as forms.
- **Looks intentional** — cohesive Paper + Terracotta palette, light + dark, Lucide icons, consistent spacing/radius.
- **Safer editing** — Undo/redo (Ctrl+Z / Ctrl+Y) as the safety net; toast confirms saves.
- **Findable** — search box filters the tree.
- All v1 guarantees preserved: structure-preserving round-trip, Ctrl+S save-in-place, offline, `.json` association.

### Non-goals (unchanged from v1)
- Key rename/add/remove, value type change, JSON Schema validation, drag-reorder, virtualization for huge files, macOS/Linux packaging.
- Confirm-on-delete dialog — **intentionally dropped**; Undo covers accidental deletes.

## 2. Decisions (locked during brainstorming)

| Area | Decision |
|---|---|
| **Goal** | Comprehensive redesign — usability and aesthetics equally |
| **Layout** | **C — master-detail**: navigation tree (left) + adaptive detail pane (right). One layout for all projects. |
| **Style** | Calm Light — generous spacing, soft 8px radius, subtle hover |
| **Palette** | Paper + Terracotta (warm off-white paper, terracotta accent), with a dark variant |
| **Dark mode** | Both light + dark; follows `prefers-color-scheme` by default + manual toggle |
| **UX features** | Undo/redo + save toast + tree search. No confirm-delete, no keyboard-nav (v2). |
| **UI language** | **English** for all in-app text (overrides v1's Vietnamese strings) |
| **Icons** | **Lucide** (`lucide-svelte`), inline SVG, bundled (offline-safe) |

## 3. Architecture

Replace the single recursive `<Node>` render with a 2-pane shell. `jsonModel.ts` is unchanged — all editing still flows through its pure immutable helpers, so the 31 existing logic/round-trip tests keep passing untouched.

```
┌─ Toolbar ────────────────────────────────────────────────┐
│ Open  Save  Save As │ ↶ Undo  ↷ Redo │  file ●  │ ☀/🌙   │
├─────────────────────┬─────────────────────────────────────┤
│ TreePane            │ DetailPane                           │
│  🔎 Search          │  folders › ai › words   (breadcrumb) │
│  ▾ folders          │  [ adaptive content for selectedPath]│
│    • ai        ●    │                                      │
│    • ee             │                                      │
└─────────────────────┴─────────────────────────────────────┘
```

### Component tree
- **`App.svelte`** — shell: lays out Toolbar + 2 panes; owns keyboard shortcuts (Ctrl+O/S/Z/Y); mounts theme.
- **`lib/components/Toolbar.svelte`** — Open / Save / Save As / Undo / Redo buttons (Lucide icons), filename + `●` dirty marker, theme toggle (☀/🌙). Undo/Redo disabled when stacks empty; Save disabled when no doc.
- **`lib/components/TreePane.svelte`** — recursive navigation tree; search box at top; owns nothing (reads `data`, `selectedPath`, writes `selectedPath`). Renders `TreeNode.svelte` recursively.
- **`lib/components/TreeNode.svelte`** — one tree row: expand/collapse chevron for containers, label (key or index summary), selected highlight, filtered visibility.
- **`lib/components/DetailPane.svelte`** — reads node at `selectedPath`; renders breadcrumb + dispatches to the right editor by `classify`.
- **`lib/components/Breadcrumb.svelte`** — path segments; clicking a segment sets `selectedPath` to that ancestor.
- **Editors** (each consumes a value + absolute path, emits edits via callbacks that call `jsonModel` helpers):
  - `lib/editors/ObjectForm.svelte` — object → label + value rows; scalar values inline; nested object/array values render as a "drill-in" row that sets `selectedPath` to the child.
  - `lib/editors/ObjectArrayTable.svelte` — array-of-objects → table (columns = `objectKeyUnion`, one row per item, per-row delete, add-row).
  - `lib/editors/ScalarArrayEditor.svelte` — array-of-scalars → chips (each editable + remove ×, add chip).
  - `lib/editors/MixedArrayList.svelte` — array-mixed → generic list of drill-in rows + delete/add.
  - `lib/editors/LeafEditor.svelte` — string/number/boolean/null single editor (reused by ObjectForm, ObjectArrayTable cells, ScalarArrayEditor).
- **`lib/components/Toast.svelte`** — transient message (success/error), auto-dismiss ~2.5s.

### State (`lib/stores.ts`, extended)
- `data: Writable<JsonValue | null>` — the document (unchanged).
- `filePath`, `dirty` — unchanged.
- `selectedPath: Writable<Path>` — currently focused node (default `[]` = root). Reset to `[]` on load.
- `theme: Writable<'light' | 'dark' | 'system'>` — persisted to `localStorage`; applied as `data-theme` on `<html>` (except `system`, which defers to the media query).
- Edits route through **history** (below) instead of calling `applyEdit` directly.

### Undo/redo (`lib/history.ts`, pure + unit-tested)
Snapshot-based, exploiting that every `jsonModel` op returns a new immutable tree (structural sharing → cheap):
- `createHistory(initial: JsonValue): HistoryState`
- `push(h, next): HistoryState` — pushes current onto undo stack, sets present=next, clears redo stack.
- `undo(h): HistoryState` / `redo(h): HistoryState` — move present between stacks.
- `canUndo(h): boolean` / `canRedo(h): boolean`.
- `reset(h, value): HistoryState` — new baseline on file open (clears both stacks).
- A thin store wrapper (`historyStore`) exposes `present` → drives `data`; edit actions call `push`. `dirty` is set true on push, false on save/load.

## 4. Interaction model

- **Selecting:** clicking any tree node sets `selectedPath`; DetailPane shows it. Root is selected on file open.
- **Drilling from detail:** in `ObjectForm`/`MixedArrayList`, a nested container value is a row with a chevron that sets `selectedPath` to that child (keeps focus rather than nesting tables). Breadcrumb walks back up.
- **Editing:** scalar edits (text/number/checkbox) and array add/remove call `jsonModel` helpers → `history.push` → `data` updates → `dirty=true`. Same semantics as v1, just routed through history.
- **Undo/redo:** Ctrl+Z / Ctrl+Y or toolbar buttons. If `selectedPath` no longer exists after undo (e.g., undid an add that a deeper selection depended on), fall back to the nearest existing ancestor path.
- **Search:** typing filters `TreePane` to nodes whose key/leaf-value contains the query (case-insensitive); ancestors of matches stay visible and auto-expanded. Clearing restores the full tree. Search does not affect `data`.
- **Save:** Ctrl+S / Save → write → toast "Saved" (or error toast). Save As when no path.

## 5. Visual system

CSS custom properties on `:root`, overridden under `:root[data-theme="dark"]` and `@media (prefers-color-scheme: dark)` (when theme=system). Tokens:

| token | Light | Dark |
|---|---|---|
| `--bg` | `#fbfaf8` | `#1c1a17` |
| `--surface` | `#ffffff` | `#26231f` |
| `--sidebar` | `#f4f1ec` | `#211e1a` |
| `--text` | `#2e2a23` | `#ece7de` |
| `--text-muted` | `#a89a86` | `#8a8073` |
| `--border` | `#e7e2d9` | `#3a352d` |
| `--accent` | `#c0562f` | `#e0703f` |
| `--accent-weak` | `#faece6` | `#3a2a22` |

- Radius `8px`; base spacing scale `4/8/12/16`; hover = subtle `--accent-weak` bg or border.
- Selected tree node: `--accent-weak` bg + `--accent` text/left-border.
- Chips: `--surface` bg + `--border`; add-chip: dashed `--accent` border + `--accent` text.
- Icons: Lucide, `18px`, `currentColor`, `stroke-width 2`.

## 6. Adaptive rendering (DetailPane by `classify`)
- **object** → `ObjectForm`: rows of `key` label + editor. Scalars inline; nested object/array → drill-in row.
- **array-of-objects** → `ObjectArrayTable`: full table, add/delete rows.
- **array-of-scalars** → `ScalarArrayEditor`: chips, add/remove.
- **array-mixed** → `MixedArrayList`: drill-in rows, add/delete.
- **leaf** (string/number/boolean/null) → `LeafEditor`.
Empty document → friendly empty state ("Open a JSON file to start — Ctrl+O") with an Open button.

## 7. Error handling (unchanged behavior, English copy)
- Invalid JSON on open → error toast/dialog: `Invalid JSON file: <msg>`; state unchanged.
- Read/write failure → error toast with OS message.
- Save with no path → Save As dialog.
- Dirty-close → confirm dialog (browser `beforeunload`).

## 8. Testing
- **Keep** all 31 v1 tests (jsonModel, round-trip vs real reading-folders data, stores, fileService serialize) — unchanged since logic is untouched.
- **Add unit tests** — `history.ts`: push/undo/redo/reset, canUndo/canRedo, redo-cleared-on-push.
- **Add component tests** —
  - TreePane: clicking a node sets `selectedPath`; search hides non-matching nodes and keeps matched ancestors.
  - DetailPane: renders the correct editor per `classify`; breadcrumb click navigates.
  - ScalarArrayEditor: edit a chip, add chip, remove chip → correct `jsonModel` calls / store result.
  - ObjectArrayTable: edit cell, add row, delete row.
  - Undo/redo via store: edit → undo restores previous → redo re-applies.
- **Manual acceptance** — `tauri dev`, open `reading-folders-data.json`: navigate folders→cards→words, edit a word, Undo, Redo, Ctrl+S (toast appears), toggle dark mode, search "ai". Confirm file on disk stays valid + structurally intact.

## 9. Repo structure (additions)
```
src/
  App.svelte                       # 2-pane shell (rewritten)
  app.css                          # design tokens + base
  lib/
    stores.ts                      # + selectedPath, theme, history wiring
    history.ts                     # undo/redo (pure)
    jsonModel.ts                   # unchanged
    fileService.ts                 # English copy; unchanged behavior
    components/
      Toolbar.svelte  TreePane.svelte  TreeNode.svelte
      DetailPane.svelte  Breadcrumb.svelte  Toast.svelte
    editors/
      ObjectForm.svelte  ObjectArrayTable.svelte
      ScalarArrayEditor.svelte  MixedArrayList.svelte  LeafEditor.svelte
tests/                             # + history.test.ts, component tests
```
`lib/Node.svelte` (v1) is removed once its behavior is covered by the new editors.
New dependency: `lucide-svelte`.

## 10. Deferred to later
Keyboard navigation in tree, confirm-delete option, multi-select, column reorder, persist last-opened file, per-project themes.
