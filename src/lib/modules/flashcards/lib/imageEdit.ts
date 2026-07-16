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

/** An axis-aligned rectangle in pixel coordinates. */
export interface Bounds {
  x: number;
  y: number;
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

/**
 * The tight bounding box of every pixel whose alpha is STRICTLY greater than `alphaThreshold`
 * (default 0 — any non-fully-transparent pixel counts as content). Returns `null` when no such
 * pixel exists (a fully transparent / empty image). This drives the "Trim" tool, which crops the
 * transparent border left after background removal down to the visible subject. Pure — does not
 * mutate `img`.
 */
export function contentBounds(img: RgbaImage, alphaThreshold = 0): Bounds | null {
  const { data, width, height } = img;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > alphaThreshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null; // no content pixel found
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}
