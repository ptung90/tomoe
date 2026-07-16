# Tomoe Spec #14 — Image editor: crop + background eraser (design)

Date: 2026-07-16. Module: `src/lib/modules/flashcards/`.
Decision (user): add a **background-removal tool** for image fields — a simple **chroma-key**
(pick a solid background colour + tolerance → transparent) plus a **manual eraser brush** — and
integrate it INTO the existing crop modal as one "Edit image" dialog with **Crop | Erase** modes,
rather than a separate modal. Output a transparent PNG when erasing; keep JPEG for crop-only.

## Goal

Let a user clean up a flashcard image in place: crop it (existing), then knock out a solid-colour
background (e.g. a white/green product/animal photo) to transparency, with a manual eraser + restore
brush for touch-ups — all client-side, no external/AI service.

## Current state (verified)

- Images are stored per field as a **URL or data URL** (`RecordItem.fields[key]`, image type).
  `ImageField.svelte` has upload (→ data URL), paste-URL, image search, and a **Crop** button that
  opens `CropModal.svelte`.
- `CropModal.svelte` runs **cropperjs** on an `<img>` (sets `crossOrigin='anonymous'` before `src` so a
  CORS-clean remote stays untainted) and `onApply(canvas.toDataURL('image/jpeg', 0.9))`.
- **Correction (verified in code):** there is NO Tauri HTTP plugin. Image search is a plain browser
  `fetch` to the Wikimedia API (`origin=*`, CORS-safe) and returns **Wikimedia image URLs, which serve
  CORS** — so `crossOrigin='anonymous'` keeps their canvas untainted (CropModal already relies on this).
  Adding native HTTP would require a new `@tauri-apps/plugin-http` dependency + `http:` capability +
  Rust registration + a `package.json` change (off-limits) — out of scope. So the real image sources
  (data URLs from upload/crop, and CORS-clean Wikimedia URLs) load fine WITHOUT native HTTP.
- `resolveImgStyle`/card render already handle transparent PNGs (empty image slots are transparent).

## Architecture — evolve CropModal into a 2-mode "Edit image" modal

Keep the filename `CropModal.svelte` (avoids import/test churn) but broaden it into an image editor
with a **mode toggle: Crop | Erase** (opens in Crop). The single trigger in `ImageField` is relabelled
**"Edit image"** (one button, replacing the standalone Crop button).

- **Crop mode**: unchanged cropperjs behaviour.
- **Erase mode**: a pixel canvas with chroma-key + eraser + restore + undo/reset (below).

**Crop → Erase bridge**: switching to Erase bakes the current crop — take cropperjs
`getCroppedCanvas()` as the base image for the erase canvas (natural flow: crop first, erase second).

**Re-crop after erasing (user decision: warn)**: if the user switches back to Crop *after* making
erase edits, confirm first ("Re-cropping discards the erased areas — continue?"); on confirm, re-enter
Crop from the pre-erase source and the erase edits are dropped. No confirm needed if no erase edits yet.

**Apply**: crop-only (no erase touched) → `toDataURL('image/jpeg', 0.9)` (unchanged). Erase used →
`toDataURL('image/png')` (alpha). `onApply(dataUrl)` → the field value.

## Loading the canvas (untainted where possible)

The Erase canvas seeds from the **crop canvas** (`getCroppedCanvas()`, same-origin — always readable)
when reached via Crop, or from the source image loaded with `crossOrigin='anonymous'` (like CropModal)
for data URLs and CORS-clean remotes (Wikimedia). No native HTTP fetch (see the correction above).

**Tainted fallback:** if `getImageData` throws (an arbitrary non-CORS remote pasted by hand), catch it,
show a toast ("Can't edit this remote image — upload it first"), and keep Erase disabled / bail to
Crop-only. This matches CropModal's existing behaviour (its `apply()` already catches the tainted-canvas
throw). No crash. Editing after uploading/cropping to a data URL always works.

## Erase mode — canvas model + tools

- Base image drawn into a `work` canvas; the **original** ImageData kept for Restore + Reset. The
  canvas is shown over a **checkerboard** so transparency is visible.
- **Remove colour (chroma-key)**: auto-pick the dominant corner colour as the default target
  (`pickCornerColor`); an **eyedropper** toggle lets the user click the canvas to pick another target;
  a **tolerance** slider; a "Remove" action erases pixels within tolerance of the target to alpha 0
  (`removeSolidBackground`). Re-runnable (raise tolerance + Remove again removes more); each run is one
  undo step.
- **Eraser brush**: pointer-drag paints transparency (`globalCompositeOperation='destination-out'`,
  arc at the brush radius).
- **Restore brush**: pointer-drag redraws the original image within the brush circle (`source-over`) —
  recovers over-erased areas.
- **Brush size** slider (shared by eraser/restore).
- **Undo** (per chroma-op / per brush stroke; snapshot pushed before each op, capped ~20 to bound
  memory) + **Reset** (back to the original base image).
- **Zoom** (slider / +/− buttons) with the canvas scrolling to pan (brush-drag paints, so pan is via
  scroll, not drag — avoids a tool conflict).

## Pure core (`src/lib/modules/flashcards/lib/imageEdit.ts`) — unit-tested

- `colorDistance(a: [r,g,b], b: [r,g,b]): number` — Euclidean (or max-channel) RGB distance.
- `pickCornerColor(img: ImageData): [number, number, number]` — the most common of the four corner
  pixels (auto-pick default target).
- `removeSolidBackground(img: ImageData, target: [number,number,number], tolerance: number): ImageData`
  — returns a NEW ImageData with matching pixels' alpha set to 0; pure, immutable (doesn't mutate the
  input); tolerance 0 = exact match.

These are testable with small synthetic `ImageData` (constructed from a `Uint8ClampedArray`) in vitest
without a real canvas.

## Testing

- `imageEdit.ts`: `colorDistance` (identical→0, opposite→max); `pickCornerColor` (a border-dominant
  image); `removeSolidBackground` (matching pixels → alpha 0 within tolerance, non-matching untouched,
  tolerance boundary, input not mutated).
- **jsdom has no real `<canvas>`/`getImageData`**, so the modal's canvas interactions (eraser/restore/
  zoom/eyedropper) are NOT unit-tested — pixel logic lives in the pure fns above; the modal is thin
  glue verified by a **human visual pass** (as CropModal already is). Component tests only assert
  wiring that doesn't need a live canvas (mode toggle renders; the re-crop-after-erase confirm fires).
- Gates: `npm run check` 0 · `npm test` green · `npm run build` OK.

## Out of scope

- AI subject segmentation; magic-wand **flood-fill by contiguous region** (this chroma-key removes by
  COLOUR across the whole image, not a connected region); multiple layers; feathered/anti-aliased edge
  refinement beyond the hard tolerance threshold.
- **Fetching arbitrary non-CORS remote images** (would need a Tauri HTTP plugin + capability +
  `package.json` change) — such images must be uploaded/cropped to a data URL first (tainted fallback
  toast above).

## Plan shape (→ writing-plans → subagent-driven)

1. **`lib/imageEdit.ts`** — `colorDistance`, `pickCornerColor`, `removeSolidBackground`. Pure, TDD.
2. **CropModal → Crop|Erase editor** — mode toggle; crop→erase bridge (`getCroppedCanvas`); erase
   canvas with chroma-key (auto + eyedropper + tolerance) / eraser / restore / brush-size / undo /
   reset / zoom-pan; checkerboard; tainted-canvas toast fallback; re-crop-after-erase confirm; Apply →
   JPEG (crop-only) / PNG (erased); relabel the ImageField trigger to "Edit image". (Visual pass is human.)
3. **Whole-branch review + visual pass.**
