import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/svelte';
import { get } from 'svelte/store';
import TreePane from '../src/lib/components/TreePane.svelte';
import { loadDocument, selectedPath, select } from '../src/lib/stores';

beforeEach(() => loadDocument({ folders: [{ keySound: 'ai' }], notes: ['hello'] }, null));

describe('TreePane', () => {
  it('clicking a node selects its path', async () => {
    render(TreePane);
    await fireEvent.click(screen.getByRole('button', { name: 'folders' }));
    expect(get(selectedPath)).toEqual(['folders']);
  });
  it('search hides non-matching top-level nodes', async () => {
    render(TreePane);
    expect(screen.getByRole('button', { name: 'notes' })).toBeInTheDocument();
    await fireEvent.input(screen.getByPlaceholderText('Search…'), { target: { value: 'keySound' } });
    expect(screen.queryByRole('button', { name: 'notes' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'folders' })).toBeInTheDocument();
  });
  it('auto-expands ancestors to reveal the selected node', () => {
    loadDocument({ folders: [{ cards: [{ grapheme: 'gg' }] }] }, null);
    select(['folders', 0, 'cards', 0]);
    render(TreePane);
    // the selected card node (label = itemLabel = 'gg') is revealed
    expect(screen.getByRole('button', { name: 'gg' })).toBeInTheDocument();
  });
});
