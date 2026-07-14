import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/svelte';

const openPath = vi.fn();
vi.mock('../src/lib/fileService', () => ({ openPath: (...a: unknown[]) => openPath(...a), pickOpen: vi.fn() }));

import StartScreen from '../src/lib/components/StartScreen.svelte';
import { recentFiles } from '../src/lib/recentFiles';
import { get } from 'svelte/store';

beforeEach(() => { openPath.mockReset(); recentFiles.set([]); });

describe('StartScreen recent files', () => {
  it('shows no Recent section when empty', () => {
    render(StartScreen);
    expect(screen.queryByText(/Recent/i)).not.toBeInTheDocument();
  });
  it('lists recents and reopens on click', async () => {
    recentFiles.set([{ path: '/a/x.tomoe.json', name: 'x.tomoe.json', ts: 2 }]);
    render(StartScreen);
    // Anchored at start: the reopen button's accessible name begins with the filename,
    // while the remove button's begins with "remove " — avoids ambiguous double-match.
    await fireEvent.click(screen.getByRole('button', { name: /^x\.tomoe\.json/i }));
    expect(openPath).toHaveBeenCalledWith('/a/x.tomoe.json');
  });
  it('remove (×) drops an entry', async () => {
    recentFiles.set([{ path: '/a.json', name: 'a.json', ts: 1 }]);
    render(StartScreen);
    await fireEvent.click(screen.getByRole('button', { name: /remove a\.json/i }));
    expect(get(recentFiles)).toEqual([]);
  });
});
