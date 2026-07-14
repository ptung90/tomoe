import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/svelte';
import { get } from 'svelte/store';
import ScalarArrayEditor from '../src/lib/modules/json-table/editors/ScalarArrayEditor.svelte';
import { data, loadDocument } from '../src/lib/modules/json-table/stores';

beforeEach(() => loadDocument({ words: ['cat', 'dog'] }, null));

describe('ScalarArrayEditor', () => {
  it('edits an item', async () => {
    render(ScalarArrayEditor, { value: ['cat', 'dog'], path: ['words'] });
    await fireEvent.input(screen.getByDisplayValue('dog'), { target: { value: 'fox' } });
    expect((get(data) as any).words).toEqual(['cat', 'fox']);
  });
  it('adds a chip', async () => {
    render(ScalarArrayEditor, { value: ['cat', 'dog'], path: ['words'] });
    await fireEvent.click(screen.getByRole('button', { name: /add/i }));
    expect((get(data) as any).words).toEqual(['cat', 'dog', '']);
  });
  it('removes a chip', async () => {
    render(ScalarArrayEditor, { value: ['cat', 'dog'], path: ['words'] });
    await fireEvent.click(screen.getAllByRole('button', { name: /remove/i })[0]);
    expect((get(data) as any).words).toEqual(['dog']);
  });
});
