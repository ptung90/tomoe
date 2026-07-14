import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/svelte';
import { get } from 'svelte/store';
import ObjectForm from '../src/lib/editors/ObjectForm.svelte';
import { data, selectedPath, loadDocument } from '../src/lib/stores';

beforeEach(() => loadDocument({ title: 'Hi', nested: { a: 1 } }, null));

describe('ObjectForm', () => {
  it('renders scalar keys with editable values', async () => {
    render(ObjectForm, { value: { title: 'Hi', nested: { a: 1 } }, path: [] });
    expect(screen.getByText('title')).toBeInTheDocument();
    await fireEvent.input(screen.getByDisplayValue('Hi'), { target: { value: 'Bye' } });
    expect((get(data) as any).title).toBe('Bye');
  });
  it('drills into a nested container', async () => {
    render(ObjectForm, { value: { title: 'Hi', nested: { a: 1 } }, path: [] });
    await fireEvent.click(screen.getByRole('button', { name: /nested/i }));
    expect(get(selectedPath)).toEqual(['nested']);
  });
});
