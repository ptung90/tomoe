# Image Editor: Crop + Background Eraser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the flashcards image field's crop dialog into a two-mode **"Edit image"** editor — the existing cropperjs **Crop** mode plus a new **Erase** mode that knocks a solid background colour out to transparency (chroma-key) with manual eraser/restore brushes, undo, reset, and zoom-to-pan.

**Architecture:** The pixel math lives in a new pure module (`lib/imageEdit.ts`) that operates on a canvas-free `RgbaImage` shape so it is unit-testable under jsdom (which has no real `<canvas>` and no `ImageData` constructor — verified). `CropModal.svelte` keeps its filename but gains a `mode` toggle: Crop is unchanged; Erase seeds a `work` `<canvas>` from cropperjs's `getCroppedCanvas()` (same-origin, readable), keeps the original `ImageData` for restore/reset, and applies the pure fns via `putImageData`. Apply outputs JPEG for crop-only edits and PNG (with alpha) once erasing is used. The single `ImageField` trigger is relabelled "Edit image".

**Tech Stack:** Svelte 5 (runes) + TypeScript, cropperjs (already a dependency), `@tauri-apps/plugin-dialog` `confirm` (already used), lucide-svelte (subpath icons), vitest + @testing-library/svelte. **No new dependencies.**

## Global Constraints

- Svelte 5 runes only (no `$:`).
- lucide-svelte subpath imports only (`lucide-svelte/icons/eraser`, never the barrel).
- Chrome/UI styled with Calm Paper tokens (`var(--accent)`, `var(--bg)`, `var(--surface)`, `var(--border)`, `var(--text)`, `var(--text-muted)`, `var(--accent-weak)`) — no hardcoded hex. The single `#fff` on `.primary` is **pre-existing** and stays.
- Card interior / print colours are untouched by this feature.
- Pure logic is immutable and built TDD (failing test → implementation → passing test).
- **jsdom has NO real canvas / `getImageData` / `ImageData` constructor** (verified against vitest's jsdom: `typeof ImageData === 'undefined'`). All pixel logic MUST live in the pure fns and be unit-tested there with hand-built `Uint8ClampedArray` buffers. The modal's canvas interactions (chroma remove, eyedropper, eraser/restore brushes, zoom/pan) are NOT unit-tested — they are covered by a human visual pass. Component tests assert only wiring that needs no live canvas.
- Gates: `npm run check` must be 0 errors; `npm test` must be green (a transient Windows `EBUSY` on the vitest cache is a known flake — re-run once before treating it as a real failure); `npm run build` must succeed.
- Commit only the files each task actually changes. NEVER stage `.gitignore`, `package.json`, `src-tauri/SIGNING.md`, `src-tauri/signing/`, or `src-tauri/tauri.signing.conf.json.example`. **No `package.json` change at all** (no dependency added).

---

## Task 1: Pure pixel core — `lib/imageEdit.ts` + tests

The whole background-removal math, canvas-free and TDD. Later the modal consumes these
three functions; nothing here touches the DOM.

**Files:**
- Create: `src/lib/modules/flashcards/lib/imageEdit.ts`
- Test: `tests/imageEdit.test.ts`

**Interfaces:**
- Consumes: nothing (leaf module).
- Produces (used by Task 2):
  - `type Rgb = readonly [number, number, number]` — exported from
    `src/lib/modules/flashcards/lib/imageEdit.ts`.
  - `interface RgbaImage { data: Uint8ClampedArray; width: number; height: number }` — exported
    from the same file. The browser's DOM `ImageData` is structurally assignable to it (has
    `data`/`width`/`height`), so the modal passes `ctx.getImageData(...)` straight in.
  - `colorDistance(a: Rgb, b: Rgb): number` — Euclidean RGB distance.
  - `pickCornerColor(img: RgbaImage): [number, number, number]` — most common corner colour.
  - `removeSolidBackground(img: RgbaImage, target: Rgb, tolerance: number): RgbaImage` — new,
    immutable buffer with matching pixels' alpha zeroed.

- [ ] **Step 1: Write the failing tests**

Create `tests/imageEdit.test.ts` with the complete content below. All fixtures are built by
hand from `Uint8ClampedArray` — no canvas, no `ImageData` constructor (both unavailable in
jsdom).

```ts
import { describe, it, expect } from 'vitest';
import { colorDistance, pickCornerColor, removeSolidBackground, type RgbaImage } from '../src/lib/modules/flashcards/lib/imageEdit';

function makeImage(width: number, height: number, fill: [number, number, number, number]): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let p = 0; p < width * height; p++) {
    data[p * 4] = fill[0]; data[p * 4 + 1] = fill[1]; data[p * 4 + 2] = fill[2]; data[p * 4 + 3] = fill[3];
  }
  return { data, width, height };
}
function setPixel(img: RgbaImage, x: number, y: number, px: [number, number, number, number]): void {
  const i = (y * img.width + x) * 4;
  img.data[i] = px[0]; img.data[i + 1] = px[1]; img.data[i + 2] = px[2]; img.data[i + 3] = px[3];
}
function alphaAt(img: RgbaImage, x: number, y: number): number {
  return img.data[(y * img.width + x) * 4 + 3];
}

describe('colorDistance (Euclidean)', () => {
  it('is 0 for identical colours', () => {
    expect(colorDistance([12, 34, 56], [12, 34, 56])).toBe(0);
  });
  it('is large (~441.67) for opposite corners of the RGB cube', () => {
    expect(colorDistance([0, 0, 0], [255, 255, 255])).toBeCloseTo(Math.sqrt(3 * 255 * 255), 2);
  });
  it('measures a single-channel difference directly', () => {
    expect(colorDistance([10, 0, 0], [0, 0, 0])).toBe(10);
  });
});

describe('pickCornerColor', () => {
  it('returns the colour shared by a majority of corners', () => {
    // 3x3 grey field; 3 corners white, 1 corner red -> white wins.
    const img = makeImage(3, 3, [128, 128, 128, 255]);
    setPixel(img, 0, 0, [255, 255, 255, 255]);
    setPixel(img, 2, 0, [255, 255, 255, 255]);
    setPixel(img, 0, 2, [255, 255, 255, 255]);
    setPixel(img, 2, 2, [200, 0, 0, 255]);
    expect(pickCornerColor(img)).toEqual([255, 255, 255]);
  });
  it('breaks a 2-2 tie in favour of the top-left corner', () => {
    const img = makeImage(2, 2, [0, 0, 0, 255]);
    setPixel(img, 0, 0, [10, 20, 30, 255]); // top-left
    setPixel(img, 1, 0, [40, 50, 60, 255]); // top-right
    setPixel(img, 0, 1, [40, 50, 60, 255]); // bottom-left
    setPixel(img, 1, 1, [10, 20, 30, 255]); // bottom-right
    expect(pickCornerColor(img)).toEqual([10, 20, 30]);
  });
});

describe('removeSolidBackground', () => {
  it('zeroes alpha on pixels matching the target (tolerance 0 = exact)', () => {
    const img = makeImage(2, 1, [255, 255, 255, 255]);
    setPixel(img, 1, 0, [200, 0, 0, 255]); // non-matching pixel
    const out = removeSolidBackground(img, [255, 255, 255], 0);
    expect(alphaAt(out, 0, 0)).toBe(0);   // white -> transparent
    expect(alphaAt(out, 1, 0)).toBe(255); // red -> untouched
    // RGB of the removed pixel is left intact (only alpha changes).
    expect(out.data[0]).toBe(255); expect(out.data[1]).toBe(255); expect(out.data[2]).toBe(255);
  });
  it('respects the tolerance boundary (inclusive)', () => {
    // near-white [250,250,250] is sqrt(3*25) ~= 8.66 from white.
    const img = makeImage(1, 1, [250, 250, 250, 255]);
    expect(alphaAt(removeSolidBackground(img, [255, 255, 255], 8), 0, 0)).toBe(255); // 8 < 8.66 -> kept
    expect(alphaAt(removeSolidBackground(img, [255, 255, 255], 9), 0, 0)).toBe(0);   // 9 > 8.66 -> removed
  });
  it('does not mutate the input buffer and returns a fresh one', () => {
    const img = makeImage(1, 1, [255, 255, 255, 255]);
    const out = removeSolidBackground(img, [255, 255, 255], 10);
    expect(out.data).not.toBe(img.data);   // new buffer
    expect(alphaAt(img, 0, 0)).toBe(255);  // input alpha unchanged
    expect(alphaAt(out, 0, 0)).toBe(0);    // output alpha zeroed
  });
});
```

- [ ] **Step 2: Run the tests, verify they fail**

Run: `npm test -- imageEdit.test.ts`
Expected: FAIL — module `../src/lib/modules/flashcards/lib/imageEdit` does not exist (import
error surfaced as a failed suite).

- [ ] **Step 3: Implement `imageEdit.ts`**

Create `src/lib/modules/flashcards/lib/imageEdit.ts` with the complete content below.

```ts
/**
 * Pure pixel helpers for the flashcards image background eraser (Tomoe spec #14).
 *
 * These operate on a plain, canvas-free image shape (`RgbaImage`) because jsdom — the vitest
 * environment — provides NO real `<canvas>` and NO `ImageData` constructor. Keeping the pixel
 * logic here (fed hand-built `Uint8ClampedArray` buffers) makes it fully unit-testable. In the
 * browser the modal passes `ctx.getImageData(...)` straight in (a DOM `ImageData` is
 * structurally a `RgbaImage`), and wraps a returned `RgbaImage` back into a real `ImageData`
 * for `putImageData`.
 */

/** An RGB colour as a fixed 3-tuple, 0-255 per channel. */
export type Rgb = readonly [number, number, number];

/** A canvas-free RGBA image buffer: row-major, 4 bytes (r,g,b,a) per pixel. */
export interface RgbaImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/**
 * Straight-line (Euclidean) distance between two RGB colours: `sqrt(dr^2 + dg^2 + db^2)`.
 * Range is `0` (identical) to `sqrt(3 * 255^2) ~= 441.67` (opposite cube corners). The eraser's
 * tolerance slider is compared against this same metric. Pure.
 */
export function colorDistance(a: Rgb, b: Rgb): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * The most common colour among the image's four corner pixels — the auto-picked default
 * chroma-key target. Ties are broken in corner order (top-left, top-right, bottom-left,
 * bottom-right), so a 2-2 split returns the top-left colour. A zero-size image returns black
 * `[0,0,0]`. Pure — does not mutate `img`.
 */
export function pickCornerColor(img: RgbaImage): [number, number, number] {
  const { data, width, height } = img;
  if (width < 1 || height < 1) return [0, 0, 0];
  const at = (x: number, y: number): [number, number, number] => {
    const i = (y * width + x) * 4;
    return [data[i], data[i + 1], data[i + 2]];
  };
  const corners: [number, number, number][] = [
    at(0, 0),
    at(width - 1, 0),
    at(0, height - 1),
    at(width - 1, height - 1),
  ];
  let best = corners[0];
  let bestCount = 0;
  for (const c of corners) {
    let count = 0;
    for (const d of corners) if (d[0] === c[0] && d[1] === c[1] && d[2] === c[2]) count++;
    if (count > bestCount) { bestCount = count; best = c; } // strict > keeps the first-seen max
  }
  return [best[0], best[1], best[2]];
}

/**
 * Return a NEW `RgbaImage` with every pixel whose RGB is within `tolerance` (inclusive,
 * Euclidean — see `colorDistance`) of `target` made fully transparent (alpha 0); every other
 * pixel is copied through unchanged. `tolerance` 0 removes only exact colour matches. Pure —
 * the input buffer is never mutated (a fresh `Uint8ClampedArray` is returned).
 */
export function removeSolidBackground(img: RgbaImage, target: Rgb, tolerance: number): RgbaImage {
  const src = img.data;
  const out = new Uint8ClampedArray(src); // copy — never mutate the input
  for (let i = 0; i < out.length; i += 4) {
    const d = colorDistance([src[i], src[i + 1], src[i + 2]], target);
    if (d <= tolerance) out[i + 3] = 0;
  }
  return { data: out, width: img.width, height: img.height };
}
```

- [ ] **Step 4: Run the tests, verify they pass**

Run: `npm test -- imageEdit.test.ts`
Expected: PASS — all `colorDistance` / `pickCornerColor` / `removeSolidBackground` cases green.

- [ ] **Step 5: Run `npm run check`**

Run: `npm run check`
Expected: PASS — 0 errors (a new leaf module + test with no other consumers yet).

- [ ] **Step 6: Commit**

```bash
git add src/lib/modules/flashcards/lib/imageEdit.ts tests/imageEdit.test.ts
git commit -m "feat: imageEdit pure core — colorDistance, pickCornerColor, removeSolidBackground"
```

---

## Task 2: CropModal -> Crop | Erase editor + relabel the ImageField trigger

Broaden `CropModal.svelte` into a 2-mode "Edit image" dialog (Crop unchanged; Erase =
chroma-key + eraser/restore brushes + undo/reset/zoom) and relabel the single ImageField
button to "Edit image". Component tests cover only jsdom-safe wiring (toggle renders; the
Erase-entry guard is safe). The pixel/brush/zoom interactions are human-verified (Task 3).

**Files:**
- Modify: `src/lib/modules/flashcards/components/CropModal.svelte` (full rewrite — keep filename)
- Modify: `src/lib/modules/flashcards/components/ImageField.svelte:68` (relabel button)
- Modify: `tests/ImageField.test.ts:31-37` (update the button-name assertion)
- Create: `tests/CropModal.test.ts`

**Interfaces:**
- Consumes (from Task 1): `pickCornerColor(img)`, `removeSolidBackground(img, target, tolerance)`,
  `type Rgb`, `type RgbaImage` from `src/lib/modules/flashcards/lib/imageEdit.ts`.
- Consumes (existing): `clampZoom`, `ZOOM_MIN`, `ZOOM_MAX` from
  `src/lib/modules/flashcards/lib/zoom.ts`; `showToast` from `src/lib/shell.ts`; `confirm` from
  `@tauri-apps/plugin-dialog`.
- Produces: `CropModal` keeps its existing props `{ src: string; onApply: (dataUrl: string) => void; onClose: () => void }` — ImageField's mount site is unchanged.

- [ ] **Step 1: Update the ImageField button-name test (Crop -> Edit image)**

Before (`tests/ImageField.test.ts:31-37`):
```ts
  it('shows a Search button and a Crop button (Crop only when a value exists)', () => {
    const { rerender } = render(ImageField, { value: '', onChange: vi.fn() });
    expect(screen.getByRole('button', { name: /search/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /crop/i })).not.toBeInTheDocument();
    rerender({ value: 'http://x/a.png', onChange: vi.fn() });
    expect(screen.getByRole('button', { name: /crop/i })).toBeInTheDocument();
  });
```

After:
```ts
  it('shows a Search button and an Edit image button (edit only when a value exists)', () => {
    const { rerender } = render(ImageField, { value: '', onChange: vi.fn() });
    expect(screen.getByRole('button', { name: /search/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit image/i })).not.toBeInTheDocument();
    rerender({ value: 'http://x/a.png', onChange: vi.fn() });
    expect(screen.getByRole('button', { name: /edit image/i })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the ImageField test, verify it fails**

Run: `npm test -- ImageField.test.ts`
Expected: FAIL — `getByRole('button', { name: /edit image/i })` finds nothing (the button
still reads "Crop").

- [ ] **Step 3: Relabel the ImageField trigger button**

Before (`src/lib/modules/flashcards/components/ImageField.svelte:68`):
```svelte
      {#if value}<button type="button" onclick={() => (showCrop = true)}><Crop size={13} /> Crop</button>{/if}
```

After:
```svelte
      {#if value}<button type="button" onclick={() => (showCrop = true)}><Crop size={13} /> Edit image</button>{/if}
```

(The `Crop` icon import, the `showCrop` state, and the `<CropModal>` mount at lines 78-80 are
unchanged — the same modal now opens in its Crop mode by default.)

- [ ] **Step 4: Run the ImageField test, verify it passes**

Run: `npm test -- ImageField.test.ts`
Expected: PASS — all ImageField cases green (only the button label changed).

- [ ] **Step 5: Write the failing CropModal component test**

Create `tests/CropModal.test.ts` with the complete content below. cropperjs and its CSS are
mocked so the component mounts under jsdom without a real Cropper; `showToast` is spied via the
shared shell module. In jsdom the mocked Cropper is never actually constructed (the `<img>`
never fires `load` and has `naturalWidth === 0`), so `cropper` stays undefined and clicking
Erase hits the `if (!cc) return;` guard — this test asserts that guard is wired (no crash,
stays in Crop). The full erase flow needs a live canvas and is human-verified (Task 3).

```ts
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/svelte';

// jsdom has no canvas: neutralise cropperjs + its stylesheet so the component mounts.
vi.mock('cropperjs', () => ({
  default: class {
    getCroppedCanvas() { return null; }
    setAspectRatio() {}
    destroy() {}
  },
}));
vi.mock('cropperjs/dist/cropper.css', () => ({}));

// Spy the shell toast. CropModal imports it from ../../../shell; this test's ../src/lib/shell
// resolves to the same module file, so the mock applies to the component's import too.
const showToast = vi.fn();
vi.mock('../src/lib/shell', async (orig) => ({ ...(await orig() as object), showToast }));

import CropModal from '../src/lib/modules/flashcards/components/CropModal.svelte';

describe('CropModal (Crop | Erase editor)', () => {
  it('renders the Crop and Erase mode toggle, starting in Crop', () => {
    render(CropModal, { src: 'data:image/png;base64,AAAA', onApply: vi.fn(), onClose: vi.fn() });
    expect(screen.getByRole('button', { name: /crop/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /erase/i })).toBeInTheDocument();
    // Crop mode shows the aspect-ratio buttons and NOT the erase toolbar.
    expect(screen.getByRole('button', { name: /free/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^remove$/i })).not.toBeInTheDocument();
  });

  it('clicking Erase without a decodable image stays in Crop (guard is safe, no crash)', async () => {
    render(CropModal, { src: 'data:image/png;base64,AAAA', onApply: vi.fn(), onClose: vi.fn() });
    await fireEvent.click(screen.getByRole('button', { name: /erase/i }));
    // cropper is undefined under jsdom -> toErase() bails; we remain in Crop mode.
    expect(screen.getByRole('button', { name: /free/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^remove$/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run the CropModal test, verify it fails**

Run: `npm test -- CropModal.test.ts`
Expected: FAIL — the current CropModal has no "Erase" toggle button, so
`getByRole('button', { name: /erase/i })` finds nothing.

- [ ] **Step 7: Rewrite `CropModal.svelte` as the Crop | Erase editor**

Replace the **entire contents** of `src/lib/modules/flashcards/components/CropModal.svelte`
with the complete file below.

```svelte
<script lang="ts">
  import Cropper from 'cropperjs';
  import 'cropperjs/dist/cropper.css';
  import { confirm } from '@tauri-apps/plugin-dialog';
  import X from 'lucide-svelte/icons/x';
  import CropIcon from 'lucide-svelte/icons/crop';
  import Eraser from 'lucide-svelte/icons/eraser';
  import Paintbrush from 'lucide-svelte/icons/paintbrush';
  import Pipette from 'lucide-svelte/icons/pipette';
  import WandSparkles from 'lucide-svelte/icons/wand-sparkles';
  import Undo2 from 'lucide-svelte/icons/undo-2';
  import RotateCcw from 'lucide-svelte/icons/rotate-ccw';
  import ZoomIn from 'lucide-svelte/icons/zoom-in';
  import ZoomOut from 'lucide-svelte/icons/zoom-out';
  import { pickCornerColor, removeSolidBackground } from '../lib/imageEdit';
  import { clampZoom, ZOOM_MIN, ZOOM_MAX } from '../lib/zoom';
  import { showToast } from '../../../shell';

  let { src, onApply, onClose }: { src: string; onApply: (dataUrl: string) => void; onClose: () => void } = $props();

  const UNDO_CAP = 20;
  const MAX = 1600; // cropperjs export cap, shared by Crop apply + Erase seeding

  let mode = $state<'crop' | 'erase'>('crop');

  // ── Crop mode (cropperjs) — unchanged from the original CropModal ─────────────────
  let cropper: Cropper | undefined;
  function mount(node: HTMLImageElement) {
    // Set crossOrigin BEFORE src (Wikimedia serves CORS -> keeps the canvas untainted),
    // and init cropper only once the image has loaded so it sizes to the container.
    node.crossOrigin = 'anonymous';
    let raf = 0;
    const init = () => {
      if (cropper || raf) return;
      raf = requestAnimationFrame(() => { raf = 0; if (!cropper) cropper = new Cropper(node, { viewMode: 1, autoCropArea: 1, background: false }); });
    };
    node.addEventListener('load', init, { once: true });
    node.src = src;
    if (node.complete && node.naturalWidth) init();
    return { destroy() { node.removeEventListener('load', init); if (raf) cancelAnimationFrame(raf); cropper?.destroy(); cropper = undefined; } };
  }
  const setAspect = (r: number) => cropper?.setAspectRatio(r);

  // ── Erase mode (pixel canvas) ─────────────────────────────────────────────────────
  type Tool = 'remove' | 'erase' | 'restore';
  let work: HTMLCanvasElement | null = null;   // the live, editable canvas
  let origCanvas: HTMLCanvasElement | null = null; // offscreen copy of the pristine image (restore brush)
  let original: ImageData | null = null;       // pristine pixels (reset)
  let pendingSeed: HTMLCanvasElement | null = null; // cropped canvas captured before the crop area unmounts
  let eraseReady = false;
  let hasErased = false;                        // any erase op applied -> Apply outputs PNG; re-crop confirms

  let natW = $state(0);
  let natH = $state(0);
  let tool = $state<Tool>('remove');
  let target = $state<[number, number, number]>([255, 255, 255]);
  let tolerance = $state(32);
  let eyedropper = $state(false);
  let brushSize = $state(40);
  let zoom = $state(1);
  let undoStack = $state<ImageData[]>([]);
  let drawing = false;

  const rgbCss = $derived(`rgb(${target[0]},${target[1]},${target[2]})`);
  function ctx2d(): CanvasRenderingContext2D { return work!.getContext('2d')!; }

  // Crop -> Erase: bake the current crop into the erase canvas. Read the cropped canvas WHILE
  // the cropper is still alive (switching mode unmounts + destroys it), then probe readability.
  function toErase(): void {
    const cc = cropper?.getCroppedCanvas({ maxWidth: MAX, maxHeight: MAX });
    if (!cc) return; // cropper not ready (e.g. image not yet loaded) — stay in Crop
    try {
      cc.getContext('2d')!.getImageData(0, 0, 1, 1); // throws on a tainted (non-CORS remote) canvas
    } catch {
      showToast("Can't edit this remote image — upload it first", 'error');
      return; // stay in Crop; Erase effectively disabled for this source
    }
    pendingSeed = cc;
    mode = 'erase';
  }

  // Runs when the erase <canvas> mounts (mode === 'erase'). Seeds it from the captured crop.
  function seedWork(node: HTMLCanvasElement) {
    work = node;
    const cc = pendingSeed!;
    natW = cc.width; natH = cc.height;
    node.width = cc.width; node.height = cc.height;
    const c = node.getContext('2d')!;
    c.drawImage(cc, 0, 0);
    original = c.getImageData(0, 0, node.width, node.height);
    origCanvas = document.createElement('canvas');
    origCanvas.width = cc.width; origCanvas.height = cc.height;
    origCanvas.getContext('2d')!.drawImage(cc, 0, 0);
    target = pickCornerColor(original); // auto default chroma target
    undoStack = [];
    hasErased = false;
    eraseReady = true;
    pendingSeed = null;
    return { destroy() { work = null; origCanvas = null; original = null; eraseReady = false; } };
  }

  // Erase -> Crop: warn before discarding erase edits (user decision). On confirm, drop erase
  // state; re-entering Crop re-mounts the cropper on the ORIGINAL src (pre-erase source).
  async function toCrop(): Promise<void> {
    if (hasErased) {
      const ok = await confirm('Re-cropping discards the erased areas — continue?', { title: 'Re-crop image', kind: 'warning' });
      if (!ok) return;
    }
    hasErased = false; eraseReady = false; zoom = 1; undoStack = [];
    mode = 'crop';
  }

  function pushUndo(): void {
    if (!work) return;
    undoStack.push(ctx2d().getImageData(0, 0, work.width, work.height));
    if (undoStack.length > UNDO_CAP) undoStack.shift(); // cap memory
  }

  function removeColour(): void {
    if (!work) return;
    pushUndo();
    const c = ctx2d();
    const cur = c.getImageData(0, 0, work.width, work.height);
    const out = removeSolidBackground(cur, target, tolerance);
    c.putImageData(new ImageData(out.data, out.width, out.height), 0, 0);
    hasErased = true;
  }

  function canvasPos(e: PointerEvent): { x: number; y: number } {
    const rect = work!.getBoundingClientRect();
    // Displayed size = natural * zoom, so dividing by zoom maps back to canvas pixels.
    return { x: (e.clientX - rect.left) / zoom, y: (e.clientY - rect.top) / zoom };
  }

  function paint(x: number, y: number): void {
    const c = ctx2d();
    const r = brushSize / 2;
    if (tool === 'erase') {
      c.globalCompositeOperation = 'destination-out';
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
      c.globalCompositeOperation = 'source-over';
    } else if (tool === 'restore' && origCanvas) {
      c.save();
      c.globalCompositeOperation = 'source-over';
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.clip();
      c.drawImage(origCanvas, 0, 0);
      c.restore();
    }
    hasErased = true;
  }

  function pickAt(x: number, y: number): void {
    const d = ctx2d().getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
    target = [d[0], d[1], d[2]];
  }

  function onPointerDown(e: PointerEvent): void {
    if (!eraseReady || !work) return;
    const { x, y } = canvasPos(e);
    if (eyedropper) { pickAt(x, y); eyedropper = false; return; }
    if (tool === 'remove') return; // chroma-key runs from its button, not a drag
    work.setPointerCapture(e.pointerId);
    drawing = true;
    pushUndo();      // one undo step per stroke
    paint(x, y);
  }
  function onPointerMove(e: PointerEvent): void {
    if (!drawing) return;
    const { x, y } = canvasPos(e);
    paint(x, y);
  }
  function onPointerUp(e: PointerEvent): void {
    if (!drawing) return;
    drawing = false;
    try { work?.releasePointerCapture(e.pointerId); } catch { /* already released */ }
  }

  function undo(): void {
    if (!work || !undoStack.length) return;
    const prev = undoStack.pop()!;
    ctx2d().putImageData(prev, 0, 0);
  }
  function reset(): void {
    if (!work || !original) return;
    ctx2d().putImageData(original, 0, 0);
    undoStack = [];
    hasErased = false;
  }

  const zoomBy = (f: number) => { zoom = clampZoom(zoom * f); };

  function apply(): void {
    if (mode === 'crop') {
      const canvas = cropper?.getCroppedCanvas({ maxWidth: MAX, maxHeight: MAX });
      if (!canvas) return;
      try { onApply(canvas.toDataURL('image/jpeg', 0.9)); }
      catch { onClose(); } // tainted canvas (non-CORS remote) — bail rather than throw
      return;
    }
    if (!work) return;
    // Erased -> PNG (keeps alpha); untouched/reset -> JPEG (smaller, no transparency needed).
    onApply(hasErased ? work.toDataURL('image/png') : work.toDataURL('image/jpeg', 0.9));
  }
</script>

<div class="overlay" role="dialog" aria-modal="true">
  <div class="modal">
    <header class="head">
      <div class="modes">
        <button type="button" class:active={mode === 'crop'} onclick={toCrop}><CropIcon size={14} /> Crop</button>
        <button type="button" class:active={mode === 'erase'} onclick={toErase}><Eraser size={14} /> Erase</button>
      </div>
      <button type="button" class="close" aria-label="close" onclick={onClose}><X size={16} /></button>
    </header>

    {#if mode === 'crop'}
      <div class="crop-area"><img use:mount alt="" /></div>
      <div class="aspects">
        <button type="button" onclick={() => setAspect(NaN)}>Free</button>
        <button type="button" onclick={() => setAspect(1)}>1:1</button>
        <button type="button" onclick={() => setAspect(3 / 4)}>3:4</button>
        <button type="button" onclick={() => setAspect(4 / 3)}>4:3</button>
      </div>
    {:else}
      <div class="erase-tools">
        <div class="toolgroup">
          <button type="button" class:active={tool === 'remove'} onclick={() => (tool = 'remove')} title="Remove colour"><WandSparkles size={14} /></button>
          <button type="button" class:active={tool === 'erase'} onclick={() => (tool = 'erase')} title="Eraser brush"><Eraser size={14} /></button>
          <button type="button" class:active={tool === 'restore'} onclick={() => (tool = 'restore')} title="Restore brush"><Paintbrush size={14} /></button>
        </div>
        {#if tool === 'remove'}
          <div class="toolgroup">
            <span class="swatch" style="background:{rgbCss}"></span>
            <button type="button" class:active={eyedropper} onclick={() => (eyedropper = !eyedropper)} title="Pick colour"><Pipette size={14} /></button>
            <label class="slider">Tol <input type="range" min="0" max="200" bind:value={tolerance} /> {tolerance}</label>
            <button type="button" class="primary sm" onclick={removeColour}>Remove</button>
          </div>
        {:else}
          <label class="slider">Size <input type="range" min="4" max="120" bind:value={brushSize} /> {brushSize}</label>
        {/if}
        <div class="toolgroup right">
          <button type="button" onclick={undo} title="Undo" disabled={!undoStack.length}><Undo2 size={14} /></button>
          <button type="button" onclick={reset} title="Reset"><RotateCcw size={14} /></button>
          <button type="button" onclick={() => zoomBy(1 / 1.25)} title="Zoom out"><ZoomOut size={14} /></button>
          <button type="button" onclick={() => zoomBy(1.25)} title="Zoom in"><ZoomIn size={14} /></button>
        </div>
      </div>
      <div class="erase-area">
        <div class="checker">
          <canvas use:seedWork
            style="width:{natW * zoom}px;height:{natH * zoom}px;"
            class:eyedrop={eyedropper}
            onpointerdown={onPointerDown} onpointermove={onPointerMove}
            onpointerup={onPointerUp} onpointerleave={onPointerUp}></canvas>
        </div>
      </div>
    {/if}

    <footer class="foot"><span class="spacer"></span>
      <button type="button" onclick={onClose}>Cancel</button>
      <button type="button" class="primary" onclick={apply}>Apply</button>
    </footer>
  </div>
</div>

<style>
  .overlay { position:fixed; inset:0; background:rgba(0,0,0,.4); display:flex; align-items:center; justify-content:center; z-index:60; }
  .modal { background:var(--surface); color:var(--text); border:1px solid var(--border); border-radius:12px;
    width:min(680px,94vw); max-height:88vh; display:flex; flex-direction:column; }
  .head { display:flex; align-items:center; justify-content:space-between; padding:10px 14px; border-bottom:1px solid var(--border); }
  .modes { display:flex; gap:6px; }
  .modes button { display:inline-flex; align-items:center; gap:5px; border:1px solid var(--border); background:transparent; color:var(--text);
    border-radius:6px; padding:5px 12px; font:inherit; font-weight:600; }
  .modes button.active { border-color:var(--accent); background:var(--accent-weak); color:var(--accent); }
  .head .close { border:none; background:transparent; color:var(--text-muted); }
  .crop-area { padding:12px 14px; height:52vh; display:flex; align-items:center; justify-content:center; overflow:hidden; }
  /* Constrain on BOTH axes so cropperjs sizes its canvas to fit the modal (handles stay reachable). */
  .crop-area img { display:block; max-width:100%; max-height:100%; }
  .aspects { display:flex; gap:6px; padding:0 14px 10px; }
  .aspects button { border:1px solid var(--border); background:transparent; color:var(--text); border-radius:6px; padding:4px 10px; font:inherit; font-size:12px; }
  .aspects button:hover { background:var(--accent-weak); color:var(--accent); }
  .erase-tools { display:flex; flex-wrap:wrap; align-items:center; gap:10px; padding:10px 14px; border-bottom:1px solid var(--border); }
  .toolgroup { display:flex; align-items:center; gap:6px; }
  .toolgroup.right { margin-left:auto; }
  .erase-tools button { display:inline-flex; align-items:center; gap:4px; border:1px solid var(--border); background:transparent; color:var(--text); border-radius:6px; padding:5px 8px; font:inherit; }
  .erase-tools button.active { border-color:var(--accent); background:var(--accent-weak); color:var(--accent); }
  .erase-tools button:disabled { opacity:.4; }
  .erase-tools .primary.sm { border-color:var(--accent); background:var(--accent); color:#fff; font-weight:600; padding:5px 12px; }
  .swatch { width:20px; height:20px; border:1px solid var(--border); border-radius:4px; display:inline-block; }
  .slider { display:inline-flex; align-items:center; gap:6px; font-size:12px; color:var(--text-muted); }
  .slider input { vertical-align:middle; }
  .erase-area { padding:12px 14px; height:52vh; overflow:auto; background:var(--bg); }
  /* Checkerboard so transparency is visible — two token-coloured diagonal grids, no hardcoded hex. */
  .checker { display:inline-block;
    background-color:var(--surface);
    background-image:
      linear-gradient(45deg, var(--border) 25%, transparent 25%, transparent 75%, var(--border) 75%),
      linear-gradient(45deg, var(--border) 25%, transparent 25%, transparent 75%, var(--border) 75%);
    background-size:16px 16px; background-position:0 0, 8px 8px; }
  .checker canvas { display:block; cursor:crosshair; touch-action:none; } /* touch-action:none so a drag paints, not scrolls */
  .checker canvas.eyedrop { cursor:cell; }
  .foot { display:flex; align-items:center; gap:8px; padding:12px 14px; border-top:1px solid var(--border); }
  .spacer { flex:1; }
  .foot button { border:1px solid var(--border); background:transparent; color:var(--text); border-radius:6px; padding:6px 14px; font:inherit; }
  .foot .primary { border-color:var(--accent); background:var(--accent); color:#fff; font-weight:600; }
</style>
```

- [ ] **Step 8: Run the CropModal test, verify it passes**

Run: `npm test -- CropModal.test.ts`
Expected: PASS — both cases green (toggle renders + Erase-entry guard is safe).

- [ ] **Step 9: Run `npm run check`**

Run: `npm run check`
Expected: PASS — 0 errors. (`ImageData` / `CanvasRenderingContext2D` / `PointerEvent` are DOM
lib types available in the browser build; `RgbaImage` from Task 1 is accepted where the modal
passes a real `ImageData`.)

- [ ] **Step 10: Run the full test suite**

Run: `npm test`
Expected: PASS — all suites green (Windows may show a transient `EBUSY` on the vitest cache;
re-run once if so).

- [ ] **Step 11: Run the frontend build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add src/lib/modules/flashcards/components/CropModal.svelte \
  src/lib/modules/flashcards/components/ImageField.svelte \
  tests/ImageField.test.ts tests/CropModal.test.ts
git commit -m "feat: CropModal Crop|Erase editor (chroma-key + brushes) + Edit image trigger"
```

---

## Task 3: Whole-branch review + human visual pass

No production code. Verify the branch end-to-end, run a code review, and hand the human a
visual-QA checklist for the canvas interactions that jsdom cannot exercise.

**Files:** none (verification + review only).

- [ ] **Step 1: Run all gates one more time on the full branch**

Run: `npm run check` — Expected: 0 errors.
Run: `npm test` — Expected: all green (re-run once on a transient Windows `EBUSY`).
Run: `npm run build` — Expected: success.

- [ ] **Step 2: Request a code review of the branch diff**

Use the superpowers:requesting-code-review skill (or the `/code-review` command) over the
Task 1 + Task 2 diff. Confirm: no hardcoded hex outside the pre-existing `.primary` `#fff`;
lucide subpath imports only; no `package.json` / dependency change; pixel logic confined to the
pure `imageEdit.ts`; the modal never mutates a pure fn's input.

- [ ] **Step 3: Human visual pass in the running app (`npm run tauri dev`)**

The eraser/chroma/zoom canvas interactions are NOT unit-testable (jsdom has no canvas). Verify
by hand on an image field (upload a solid-background photo, then click **Edit image**):

  - [ ] Crop mode works exactly as before (aspect buttons, Apply -> JPEG on a crop-only edit).
  - [ ] Switching to **Erase** seeds the canvas from the current crop, shown over a checkerboard.
  - [ ] **Remove colour**: the swatch auto-picks the corner colour; **Remove** knocks the
        background to transparency; raising **Tol** + Remove again removes more; each Remove is
        one undo step.
  - [ ] **Eyedropper**: toggles, click the canvas to pick a new target colour, then Remove.
  - [ ] **Eraser brush**: drag paints transparency; **Restore brush**: drag brings the original
        pixels back; the **Size** slider changes the brush radius.
  - [ ] **Undo** steps back through chroma ops + brush strokes (capped ~20); **Reset** returns to
        the original seeded image.
  - [ ] **Zoom** +/- scales the canvas; scrolling the area pans (drag never pans — it paints).
  - [ ] **Apply** after erasing returns a transparent PNG (the card slot shows through).
  - [ ] Switching **Erase -> Crop after erasing** shows the confirm dialog; Cancel keeps the
        erase edits, OK drops them and re-enters Crop from the pre-erase source.
  - [ ] Pasting an arbitrary non-CORS remote URL then Edit image -> Erase shows the
        "Can't edit this remote image — upload it first" toast and stays in Crop.

- [ ] **Step 4: Finish the branch**

Use the superpowers:finishing-a-development-branch skill to choose merge / PR / cleanup.

---

## Self-Review (completed by the plan author)

**Spec coverage** — every design section is placed:
- Chroma-key `colorDistance` / `pickCornerColor` / `removeSolidBackground` (pure core) -> Task 1.
- 2-mode "Edit image" modal, Crop unchanged, Crop->Erase bridge via `getCroppedCanvas`, tainted
  fallback toast, re-crop-after-erase confirm, Apply JPEG(crop-only)/PNG(erased) -> Task 2.
- Erase tools: remove-colour (auto + eyedropper + tolerance), eraser brush (`destination-out`),
  restore brush (clip + `drawImage` of original), brush-size, undo (cap 20) + reset, zoom + pan,
  checkerboard -> Task 2 (`CropModal.svelte`).
- ImageField trigger relabelled "Edit image" -> Task 2.
- Testing split (pure fns unit-tested; canvas interactions human visual pass) -> Tasks 1 + 3.
- Gates + review -> every task's final steps + Task 3.

**jsdom `ImageData` question (RESOLVED):** verified against vitest's jsdom that
`typeof ImageData === 'undefined'` and `new ImageData(...)` throws. The pure fns therefore take
and return a plain `RgbaImage` (`{ data, width, height }`), and tests build fixtures directly
from `Uint8ClampedArray` — no `ImageData` constructor is used in tests. The browser DOM
`ImageData` is structurally assignable to `RgbaImage`, so the modal feeds `ctx.getImageData(...)`
in unchanged and wraps a returned `RgbaImage` with `new ImageData(...)` (browser-only) for
`putImageData`.

**Placeholder scan:** none — all steps carry full code, exact paths, exact commands.

**Type/name consistency:** `RgbaImage` / `Rgb` / `colorDistance` / `pickCornerColor` /
`removeSolidBackground` are defined in Task 1 and consumed by the same names in Task 2;
`clampZoom`/`ZOOM_MIN`/`ZOOM_MAX` reused from `lib/zoom.ts`; `showToast` from `../../../shell`;
`confirm` from `@tauri-apps/plugin-dialog` (matching existing usage). No `package.json`/dependency
change anywhere.
```
