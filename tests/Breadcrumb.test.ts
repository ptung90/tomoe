import { describe, it, expect } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/svelte';
import { get } from 'svelte/store';
import Breadcrumb from '../src/lib/components/Breadcrumb.svelte';
import { selectedPath, loadDocument } from '../src/lib/stores';

describe('Breadcrumb', () => {
  it('shows root and segments; clicking navigates', async () => {
    loadDocument({ folders: [{ words: ['a'] }] }, null);
    render(Breadcrumb, { path: ['folders', 0, 'words'] });
    expect(screen.getByRole('button', { name: 'root' })).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'folders' }));
    expect(get(selectedPath)).toEqual(['folders']);
    await fireEvent.click(screen.getByRole('button', { name: 'root' }));
    expect(get(selectedPath)).toEqual([]);
  });
  it('adds a short preview to array-index segments', () => {
    loadDocument({ folders: [{ keySound: 'ai' }] }, null);
    render(Breadcrumb, { path: ['folders', 0] });
    // the index-0 crumb includes the item preview ("ai")
    expect(screen.getByRole('button', { name: /ai/i })).toBeInTheDocument();
  });
});
