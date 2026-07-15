import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/lib/modules/flashcards/model';
import { resolveStyle } from '../src/lib/modules/flashcards/lib/style';

describe('resolveStyle', () => {
  it('with no layers, returns a full Settings equal-by-value to base (base untouched)', () => {
    const out = resolveStyle(DEFAULT_SETTINGS);
    expect(out).toEqual(DEFAULT_SETTINGS);
    expect(out).not.toBe(DEFAULT_SETTINGS);
  });

  it('a schema layer overriding border.width keeps border.color', () => {
    const out = resolveStyle(DEFAULT_SETTINGS, { border: { width: 8 } });
    expect(out.border.width).toBe(8);
    expect(out.border.color).toBe(DEFAULT_SETTINGS.border.color);
  });

  it('a card layer over a schema layer wins (later layer wins per property)', () => {
    const out = resolveStyle(DEFAULT_SETTINGS, { border: { width: 8 } }, { border: { width: 12 } });
    expect(out.border.width).toBe(12);
    expect(out.border.color).toBe(DEFAULT_SETTINGS.border.color);
  });

  it('titleFont merges field-by-field, keeping family when only size is overridden', () => {
    const out = resolveStyle(DEFAULT_SETTINGS, { titleFont: { size: 20 } });
    expect(out.titleFont.size).toBe(20);
    expect(out.titleFont.family).toBe(DEFAULT_SETTINGS.titleFont.family);
  });

  it('scalar properties (margin/paperSize/orientation) replace rather than merge', () => {
    const out = resolveStyle(DEFAULT_SETTINGS, { margin: 20, paperSize: 'A6', orientation: 'landscape' });
    expect(out.margin).toBe(20);
    expect(out.paperSize).toBe('A6');
    expect(out.orientation).toBe('landscape');
  });

  it('undefined layers are ignored', () => {
    const out = resolveStyle(DEFAULT_SETTINGS, undefined, { border: { width: 8 } }, undefined);
    expect(out.border.width).toBe(8);
  });

  it('is pure — never mutates the base Settings', () => {
    resolveStyle(DEFAULT_SETTINGS, { border: { width: 8 } });
    expect(DEFAULT_SETTINGS.border.width).not.toBe(8);
  });
});
