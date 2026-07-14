# Tomoe Spec #5 — Flashcards Images (search + crop) (design)

Date: 2026-07-14 (autonomous overnight run; decisions made without interactive brainstorming — see overnight plan doc).
Status: Approved-by-delegation → ready for implementation plan
Module: `src/lib/modules/flashcards/`
Depends on: specs #2 (ImageField) merged.

## Goal

Give the image field real image sourcing: **search Wikimedia Commons** (keyless)
for a picture and set it, and **crop** any chosen/pasted image before setting.
Wires into the existing `ImageField` (used by the records form and the card
editor), alongside its current URL / paste / pick-file actions.

## Scope

**In scope**
- `lib/imageSearch.ts` (pure-ish): `searchWikimedia(query, fetchFn?): Promise<ImageHit[]>` where `ImageHit = { thumb: string; full: string; title: string }`. Uses the Wikipedia/Commons API with `origin=*` (CORS-enabled → plain `fetch`, no auth, no Tauri http plugin). `fetchFn` param defaults to global `fetch` (injected in tests).
- `ImageSearchModal.svelte`: query input + a results grid of thumbnails; clicking a result calls back with the full image URL. Loading + empty + error states.
- `cropperjs` dependency + `CropModal.svelte`: crop a source image (URL/data-URL) to a data-URL via cropperjs; aspect presets (free / 1:1 / 3:4 / 4:3); Apply → callback with the cropped data-URL.
- `ImageField.svelte`: add **Search** (opens `ImageSearchModal` → sets url) and **Crop** (opens `CropModal` on the current value → sets cropped data-URL) next to the existing Pick / Paste / Clear.

**Out of scope**
- Unsplash / Pixabay / iNaturalist (need keys or extra config) — Wikimedia only.
- Image attribution capture/rendering, background-size/position per image (later).
- Storing/optimizing images beyond what ImageField already does (data-URL / remote URL).

## Decisions (made autonomously)

- **Wikimedia only, keyless.** The Commons/Wikipedia `w/api.php` endpoint with `origin=*` returns CORS headers, so a plain `fetch` works in the Tauri webview without the http plugin or an API key. Query: `action=query&generator=search&gsrnamespace=6&gsrsearch=<q>&gsrlimit=20&prop=imageinfo&iiprop=url|thumburl&iiurlwidth=300&format=json&origin=*` (ported from flashcard-creator `api.js`). Parse `data.query.pages` → each page's `imageinfo[0].thumburl` (thumb) + `.url` (full).
- **Set = remote URL** by default (Wikimedia hosts it); Crop converts to a data-URL. Both are just strings the existing render/ImageField already handle.
- **CropModal has no jsdom test** (cropperjs needs canvas/DOM, like TipTap) — verified manually; its non-DOM helper (if any) is unit-tested. `ImageSearchModal` IS tested (mocked fetch, no network).

## Architecture

```
src/lib/modules/flashcards/
  lib/imageSearch.ts        # NEW: searchWikimedia(query, fetchFn?) → ImageHit[]
  components/
    ImageSearchModal.svelte # NEW: query + results grid + pick
    CropModal.svelte        # NEW: cropperjs crop → data-URL (no jsdom test)
    ImageField.svelte       # MODIFY: Search + Crop actions
package.json                # MODIFY: + cropperjs
```

- `ImageField` owns the modal open state locally (`showSearch`, `showCrop` booleans) and passes its `value`/`onChange` through. The modals are self-contained (props: query callback / source + apply callback), not global.
- Network only happens in `searchWikimedia` (injectable `fetchFn`), keeping the parse logic unit-testable.

## Data flow

```
ImageField "Search" → ImageSearchModal (query → searchWikimedia(fetch) → hits)
  → click hit → onChange(hit.full) → modal closes
ImageField "Crop" (when value present) → CropModal(value) → cropperjs → Apply → onChange(dataURL)
```

## Error handling / edge cases

- Search: network/parse failure → an inline error message in the modal (not a crash); empty query → no request; no results → "No images found".
- Crop with no current image → the Crop action is hidden/disabled (nothing to crop).
- Remote image that fails to load in the crop canvas → error message; cropperjs may need `crossOrigin` — set `img.crossOrigin = 'anonymous'` (Wikimedia serves CORS); if canvas is tainted, surface an error rather than throw.

## Testing

- `imageSearch.test.ts`: `searchWikimedia` with a mocked `fetchFn` returning a sample Commons JSON → asserts parsed `ImageHit[]` (thumb/full/title); empty/blank query → `[]` without calling fetch; a malformed/empty response → `[]` (no throw).
- `ImageSearchModal.test.ts`: renders query input; typing + submit calls the injected search and renders result thumbnails; clicking a thumbnail fires the pick callback with the full url. (Inject a stub search fn / mock the module so no network.)
- `ImageField.test.ts` (extend): Search button present; Crop button shown only when a value exists.
- `CropModal`: no jsdom test (cropperjs/canvas) — verified in the human morning preview.
- Gates: `npm run check` 0 errors · `npm test` green, 0 unhandled · `npm run build` OK.

## References

- `flashcard-creator/src/js/api.js` (`searchWikimedia`, `_searchImages`) and `src/js/crop.js` (`openCropModal` via cropperjs). Ported to TS/Svelte; Wikimedia-only, keyless, `fetch`-based.
- Reuse `ImageField.svelte` (spec #2), `EmptyState` where useful, Calm Paper tokens, lucide subpath icons.
