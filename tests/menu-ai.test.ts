import { describe, it, expect, vi } from 'vitest';

const create = vi.fn(async () => ({
  content: [{ type: 'text', text: '{"cells":{"c_man:0":"Cá kho"},"newDishes":[{"name":"Cá kho","categoryKey":"man","ingredientType":"ca"}]}' }],
}));
vi.mock('@anthropic-ai/sdk', () => ({ default: vi.fn().mockImplementation(() => ({ messages: { create } })) }));

import { generateWeek } from '../src/lib/modules/menu/ai';
import { newMenuDoc } from '../src/lib/modules/menu/model';

describe('menu ai generateWeek', () => {
  it('parses cells + newDishes out of the model JSON response', async () => {
    const { template } = newMenuDoc();
    const res = await generateWeek({ apiKey: 'k', model: 'claude-x' }, template, 'thực đơn tháng 6, mầm non');
    expect(res.cells['c_man:0']).toBe('Cá kho');
    expect(res.newDishes[0].categoryKey).toBe('man');
    expect(create).toHaveBeenCalledOnce();
  });
  it('returns empty result when there is no api key', async () => {
    const { template } = newMenuDoc();
    const res = await generateWeek({ apiKey: '', model: 'claude-x' }, template, 'x');
    expect(res.cells).toEqual({});
  });
});
