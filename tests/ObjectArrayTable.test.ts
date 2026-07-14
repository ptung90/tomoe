import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/svelte';
import { get } from 'svelte/store';
import ObjectArrayTable from '../src/lib/modules/json-table/editors/ObjectArrayTable.svelte';
import { data, loadDocument } from '../src/lib/modules/json-table/stores';

beforeEach(() => loadDocument({ rows: [{ name: 'a', qty: 1 }, { name: 'b', qty: 2 }] }, null));

describe('ObjectArrayTable', () => {
  it('renders a header per union key', () => {
    render(ObjectArrayTable, { value: [{ name: 'a', qty: 1 }], path: ['rows'] });
    expect(screen.getByRole('columnheader', { name: 'name' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'qty' })).toBeInTheDocument();
  });
  it('edits a cell', async () => {
    render(ObjectArrayTable, { value: [{ name: 'a', qty: 1 }, { name: 'b', qty: 2 }], path: ['rows'] });
    await fireEvent.input(screen.getByDisplayValue('b'), { target: { value: 'c' } });
    expect((get(data) as any).rows[1].name).toBe('c');
  });
  it('adds a row', async () => {
    loadDocument({ rows: [{ name: 'a', qty: 1 }] }, null); // store must match rendered value
    render(ObjectArrayTable, { value: [{ name: 'a', qty: 1 }], path: ['rows'] });
    await fireEvent.click(screen.getByRole('button', { name: /add row/i }));
    expect((get(data) as any).rows).toHaveLength(2);
    expect((get(data) as any).rows[1]).toEqual({ name: '', qty: 0 });
  });
  it('deletes a row', async () => {
    render(ObjectArrayTable, { value: [{ name: 'a', qty: 1 }, { name: 'b', qty: 2 }], path: ['rows'] });
    await fireEvent.click(screen.getAllByRole('button', { name: /delete row/i })[0]);
    expect((get(data) as any).rows).toEqual([{ name: 'b', qty: 2 }]);
  });
});
