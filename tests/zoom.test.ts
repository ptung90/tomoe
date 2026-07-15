import { describe, it, expect } from 'vitest';
import { clampZoom, zoomStep, ZOOM_MIN, ZOOM_MAX } from '../src/lib/modules/flashcards/lib/zoom';

describe('clampZoom', () => {
  it('passes values within range', () => {
    expect(clampZoom(1)).toBe(1);
    expect(clampZoom(0.5)).toBe(0.5);
  });
  it('clamps to min/max', () => {
    expect(clampZoom(0.001)).toBe(ZOOM_MIN);
    expect(clampZoom(99)).toBe(ZOOM_MAX);
  });
  it('non-finite → min', () => {
    expect(clampZoom(NaN)).toBe(ZOOM_MIN);
    expect(clampZoom(Infinity)).toBe(ZOOM_MAX);
  });
});

describe('zoomStep', () => {
  it('scroll up (deltaY < 0) zooms in, down zooms out', () => {
    expect(zoomStep(1, -100)).toBeCloseTo(1.1, 5);
    expect(zoomStep(1, 100)).toBeCloseTo(1 / 1.1, 5);
  });
  it('stays within bounds', () => {
    expect(zoomStep(ZOOM_MAX, -100)).toBe(ZOOM_MAX);
    expect(zoomStep(ZOOM_MIN, 100)).toBe(ZOOM_MIN);
  });
});
