import { describe, it, expect } from 'vitest';
import { CONTINENT_COLORS, continentForColor } from '../src/lib/modules/flashcards/lib/palette';

describe('continent palette', () => {
  it('has the 7 continents with the expected hexes', () => {
    expect(CONTINENT_COLORS).toHaveLength(7);
    const byKey = Object.fromEntries(CONTINENT_COLORS.map((c) => [c.key, c.hex]));
    expect(byKey.northAmerica).toBe('#D9600F');
    expect(byKey.southAmerica).toBe('#E0619B');
    expect(byKey.europe).toBe('#E00000');
    expect(byKey.africa).toBe('#1E7A45');
    expect(byKey.asia).toBe('#E6E60A');
    expect(byKey.oceania).toBe('#7A4A22');
    expect(byKey.antarctica).toBe('#2E86C1');
  });

  it('continentForColor matches case-insensitively and rejects custom/empty', () => {
    expect(continentForColor('#e00000')?.key).toBe('europe');
    expect(continentForColor('#E00000')?.key).toBe('europe');
    expect(continentForColor('#123456')).toBeNull();
    expect(continentForColor('')).toBeNull();
  });
});
