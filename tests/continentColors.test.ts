import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { continentColors, setContinentColor, resetContinentColors } from '../src/lib/modules/flashcards/stores';
import { CONTINENT_COLORS } from '../src/lib/modules/flashcards/lib/palette';

beforeEach(() => { localStorage.clear(); resetContinentColors(); });

describe('continentColors config', () => {
  it('defaults to the palette', () => {
    const defs = Object.fromEntries(CONTINENT_COLORS.map((c) => [c.key, c.hex]));
    expect(get(continentColors)).toEqual(defs);
  });
  it('setContinentColor remaps one continent and persists to localStorage', () => {
    setContinentColor('asia', '#123456');
    expect(get(continentColors).asia).toBe('#123456');
    expect(get(continentColors).europe).toBe('#E00000'); // others untouched
    expect(JSON.parse(localStorage.getItem('tomoe.continentColors')!).asia).toBe('#123456');
  });
  it('resetContinentColors restores defaults and clears storage', () => {
    setContinentColor('asia', '#123456');
    resetContinentColors();
    expect(get(continentColors).asia).toBe('#E6E60A');
    expect(localStorage.getItem('tomoe.continentColors')).toBeNull();
  });
});
