# Two-Level Editor Mode — Design Spec

**Date:** 2026-07-05
**Status:** Approved (design), ready for implementation plan
**Repo:** `d:\github\json-table-editor`
**Builds on:** `2026-07-05-json-table-editor-ui-redesign-design.md` (2-pane redesign shipped)

## 1. Purpose

Today the editor panel shows **one level**: the node at `selectedPath`. Nested containers appear as "drill-in" rows — to edit a child you click in and lose sight of the parent. For data like `folder → cards`, editing a folder's cards means leaving the folder view.

Add a **toggleable "2-column" mode**: when on, the editor panel splits so you can **see and edit two levels at once** — the object's own fields on the left, and one selected nested child expanded and editable on the right.

### Success criteria
- A toolbar toggle switches the editor between normal 1-level view and 2-column view; the choice is remembered across sessions.
- In 2-column mode, editing a scalar field (left) and editing a nested child's contents (right) both work without leaving the parent.
- The mode degrades gracefully: it only splits when it helps (an object with nested children); everything else renders as it does today.
- No change to the tree, breadcrumb, undo/redo, save, round-trip integrity, or the existing 1-level behavior when the mode is off.

### Non-goals
- More than two levels at once (deeper editing re-roots the two columns — see §4).
- A resizable splitter, remembering which child was open per node, or a 3-column variant.
- Any change to `jsonModel.ts` or the data model.

## 2. Decisions (locked during brainstorming)

| Area | Decision |
|---|---|
| **Display style** | Two columns inside the editor panel: left = level 1 (fields), right = level 2 (selected child). |
| **Toggle** | A toolbar toggle button; state persisted to `localStorage` (like theme). |
| **Left column** | Lists **all** fields. Scalars edit inline on the left; container fields (object/array) are selectable rows that open on the right. |
| **Scope** | 2-column activates **only** when the mode is on **and** the selected node is a plain object with ≥1 container child. Otherwise (tables, chips, leaves, all-scalar objects, mode off) → the normal 1-level view. |
| **Sub-selection** | Which child is open on the right is **panel-local** state; it does not move the tree's `selectedPath`. Resets when the main selection changes; auto-selects the first container child. |
| **Deeper than 2** | A drill-in inside the right column calls the main `select()` → the tree selection moves there and the two columns re-root, always showing exactly two levels. |

## 3. Architecture

`jsonModel.ts` is untouched. One small refactor plus two new components and a store flag.

### Refactor: extract `NodeView`
The adaptive "pick an editor by `classify`" block currently lives inline in `DetailPane.svelte`. Extract it into **`lib/components/NodeView.svelte`** (`{ value: JsonValue; path: Path }` → renders `ObjectForm` / `ObjectArrayTable` / `ScalarArrayEditor` / `MixedArrayList` / `LeafEditor`). Both `DetailPane` (1-level) and the right column of the 2-column view reuse it. DRY, and keeps the dispatch in one place.

### Components
- **`DetailPane.svelte`** (modify) — after the empty/`$data===null` check and Breadcrumb, branch:
  - if `$twoLevel` **and** `classify(node)==='object'` **and** the object has ≥1 container child → `<TwoLevelView value={node} path={selectedPath} />`
  - else → `<NodeView value={node} path={selectedPath} />` (current behavior).
- **`TwoLevelView.svelte`** (new) — the two-column layout:
  - **Left:** iterate the object's keys. Scalar/`null` value → `LeafEditor` inline (path `[...path, key]`). Container value → a selectable button row (shows key + summary); clicking sets local `subKey`. The open row is highlighted (accent).
  - **Right:** `NodeView` for the child at `[...path, subKey]` (only when `subKey` is set).
  - Local `subKey = $state<string | null>(null)`; an `$effect` keyed on `path`/keys resets and auto-selects the first container key. If the current `subKey` no longer exists (edit/undo removed it), re-pick the first container or `null`.
- **`Toolbar.svelte`** (modify) — add a toggle button (Lucide `columns-2`), `aria-pressed`/active style bound to `$twoLevel`, `onclick={() => setTwoLevel(!$twoLevel)}`, title "Two-column mode".

### State (`stores.ts`)
- `twoLevel: Writable<boolean>` (default from `localStorage['jte-two-level']`, else `false`).
- `setTwoLevel(on: boolean): void` — sets the store and persists.
- Persistence: a tiny `loadBool`/`saveBool` in `theme.ts` (or a new `prefs.ts`) reused for the key `jte-two-level`. (Theme already owns a similar pattern; keep them side by side.)

### Helper for "has container child"
A pure predicate `hasContainerChild(v: JsonValue): boolean` (in `pathUtils.ts` or a small `nodeUtils.ts`, unit-tested): true when `v` is a plain object with at least one value whose `classify` is `object`/`array-*`. Used by `DetailPane` and `TwoLevelView`.

## 4. Interaction / data flow

1. **Toggle on** (toolbar) → `twoLevel=true`, persisted. DetailPane re-evaluates.
2. **Select an object with nested children** (via tree) → 2-column view; first container child auto-opens on the right.
3. **Edit a scalar on the left** → `editValue([...path, key], v)` (unchanged pipeline, undo-tracked).
4. **Click a container on the left** → local `subKey` changes → right column shows that child.
5. **Edit inside the right column** → normal editors call the same store actions on absolute paths.
6. **Drill-in inside the right column** (a deeper container) → `select([...path, subKey, deeperKey])` → tree selection moves; TwoLevelView re-roots at the new parent (its `$effect` resets `subKey`).
7. **Toggle off / select a non-qualifying node** → normal 1-level `NodeView`.

Undo after a delete may remove the open child: the `$effect` clamps `subKey` back to a valid container (or `null`, showing a right-column placeholder "Select a field on the left").

## 5. Visual

- Two columns via CSS grid inside the detail content: `grid-template-columns: minmax(240px, 40%) 1fr; gap`. A vertical `--border` divider. Each column scrolls independently (`overflow:auto`, `min-height:0`).
- Left container rows: same look as `ObjectForm` drill rows; the **open** one uses `--accent` background + white text (consistent with the selected tree node).
- Toolbar toggle: active state uses `--accent-weak` background + `--accent` (same pattern as other pressed controls).
- Narrow windows: columns keep the grid (horizontal scroll inside the panel if needed); no responsive stacking in v1.

## 6. Error handling / edge cases
- Object has containers but user closed the right (subKey null) → right shows a muted placeholder.
- `subKey` points at a now-missing field (after undo/remove) → `$effect` re-selects first container or null.
- Mode on but node is all-scalar object / array / leaf → 1-level view (no empty right column).
- Empty document → existing empty state (unchanged).

## 7. Testing
- **`nodeUtils`/predicate:** `hasContainerChild` — true for object with nested object/array, false for all-scalar object, arrays, scalars, null.
- **`twoLevel` store:** persists to and loads from localStorage; `setTwoLevel` toggles.
- **`NodeView`:** renders the correct editor per `classify` (moves DetailPane's existing coverage here).
- **`TwoLevelView`:** left lists fields; editing a left scalar updates data; clicking a container opens it on the right (right shows its content); a deep drill-in calls `select()` with the deeper path.
- **`DetailPane`:** `twoLevel=on` + object-with-containers → two columns rendered; all-scalar object or array → single view.
- **`Toolbar`:** toggle button flips `twoLevel`.
- Keep all existing tests; `jsonModel` untouched → round-trip tests unaffected.
- **Manual acceptance:** `tauri dev`, open reading-folders, toggle 2-column on a `folder` → edit `keySound` (left) and `cards` (right) together; drill into a card; toggle off restores 1-level; reload keeps the toggle.

## 8. Repo structure (additions)
```
src/lib/
  components/
    NodeView.svelte       # new — adaptive editor dispatch (extracted from DetailPane)
    TwoLevelView.svelte   # new — 2-column view
    DetailPane.svelte     # modified — branch to TwoLevelView / NodeView
    Toolbar.svelte        # modified — toggle button
  stores.ts               # + twoLevel, setTwoLevel
  nodeUtils.ts            # new — hasContainerChild (pure)
  theme.ts                # + shared bool persist helper (or new prefs.ts)
tests/                    # + nodeUtils, twoLevel, NodeView, TwoLevelView, DetailPane, Toolbar
```

## 9. Deferred
Resizable splitter, per-node remembered sub-selection, 3-column / N-level, responsive stacking on narrow widths, showing the parent level as context (the rejected interpretation).
