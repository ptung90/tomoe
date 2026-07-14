# Pure Text Edit Mode — Design Spec

**Date:** 2026-07-05
**Status:** Approved (design), ready for implementation plan
**Repo:** `d:\github\json-table-editor`
**Builds on:** two-level editor mode + UI redesign (shipped)

## 1. Purpose

Power users sometimes want to edit a node's JSON **as raw text** — faster than clicking through form fields for bulk changes. Add a **Text** tab to the editor panel that shows the currently-selected node as raw JSON in a textarea, validates it strictly, and offers a one-click **Auto-fix** for lenient input. Editing is scoped to the **active node only**; the rest of the document is untouched.

### Success criteria
- The editor panel has **Form | Text** tabs. Text shows `JSON.stringify(node, null, 2)` for the node at `selectedPath`, editable.
- Strict validation with a clear, live status ("Valid JSON" / "Error: … (line, col)").
- **Apply** commits the parsed value to the active node (through the normal edit pipeline, undo/redo tracked); **Revert** discards the draft.
- **Auto-fix** repairs common mistakes (trailing commas, comments, single quotes, unquoted keys) via a lenient JSON5 parse and normalizes back to strict JSON for review before Apply.
- Editing the **root** node = editing the whole document as text.
- No change to `jsonModel.ts`, round-trip integrity, or existing Form behavior.

### Non-goals
- Syntax highlighting / line numbers / a full code editor (plain textarea in v1).
- Auto-applying lenient input silently (Auto-fix is explicit).
- Editing multiple nodes at once, or a diff view.

## 2. Decisions (locked during brainstorming)

| Area | Decision |
|---|---|
| **Trigger** | **Form / Text tabs** at the top of the editor panel (below breadcrumb). `editorTab` store, default `form`, session-scoped. |
| **Commit** | Explicit **Apply** (validate strict → commit) + **Revert**. Not live, not on-blur. |
| **Validation** | Strict `JSON.parse`; live status with best-effort line/col from the error position. |
| **Auto-fix** | Explicit button; lenient **JSON5** parse → normalize to strict 2-space JSON in the textarea for review (does not auto-commit). |
| **Scope** | The node at `selectedPath` only (root = whole document). Commit replaces just that subtree via `editValue`. |
| **Draft** | Local to the Text view; discarded on node change or tab switch unless Applied. |

## 3. Architecture

`jsonModel.ts` is untouched. Commit reuses `editValue(path, value)` (already routes through history/undo). New: a pure `jsonText.ts` helper, a `TextEditorView.svelte`, an `editorTab` store flag, a tab bar in `DetailPane`, and the `json5` dependency.

### `lib/jsonText.ts` (pure, unit-tested)
- `type ParseResult = { ok: true; value: JsonValue } | { ok: false; error: string; line?: number; col?: number }`
- `formatNode(value: JsonValue): string` — `JSON.stringify(value, null, 2)`.
- `validateJson(text: string): ParseResult` — strict `JSON.parse`; on failure return `error` (message) plus `line`/`col` derived from a `position N` in the message (best-effort).
- `autoFix(text: string): ParseResult` — `JSON5.parse`; on success `{ ok, value }` (caller re-formats), else `{ ok:false, error }`.

### `lib/components/TextEditorView.svelte`
- Props: none (reads `selectedPath`, `data`).
- Local `draft = $state<string>('')`; `$effect` (re)loads `draft = formatNode(getAtPath(data, selectedPath))` whenever `selectedPath` or the underlying node identity changes and the field is not being actively edited (reload on node change; see §4).
- Derived `result = validateJson(draft)`; status line reflects it.
- Buttons: **Apply** (`disabled = !result.ok`) → `editValue($selectedPath, result.value)`; **Revert** → reload draft from node; **Auto-fix** (`disabled = result.ok`) → `autoFix(draft)`; if ok set `draft = formatNode(value)`, else show `error`.
- Monospace textarea, fills the panel, vertical scroll.

### `lib/components/DetailPane.svelte` (modify)
- Add a tab bar (Form | Text) below `Breadcrumb`, bound to `editorTab`.
- If `editorTab === 'text'` and `$data !== null` → render `<TextEditorView>`; else the existing Form content (NodeView / TwoLevelView / ParentTwoLevelView logic, unchanged).

### `lib/stores.ts` (modify)
- `editorTab: Writable<'form' | 'text'>` (default `'form'`).
- `setEditorTab(t: 'form' | 'text'): void`.
- (Session-scoped; not persisted.)

### Dependency
- `json5` (^2.2.3) — small, bundled, offline-safe.

## 4. Data flow / behavior
1. User clicks the **Text** tab → `editorTab='text'` → `TextEditorView` loads the active node's JSON into the textarea.
2. Typing updates `draft`; `validateJson(draft)` runs → status line + Apply/Auto-fix enabled states.
3. **Apply** (valid) → `editValue(selectedPath, value)` → data updates via history (undo/redo) → dirty=true. Draft stays (now equals the node).
4. **Auto-fix** (invalid) → JSON5 parse; success → `draft` replaced with normalized JSON (still needs Apply); failure → error message.
5. **Revert** → `draft = formatNode(current node)`.
6. Changing `selectedPath` (tree/breadcrumb) → `$effect` reloads `draft` from the new node (unapplied draft discarded).
7. Switching to the **Form** tab → `TextEditorView` unmounts; any unapplied draft is discarded (Apply first to keep). Form reflects committed data.
8. Root selected → textarea shows the whole document; Apply replaces the whole document.

## 5. Error handling / edge cases
- Invalid JSON → Apply disabled; status shows message + line/col (best-effort; line/col omitted if position not parseable).
- Auto-fix fails (even JSON5 can't parse) → status: "Cannot auto-fix: <message>".
- JSON5 quirks: `NaN`/`Infinity` normalize to `null` on `JSON.stringify`; comments are stripped. Acceptable; documented.
- Empty textarea → invalid (Apply disabled).
- Node deleted/undone while editing (selectedPath clamps) → `$effect` reloads draft from the new active node.

## 6. Visual
- Tab bar: two text buttons; active tab uses `--accent` underline/color; inactive muted. Sits between breadcrumb and content.
- Textarea: `font-family: ui-monospace, monospace`, fills available height, `--surface` bg, `--border`.
- Status line: green (`#2e7d32`-ish or accent-neutral) when valid, red (`#c0392b`) when invalid.
- Buttons styled like existing toolbar/add buttons (accent for Apply).

## 7. Testing
- **`jsonText`:** `formatNode` shape; `validateJson` ok for valid, error+line/col for `{"a":}`/trailing comma; `autoFix` repairs trailing comma, single quotes, unquoted keys, `//` comments; `autoFix` fails on truly broken input.
- **`TextEditorView`:** loads node JSON; invalid draft → Apply disabled + error shown; Auto-fix turns lenient text into valid + enables Apply; Apply calls `editValue(selectedPath, value)` (assert store `data` updated); Revert restores.
- **`DetailPane`:** Text tab renders TextEditorView; Form tab renders the structured editor; switching tabs works.
- Keep all existing tests; `jsonModel` untouched → round-trip unaffected.
- **Manual acceptance:** `tauri dev`, select a node → Text tab → shows its JSON; break it → error + Apply disabled → Auto-fix → Apply → tree/Form reflect the change; Ctrl+Z undoes; select root → edit whole doc → Apply → Save.

## 8. Repo structure (additions)
```
src/lib/
  jsonText.ts                       # new — validate/autofix/format (pure)
  components/
    TextEditorView.svelte           # new — raw text editor for active node
    DetailPane.svelte               # modified — Form|Text tab bar + branch
  stores.ts                         # + editorTab, setEditorTab
tests/                              # + jsonText, TextEditorView, DetailPane (tab)
package.json                        # + json5
```

## 9. Deferred
Syntax highlighting, line numbers, format-on-type, JSON Schema validation, editing across nodes, keyboard shortcut to toggle tabs.
