import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/svelte';
import { get } from 'svelte/store';
import MixedArrayList from '../src/lib/modules/json-table/editors/MixedArrayList.svelte';
import { data, selectedPath, loadDocument } from '../src/lib/modules/json-table/stores';

beforeEach(() => loadDocument({ mix: [1, { a: 2 }] }, null));

describe('MixedArrayList', () => {
  it('edits a scalar item and drills into a container item', async () => {
    render(MixedArrayList, { value: [1, { a: 2 }], path: ['mix'] });
    await fireEvent.input(screen.getByDisplayValue('1'), { target: { value: '5' } });
    expect((get(data) as any).mix[0]).toBe(5);
    await fireEvent.click(screen.getByRole('button', { name: /open item 2/i }));
    expect(get(selectedPath)).toEqual(['mix', 1]);
  });
  it('adds and removes items', async () => {
    render(MixedArrayList, { value: [1, { a: 2 }], path: ['mix'] });
    await fireEvent.click(screen.getByRole('button', { name: /add item/i }));
    expect((get(data) as any).mix).toHaveLength(3);
    await fireEvent.click(screen.getAllByRole('button', { name: /delete item/i })[0]);
    expect((get(data) as any).mix.length).toBe(2);
  });
});
