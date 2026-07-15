# Calm Paper — Design Theme

A small, portable design system extracted from **json-table-editor**. Copy this
folder (`theme.css` + this doc) into any project. It's plain CSS custom
properties + a few component classes — framework-agnostic (works in Svelte,
React, plain HTML, etc.).

**The one thing you change per project: the accent (main) color.** Everything
else is a warm-neutral "paper" system that stays constant.

---

## 1. Philosophy

- **Calm & warm.** Off-white paper surfaces, soft 8px radius, generous spacing, hairline borders. Nothing shouts.
- **One accent.** A single brand color drives every emphasis. Swap it and the whole app reskins.
- **Consistent emphasis rule:**
  - **solid `--accent`** → *selected / primary / current* (selected tree row, primary button, chat header, toast).
  - **`--accent-weak` background** → *hover / soft-active* (button hover, active toggle).
  - **`--border` hairline** → resting separators.
- **Light + dark parity.** Same tokens, two value sets; follows the OS, overridable.
- **Icons:** [Lucide](https://lucide.dev) via **subpath imports** (see §6) — thin stroke, `currentColor`, so they inherit the accent on hover.

---

## 2. Files

| File | What |
|------|------|
| `theme.css` | Tokens (light/dark) + base element styles + component classes. Import it once, globally. |
| `DESIGN-THEME.md` | This guide. |

Import (any project): `import './design-theme/theme.css'` (or `<link rel="stylesheet" href="design-theme/theme.css">`).

---

## 3. Tokens

| Token | Light | Dark | Use |
|-------|-------|------|-----|
| `--accent` | `#c0562f` | `#e0703f` | **Brand.** primary/selected/links/focus |
| `--accent-weak` | `#faece6` | `#3a2a22` | **Brand tint.** hover / active bg / chips |
| `--danger` | `#b91c1c` | `#f87171` | destructive text/icon (delete, remove) |
| `--danger-weak` | `color-mix(10% danger)` | `color-mix(22% danger)` | soft danger hover background |
| `--danger-border` | `color-mix(25% danger)` | `color-mix(40% danger)` | soft danger border |
| `--bg` | `#fbfaf8` | `#1c1a17` | app background |
| `--surface` | `#ffffff` | `#26231f` | cards, inputs, panels |
| `--sidebar` | `#f4f1ec` | `#211e1a` | secondary surface |
| `--text` | `#2e2a23` | `#ece7de` | primary text |
| `--text-muted` | `#a89a86` | `#8a8073` | labels, hints |
| `--border` | `#e7e2d9` | `#3a352d` | hairlines |
| `--radius` / `--radius-lg` | `8px` / `12px` | — | corners |
| `--space-1..4` | `4/8/12/16px` | — | spacing rhythm |
| `--shadow` / `--shadow-lg` | — | — | toast / modal elevation |

Always style with the tokens (`color: var(--text)`), never hard-coded hex — that's what makes reskinning free.

---

## 4. Reskinning (change the main color)

Edit `theme.css`: set `--accent` + `--accent-weak` in **all three** places — the light `:root`, the `@media (prefers-color-scheme: dark)` block, and the `:root[data-theme="dark"]` block.

- **`--accent`**: your brand color. In dark mode use a slightly **lighter/brighter** version so it pops on the dark surface.
- **`--accent-weak`**: light mode = a *very pale tint* of the accent (~8–10% toward white/paper); dark mode = a *dark muted tint* (accent mixed into the dark surface).

Ready-made pairs (light `--accent` / dark `--accent`; pick a matching weak tint):

| Palette | Light accent | Dark accent | Light weak | Dark weak |
|---|---|---|---|---|
| Terracotta (default) | `#c0562f` | `#e0703f` | `#faece6` | `#3a2a22` |
| Indigo | `#4f46e5` | `#8b85f0` | `#eef0ff` | `#2a2942` |
| Teal | `#0e9488` | `#3fb8ab` | `#e6f5f3` | `#1e332f` |
| Berry | `#a8324f` | `#d06a83` | `#fae9ee` | `#3a2028` |
| Slate | `#475569` | `#8b98ab` | `#eef1f5` | `#2b3240` |

> Tip: if you'd rather not hand-pick `--accent-weak`, modern CSS lets you derive it:
> `--accent-weak: color-mix(in srgb, var(--accent) 10%, var(--surface));`
> Drop that into each block and you only ever set `--accent`.

Dark-mode mechanism: it's automatic via `prefers-color-scheme`. To add a manual toggle, stamp `document.documentElement.setAttribute('data-theme', 'light'|'dark')` (remove the attribute for "follow system"). Persist the choice in `localStorage`.

---

## 5. Component recipes

All classes live in `theme.css`. Compose them; keep the emphasis rule (§1).

- **Toolbar:** `.toolbar` + `.btn-ghost` buttons (icon + label); active toggles get `.btn-ghost.active`.
- **Buttons:** `.btn` (neutral), `.btn-primary` (accent), `.btn-ghost` (toolbar), `.icon-btn` (icon only), `.btn-add` (dashed "add").
- **Tabs:** `.tabs` > `.tab` / `.tab.active` (accent underline).
- **Tree / list rows:** `.tree-row` (hover = weak), `.tree-row.selected` (solid accent, white text); `.idx` muted index badge; `.label` truncates with ellipsis (add `title` for the full text).
- **Table:** `.data-table` (muted header w/ 2px underline, 1px row lines).
- **Chips:** `.chip` (pill) — or render list items as full-width rows with a delete button and a trailing `.btn-add`.
- **Key/value form:** `.form-grid` (auto-fills into 2–3 columns) with `.form-row`; give nested-object / long-text rows the `.full` class so they span the whole width.
- **Two-pane + resizable divider:** CSS grid `grid-template-columns: <left>px 6px 1fr` with a `.divider-x` middle column and the `dragX` action below.
- **Modal:** `.modal-backdrop` + `.modal` (header/footer); footer's primary action uses `.btn-primary`. Close on backdrop click + `Esc`.
- **Toast:** `.toast` (solid accent, slide-in, bottom-right), `.toast.error` (red). Auto-dismiss ~2.5s.
- **Floating chat:** `.fab` (accent circle) toggles `.chat-panel`; messages use `.bubble` + `.bubble-user` / `.bubble-assistant`.

### Resizable divider action (Svelte)
```ts
// resize.ts — use:dragX={(dx) => width = clamp(width + dx)}
export function dragX(node: HTMLElement, onDelta: (dx: number) => void) {
  let last = 0, cb = onDelta;
  const move = (e: PointerEvent) => { const dx = e.clientX - last; last = e.clientX; cb(dx); };
  const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up);
                     document.body.style.cursor = ''; document.body.style.userSelect = ''; };
  const down = (e: PointerEvent) => { e.preventDefault(); last = e.clientX;
                     addEventListener('pointermove', move); addEventListener('pointerup', up);
                     document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none'; };
  node.addEventListener('pointerdown', down);
  return { update(n: (dx: number) => void) { cb = n; }, destroy() { node.removeEventListener('pointerdown', down); up(); } };
}
```
(For React/vanilla, the same pointerdown→window move/up pattern applies.)

---

## 6. Icons

Use `lucide-svelte` (or `lucide-react`, etc.). **Import each icon by subpath**, never the barrel — the barrel pulls ~1500 icons and makes builds/tests ~100× slower:

```ts
import ChevronRight from 'lucide-svelte/icons/chevron-right';   // ✅
// import { ChevronRight } from 'lucide-svelte';                 // ❌ slow
```
Render at `size={18}` (toolbar) / `size={14}` (inline), `currentColor` — so hover/selected states recolor them for free. Kebab-case file names: `folder-open`, `trash-2`, `triangle-alert`, `columns-2`, `message-square`, `corner-down-left`, `undo-2`, `settings`.

---

## 7. Quickstart — new project

1. Copy `design-theme/` into the project; import `theme.css` globally.
2. Set your brand: edit `--accent` (+ `--accent-weak`) in the three blocks (§4).
3. Build UI with the tokens and component classes; follow the emphasis rule.
4. (Optional) add a light/dark toggle via `data-theme` + `localStorage`.
5. Icons: `lucide-*` subpath imports at 18px/`currentColor`.

**Keep:** the token names, the emphasis rule, subpath icons, light/dark parity.
**Change freely:** the accent pair, spacing scale, and which components you use.

App-specific bits from json-table-editor that are **not** part of this theme (leave behind): the JSON data model, editors, and the AI/chat logic. The chat *styling* (`.fab`/`.chat-panel`/`.bubble`) is included because it's reusable; the OpenAI calls are not.
