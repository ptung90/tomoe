import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';

// vi.mock is hoisted above imports, so the mock fns must be created via vi.hoisted
// (a plain top-level const would be in the temporal dead zone when the factory runs).
const m = vi.hoisted(() => ({
  resolveOverwrite: vi.fn(),
  resolveSaveCopy: vi.fn(),
  resolveReload: vi.fn(),
  resolveCancel: vi.fn(),
}));
vi.mock('../src/lib/modules/flashcards/io/saveService', () => m);

import SaveConflictModal from '../src/lib/modules/flashcards/components/SaveConflictModal.svelte';
import { saveConflict } from '../src/lib/modules/flashcards/stores';

beforeEach(() => { vi.clearAllMocks(); saveConflict.set(null); });

describe('SaveConflictModal', () => {
  it('renders nothing when there is no pending conflict', () => {
    render(SaveConflictModal);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows the four resolution actions and wires each to its handler', async () => {
    saveConflict.set({ path: '/p.tomoe.json', diskText: '{}' });
    render(SaveConflictModal);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: /overwrite/i }));
    await fireEvent.click(screen.getByRole('button', { name: /save as copy/i }));
    await fireEvent.click(screen.getByRole('button', { name: /discard mine, load theirs/i }));
    await fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(m.resolveOverwrite).toHaveBeenCalledTimes(1);
    expect(m.resolveSaveCopy).toHaveBeenCalledTimes(1);
    expect(m.resolveReload).toHaveBeenCalledTimes(1);
    expect(m.resolveCancel).toHaveBeenCalledTimes(1);
  });
});
