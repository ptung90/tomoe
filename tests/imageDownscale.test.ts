import { describe, it, expect } from 'vitest';
import { fitWithin } from '../src/lib/modules/flashcards/lib/imageDownscale';

describe('fitWithin', () => {
  it('scales a landscape image down to the max on its longest side', () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ w: 1600, h: 1200 });
  });
  it('scales a portrait image down to the max on its longest side', () => {
    expect(fitWithin(3000, 4000, 1600)).toEqual({ w: 1200, h: 1600 });
  });
  it('never upscales an image already within the max', () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ w: 800, h: 600 });
    expect(fitWithin(1600, 1600, 1600)).toEqual({ w: 1600, h: 1600 });
  });
  it('rounds to whole pixels and stays >= 1', () => {
    expect(fitWithin(3201, 1000, 1600)).toEqual({ w: 1600, h: 500 });
  });
  it('is safe for zero/degenerate sizes', () => {
    expect(fitWithin(0, 0, 1600)).toEqual({ w: 0, h: 0 });
  });
});
