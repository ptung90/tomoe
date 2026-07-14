import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { twoLevel, setTwoLevel } from '../src/lib/modules/json-table/stores';

beforeEach(() => { localStorage.clear(); });

describe('twoLevel', () => {
  it('toggles and persists to localStorage', () => {
    setTwoLevel(false);
    expect(get(twoLevel)).toBe(false);
    expect(localStorage.getItem('jte-two-level')).toBe('false');
    setTwoLevel(true);
    expect(get(twoLevel)).toBe(true);
    expect(localStorage.getItem('jte-two-level')).toBe('true');
  });
});
