import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';

const m = vi.hoisted(() => ({
  resolveOpenReadOnly: vi.fn(),
  resolveEditAnyway: vi.fn(),
  resolveCloseLocked: vi.fn(),
}));
vi.mock('../src/lib/modules/flashcards/io/lockService', () => m);

import FileLockModal from '../src/lib/modules/flashcards/components/FileLockModal.svelte';
import { openLock } from '../src/lib/modules/flashcards/stores';

beforeEach(() => { vi.clearAllMocks(); openLock.set(null); });

describe('FileLockModal', () => {
  it('renders nothing when there is no pending lock prompt', () => {
    render(FileLockModal);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('names the lock holder and wires the three resolution actions', async () => {
    openLock.set({ by: 'Alice', at: new Date().toISOString() });
    render(FileLockModal);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/Alice/)).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: /open read-only/i }));
    await fireEvent.click(screen.getByRole('button', { name: /edit anyway/i }));
    await fireEvent.click(screen.getByRole('button', { name: /don't open/i }));
    expect(m.resolveOpenReadOnly).toHaveBeenCalledTimes(1);
    expect(m.resolveEditAnyway).toHaveBeenCalledTimes(1);
    expect(m.resolveCloseLocked).toHaveBeenCalledTimes(1);
  });
});
