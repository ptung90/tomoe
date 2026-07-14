# Tomoe — Preview & Style polish (design + plan)

Date: 2026-07-15. Source: morning-preview feedback (4 UI tasks). Attended batch —
implemented directly on `feat/preview-style-polish` with tests + gates (not the
heavy per-task-subagent SDD, given size). Module: `src/lib/modules/flashcards/`.

## Tasks

1. **Align button icons** — `RichText.svelte` toolbar uses glyphs `⬅ ⬌ ➡` for text-align (the center `⬌` reads as a two-way arrow). Replace with lucide `align-left`/`align-center`/`align-right` (subpath imports), consistent with the rest of the UI.
2. **Zoom in card preview** — `CardPreview.svelte` is auto-fit only. Add **Ctrl/⌘ + wheel** zoom over the canvas (gesture, per the chosen UX — no toolbar control), with **double-click to reset** to fit. Pure clamp/scale helpers in `lib/zoom.ts` (unit-tested); the wheel wiring is human-verified.
3. **StyleControls — add properties + rearrange** — expose all three groups the render engine already honors (verified in `card-render.ts`: `buildFontOverride` reads family/weight/lineHeight/textAlign; `margin`/`padding`/`imgPadding`/`textVAlign`/`image.*`/`threeCardFit` all consumed → **no engine change**):
   - **Typography** (Title + Content): font family, weight, line-height, text-align (segmented, reusing the lucide align icons from #1).
   - **Spacing & layout**: card margin, padding, image padding (all mm), vertical text align (top/middle/bottom).
   - **Image**: fit (`backgroundSize` cover/contain), position (`backgroundPosition`), 3-card fit (`threeCardFit`).
   - Rearrange into collapsible `<details>` groups (Border + Spacing open by default; Title/Content/Image collapsed) so the denser panel stays scannable.
4. **Right panel bigger by default** — `Workspace.svelte` `rightWidth` 360 → **440** (within the existing 240–720 clamp). Bump `CardPreview`'s pre-bind fallback `paneW` 360 → 440 to match.

## Decisions

- **Zoom = Ctrl/⌘ + wheel gesture** (user choice), no persistent toolbar control; double-click resets to fit. Effective scale = explicit user zoom when set, else the existing auto-fit. `overflow:auto` canvas scrolls when zoomed past the pane; `justify-content: safe center` prevents left-edge clipping of an over-wide card.
- **No render-engine changes** — every new StyleControls property is already consumed by `buildCardHTML`; this is purely surfacing existing knobs.
- **Direct implementation** (attended, small) with the same gates as every other change: `npm run check` 0 errors · `npm test` green, 0 unhandled · `npm run build` OK. Card interior stays fixed print colors; chrome = Calm Paper tokens; lucide subpath imports.
- **All settings edits** go through the existing `setSettings(patch)` (immutable merge), spreading the current nested object — same pattern StyleControls already uses.

## Testing

- `zoom.test.ts`: `clampZoom` (min/max bounds, step). Pure.
- `StyleControls.test.ts` (extend/replace): the new controls render; changing font family / line-height / vertical-align / image-fit calls `setSettings` with the correct patch; text-align segmented buttons set the font's `textAlign`.
- `RichText` align icons: no jsdom test (TipTap component) — visual, human-verified; `check`/`build` gate.
- `Workspace` default width: no assertion (brittle) — existing workspace test stays green; human-verified.
- **Manual (human):** align icons render correctly; Ctrl/⌘+wheel zooms + double-click resets; new style controls all change the preview live; right panel is wider on open.

## Files

```
src/lib/modules/flashcards/
  components/RichText.svelte      # MODIFY (T1): lucide align icons
  components/CardPreview.svelte   # MODIFY (T2): ctrl+wheel zoom + dblclick reset
  lib/zoom.ts                     # NEW (T2): clampZoom helper
  components/StyleControls.svelte # MODIFY (T3): 3 groups + collapsible rearrange
  Workspace.svelte                # MODIFY (T4): rightWidth default 440
tests/ zoom.test.ts (NEW), StyleControls.test.ts (extend)
```
