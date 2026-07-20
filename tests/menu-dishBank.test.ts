import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import * as B from '../src/lib/modules/menu/dishBank';

beforeEach(() => localStorage.clear());

describe('menu dishBank', () => {
  it('add + read back by category', () => {
    B.addDish({ name: 'Cá kho', categoryKey: 'man', ingredientType: 'ca' });
    B.addDish({ name: 'Rau muống', categoryKey: 'rau' });
    expect(B.dishesByCategory('man').map((d) => d.name)).toEqual(['Cá kho']);
    expect(B.dishesByCategory('rau').length).toBe(1);
  });
  it('update + remove', () => {
    const id = B.addDish({ name: 'Thịt kho', categoryKey: 'man' });
    B.updateDish(id, { ingredientType: 'thit' });
    expect(B.loadBank()[0].ingredientType).toBe('thit');
    B.removeDish(id);
    expect(B.loadBank().length).toBe(0);
  });
  it('bank store recomputes after a mutation', () => {
    expect(get(B.bank).length).toBe(0);
    B.addDish({ name: 'X', categoryKey: 'man' });
    expect(get(B.bank).length).toBe(1);
  });
  it('harvest skips names already present in the same category', () => {
    B.addDish({ name: 'Cá kho', categoryKey: 'man' });
    const added = B.harvestDishes([
      { name: 'Cá kho', categoryKey: 'man' },      // dup → skipped
      { name: 'Cá kho', categoryKey: 'canh' },      // different cat → added
      { name: 'Tôm rim', categoryKey: 'man' },      // new → added
    ]);
    expect(added).toBe(2);
    expect(B.loadBank().length).toBe(3);
  });
});
