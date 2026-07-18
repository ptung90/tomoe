import { describe, it, expect } from 'vitest';
import { deflateAssets, inflateAssets } from '../src/lib/modules/flashcards/lib/imageAssets';

const IMG_A = 'data:image/png;base64,AAAAoooo';
const IMG_B = 'data:image/jpeg;base64,BBBBpppp';

// deflate/inflate are structure-preserving deep transforms; their static type is `unknown`, so
// tests read the result through a loose alias.
/* eslint-disable @typescript-eslint/no-explicit-any */
const deflate = (v: unknown) => { const r = deflateAssets(v); return { data: r.data as any, assets: r.assets }; };
const inflate = (v: unknown, a: string[]) => inflateAssets(v, a) as any;

describe('deflateAssets', () => {
  it('pools each unique data: URL once and replaces every occurrence with a ref', () => {
    const input = {
      records: [{ fields: { pic: IMG_A } }],
      cards: [{ images: [{ slot: 0, url: IMG_A }] }, { images: [{ slot: 0, url: IMG_A }] }],
    };
    const { data, assets } = deflate(input);
    expect(assets).toEqual([IMG_A]);                                   // one blob, deduped across 3 uses
    expect(data.records[0].fields.pic).not.toContain('data:');         // replaced by a ref
    expect(data.cards[0].images[0].url).toBe(data.records[0].fields.pic); // same ref string
  });
  it('leaves non-data strings, numbers, and structure untouched', () => {
    const input = { a: 'hello', b: 42, c: 'https://x/y.png', d: ['', null, { e: true }] };
    const { data, assets } = deflate(input);
    expect(assets).toEqual([]);
    expect(data).toEqual(input);
  });
  it('assigns stable indexes in first-seen order for multiple blobs', () => {
    const { data, assets } = deflate({ x: IMG_B, y: IMG_A, z: IMG_B });
    expect(assets).toEqual([IMG_B, IMG_A]);
    expect(data.x).toBe(data.z);
    expect(data.x).not.toBe(data.y);
  });
});

describe('inflateAssets', () => {
  it('is the inverse of deflate (round-trips content exactly)', () => {
    const input = { records: [{ fields: { pic: IMG_A } }], cards: [{ url: IMG_A }, { url: IMG_B }] };
    const { data, assets } = deflate(input);
    expect(inflate(data, assets)).toEqual(input);
  });
  it('restores every occurrence to the SAME string reference (heap-level dedup)', () => {
    const { data, assets } = deflate({ a: IMG_A, b: IMG_A });
    const out = inflate(data, assets);
    expect(out.a).toBe(out.b);            // shared reference, not two copies
    expect(out.a).toBe(assets[0]);
  });
  it('leaves an out-of-range or malformed ref as-is (no crash)', () => {
    const out = inflate({ a: '@@tomoe-asset:99', b: 'plain' }, [IMG_A]);
    expect(out.a).toBe('@@tomoe-asset:99');
    expect(out.b).toBe('plain');
  });
});
