import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/svelte';
import { get } from 'svelte/store';
import ParentTwoLevelView from '../src/lib/modules/json-table/components/ParentTwoLevelView.svelte';
import { data, selectedPath, loadDocument, select } from '../src/lib/modules/json-table/stores';

// document: root.f = { a: 'x', arr: ['p','q'], other: [1,2] }
const parent = () => ({ a: 'x', arr: ['p', 'q'], other: [1, 2] });
beforeEach(() => { loadDocument({ f: parent() }, null); select(['f', 'arr']); });

describe('ParentTwoLevelView', () => {
  it('shows the active array on the right', () => {
    render(ParentTwoLevelView, { parent: parent(), parentPath: ['f'], activeKey: 'arr' });
    expect(screen.getByDisplayValue('p')).toBeInTheDocument();
    expect(screen.getByDisplayValue('q')).toBeInTheDocument();
  });
  it('edits a parent scalar field on the left', async () => {
    render(ParentTwoLevelView, { parent: parent(), parentPath: ['f'], activeKey: 'arr' });
    await fireEvent.input(screen.getByDisplayValue('x'), { target: { value: 'y' } });
    expect((get(data) as any).f.a).toBe('y');
  });
  it('clicking a sibling container navigates the selection', async () => {
    render(ParentTwoLevelView, { parent: parent(), parentPath: ['f'], activeKey: 'arr' });
    await fireEvent.click(screen.getByRole('button', { name: /open other/i }));
    expect(get(selectedPath)).toEqual(['f', 'other']);
  });
});
