import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import * as S from '../src/lib/modules/flashcards/stores';
import { CONTINENT_COLORS } from '../src/lib/modules/flashcards/lib/palette';

beforeEach(() => { localStorage.clear(); S.initProject(); });

describe('setProjectCategory', () => {
  it('sets category and applies the continent border colour to Global', () => {
    S.setProjectCategory('europe');
    const p = get(S.project);
    expect(p.category).toBe('europe');
    const europeHex = CONTINENT_COLORS.find((c) => c.key === 'europe')!.hex;
    expect(p.settings.border.color.toLowerCase()).toBe(europeHex.toLowerCase());
  });
  it('None clears category and leaves border colour unchanged', () => {
    S.setProjectCategory('europe');
    const withColor = get(S.project).settings.border.color;
    S.setProjectCategory(null);
    const p = get(S.project);
    expect(p.category).toBeUndefined();
    expect(p.settings.border.color).toBe(withColor); // border untouched by None
  });
});
