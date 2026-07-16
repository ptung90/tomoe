import { describe, it, expect } from 'vitest';
import { FLOW_LAYOUTS, isFlowLayout, getFlowLayout } from '../src/lib/modules/flashcards/lib/flow-layouts';

describe('flow-layouts registry', () => {
  it('ships the two initial presets', () => {
    expect(FLOW_LAYOUTS.map((l) => l.id)).toEqual(['country-cover', 'country-page']);
  });
  it('every preset is family flow with a mode', () => {
    for (const l of FLOW_LAYOUTS) {
      expect(l.family).toBe('flow');
      expect(['collage', 'page']).toContain(l.mode);
    }
  });
  it('isFlowLayout recognises flow ids and rejects grid ids', () => {
    expect(isFlowLayout('country-cover')).toBe(true);
    expect(isFlowLayout('country-page')).toBe(true);
    expect(isFlowLayout('2x2')).toBe(false);
    expect(isFlowLayout('fulltext')).toBe(false);
  });
  it('getFlowLayout returns the def or undefined', () => {
    expect(getFlowLayout('country-cover')?.mode).toBe('collage');
    expect(getFlowLayout('nope')).toBeUndefined();
  });
});
