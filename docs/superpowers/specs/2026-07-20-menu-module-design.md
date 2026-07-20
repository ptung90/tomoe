# Menu module — design

Date: 2026-07-20
Status: Design (approved) → ready for implementation plan
Author: Tung + Claude

## Purpose

A new Tomoe module, `menu`, for building weekly meal-plan tables (the
kindergarten "Thực đơn tháng X - Tuần Y" green tables). It turns a bank of
dishes into a weekly table: the user auto-fills a week from the dish bank with
rotation and ingredient balancing, tweaks individual cells, and exports the
table as a PNG image (primary), or PDF/print (secondary).

The module is fully isolated on the shared shell (`TomoeModule` contract), like
`flashcards` and `json-table`. Nothing bypasses the contract; the shell stays
thin.

## Decisions (from brainstorming)

- **Automation level:** dish bank with auto-fill/rotation, **plus** optional AI.
- **Output:** weekly table rendered like the reference images, **+ export PNG**
  (paste to Zalo/Facebook). PDF/print kept reachable since cheap once the table
  renders.
- **Row structure:** fully customizable template — meal periods (Trưa/Xế…) and
  dish categories (Món mặn/rau/canh/cơm/trái cây…), add/remove/reorder/rename,
  hide a category's label cell.
- **File scope:** many weeks per file (a month / school year); dish bank is a
  shared library in `localStorage` (like the flashcards Schema Library).
- **Build approach:** Approach A — a fresh, focused `menu` module reusing only
  leaf utilities (`history`, `html-to-image`, `jspdf`, Anthropic SDK,
  `fileSync`, Calm Paper tokens). NOT folded into flashcards.
- **Ingredient balancing:** dishes carry a 2nd-level `ingredientType`
  (thịt/cá/trứng/tôm…) used only to spread variety across a week. Balancing is
  **opt-in per category** (default off); default cap = 2 of the same type per
  week (configurable).
- **Per-cell editing:** after auto-fill, any cell can be edited by hand or
  re-rolled individually. "Fill week" has two modes: *only empty cells* /
  *overwrite all*. **No cell lock/pin** (YAGNI) — to preserve manual edits, use
  the *only empty cells* mode.
- **No multi-locale** for cells — the menus are Vietnamese-only; cells are plain
  strings. (Keeps the model simple; can revisit later.)

## Data model

New folder `src/lib/modules/menu/`. The document (`T` of `History<T>`):

```ts
interface MenuDoc {
  version: number;
  projectName: string;      // e.g. "Thực đơn mầm non 2026"
  projectIcon: string;      // emoji, e.g. "🍱"
  template: MenuTemplate;   // structure shared by every week
  weeks: MenuWeek[];        // the sequence of weeks in this file
  settings: MenuStyle;      // table styling (header color, fonts, border…)
  editLog?: EditLogEntry[]; // { by, at } — same pattern as flashcards
}

interface MenuTemplate {
  days: string[];           // column labels, e.g. ["Thứ 2","Thứ 3","Thứ 4","Thứ 5","Thứ 6"]
  periods: MenuPeriod[];    // meal periods
}
interface MenuPeriod {
  id: string;
  label: string;            // "Trưa" / "Xế" — spans its categories' rows (rowspan)
  categories: MenuCategory[];
}
interface MenuCategory {
  id: string;               // stable unique id (cells key off this)
  key: string;              // slug tying dishes to this row: "man","rau","canh","com","traicay","trangmieng"
  label: string;            // display: "Món mặn"
  hideLabel?: boolean;      // render an empty label cell (the unlabeled dessert row)
  defaultValue?: string;    // auto-fill constant, e.g. Cơm → "Cơm trắng"
  balanceByIngredient?: boolean; // opt-in: spread ingredientType across the week (default off)
  maxPerTypePerWeek?: number;    // cap per ingredient type per week when balancing (default 2)
}

interface MenuWeek {
  id: string;
  title: string;            // "Thực đơn tháng 6 - Tuần 2" — editable; may be auto-built from month/weekNo
  month?: number;
  weekNo?: number;
  cells: Record<string, string>; // key = `${categoryId}:${dayIndex}` → dish text ("Thịt kho trứng")
}
```

**Dish bank** — a shared library in `localStorage` under `tomoe.menu.dishBank`,
NOT part of any `MenuDoc` (reused across files), mirroring the flashcards Schema
Library pattern (single source of truth = localStorage; a version counter drives
recompute):

```ts
interface Dish {
  id: string;
  name: string;             // "Cá diêu hồng chiên"
  categoryKey: string;      // LEVEL 1 — which row it belongs to (matches MenuCategory.key)
  ingredientType?: string;  // LEVEL 2 — "thit","ca","trung","tom","muc","bo","ga","vit","dau"… (free text, suggested list)
  tags?: string[];
}
```

Rotation history (which dish was used in which week) is derived from the
document's `weeks[].cells` at fill time — no separate persisted "lastUsed" field
needed (avoids drift). A suggested `ingredientType` list is offered in the UI but
free text is allowed.

### Settings (`MenuStyle`)

Self-contained table styling so the exported PNG looks identical regardless of
the app's light/dark theme:

- `headerColor` (default green ≈ the reference images), `headerTextColor`
- `title` font spec (family/size/weight/color) and `cell` font spec
- `border` (width/style/color), optional zebra striping
- `paperSize` / `orientation` for PDF/print

The app chrome around the table uses Calm Paper tokens (`var(--accent)` teal
etc.); the **table itself** uses `MenuStyle` colors, never theme tokens.

## Auto-fill / rotation (`fillWeek`)

Pure, injectable function for TDD:

```ts
fillWeek(template, bank, recentWeeks, opts) → cells
// opts: { mode: 'empty-only' | 'overwrite', avoidWeeks?: number (default 2), rng? }
```

Per `(category × dayIndex)`:

1. If `mode === 'empty-only'` and the cell already has text → keep it.
2. If the category has `defaultValue` → fill it (e.g. "Cơm trắng" every day).
3. Otherwise pick a dish whose `categoryKey` matches, from candidates that are:
   - not already used elsewhere in this same week, and
   - not used in the last `avoidWeeks` weeks (derived from `recentWeeks`).
4. Among valid candidates, if `category.balanceByIngredient` → prefer the
   `ingredientType` currently **least** represented in this week, respecting
   `maxPerTypePerWeek`. Otherwise pick at random (shuffled for variety).
5. **Exhaustion fallback:** if no valid candidate (bank too small / cap hit),
   progressively relax — first drop the avoid-weeks window, then the cap, then
   allow in-week repeat — and record that a relaxation happened so the UI can
   warn ("kho món chưa đủ cho nhóm X").

Randomness at runtime uses `Math.random`; tests inject `rng` / a fixed candidate
order so the core stays deterministic and testable.

### Per-cell actions (after fill)

- **Edit by hand:** click a cell → type any text (need not exist in the bank).
- **Re-roll one cell:** button on the cell → pick a different dish for that
  category respecting the same in-week + rotation + balance rules.
- **Fill week:** two modes as above (empty-only / overwrite). No cell locking.

## Render + export

- Pure `renderWeekTable(week, template, settings) → string` producing an HTML
  `<table>` matching the reference layout:
  - top title row (colored header background, centered),
  - a period-label column whose cell uses `rowspan` across that period's
    categories (Trưa/Xế),
  - a category-label column (empty when `hideLabel`),
  - one column per `template.days` entry.
- Rendered into a live preview pane via `{@html}` (same approach as flashcards
  `card-render`).
- **PNG (primary):** `html-to-image` `toPng()` on the table node rendered
  offscreen at a fixed width on a light background → save via the Tauri fs/dialog
  plugins. One PNG per week (current week, or a chosen set).
- **PDF/print (secondary):** `jspdf` embeds the PNG into a page; a print CSS path
  drives `window.print`. Filenames slugified from the week title.

## Workspace UI (`Workspace.svelte`)

- **Left:** week list — add / duplicate / delete / reorder, and **"Tự bốc cả
  tuần"** (with the two modes). Access to the Template editor and the Dish Bank.
- **Center:** the week table, cells editable inline; each cell has a re-roll
  affordance. This is the real render (live preview == export).
- **Top/side:** style settings (header color / fonts), export buttons
  (PNG / PDF / print), and the AI action.
- **Dish Bank modal:** dishes grouped by `categoryKey`, each with its
  `ingredientType`; add / edit / delete / import; **"gom món từ tuần hiện tại
  vào kho"** (harvest current week's cells into the bank).
- **Template editor:** add/remove/reorder periods & categories, rename, toggle
  `hideLabel`, set `defaultValue`, toggle `balanceByIngredient` + cap.

## Module wiring (shell integration)

- `module.ts` implements `TomoeModule`:
  `id: 'menu'`, `label: 'Thực đơn'`, `extensions: ['menu.tomoe.json']`,
  `matches(text)` sniff, `Workspace`, `newDoc`/`open`/`save`/`saveAs`, and
  `dirty`/`canUndo`/`canRedo`/`undo`/`redo` backed by a per-module `stores.ts`
  wrapping one `History<MenuDoc>` (same shape as flashcards).
- Register in `registry.ts` `MODULES`.
- **Routing (`pickModuleForOpen`):** add `path.endsWith('.menu.tomoe.json') →
  menu` **before** the `.tomoe.json → flashcards` branch (because
  `.menu.tomoe.json` also ends with `.tomoe.json`). Sniff `matches` = parsed
  object has a `template` with `periods` **and** an array `weeks`.
- Add a "New menu" entry to `StartScreen`. Icon via lucide subpath import
  (e.g. `lucide-svelte/icons/utensils`), never the barrel.
- Save layer mirrors flashcards `io/saveService` + `fileSync` (external-change
  baseline hash, save-conflict handling), scaled down to this module's needs.

## AI (optional, last phase)

"Sinh tuần bằng AI": a prompt (e.g. "thực đơn tháng 6, mầm non") → Anthropic SDK
returns a week's `cells` matching the template's categories, and may propose new
dishes to add to the bank. Reuses the flashcards AI config pattern (apiKey/model
in `localStorage`, NOT in the document). One operation; user edits afterward.

## Testing (TDD — pure logic first)

- `fillWeek`: rotation avoid-repeat window, ingredient balancing + cap,
  `defaultValue`, empty-only vs overwrite, exhaustion relaxation + warning flag.
- `renderWeekTable`: rowspan grouping, `hideLabel` empty cell, title row, day
  columns, settings-driven colors.
- Model: `parseMenuDoc` / `serializeMenuDoc` round-trip (trailing `\n`),
  tolerance for missing optional fields.
- Routing: `pickModuleForOpen` for `.menu.tomoe.json` and the content sniff (must
  not be captured by flashcards).
- Dish bank library ops (add/edit/delete/import/harvest) against localStorage.

## Implementation phases (for the plan)

1. Model + routing + save/load (round-trip tests, shell wiring, empty Workspace).
2. Template editor + week editor + `renderWeekTable` live preview.
3. Dish bank (localStorage lib) + `fillWeek` rotation + ingredient balancing +
   per-cell re-roll.
4. Export: PNG (primary), then PDF/print.
5. AI week generation.

## Non-goals (YAGNI)

- Multi-locale cells; cell lock/pin; nutrition/calorie tracking; cost
  accounting; drag-drop dishes from a palette; server sync. Not in this spec.
