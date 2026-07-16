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
