import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';

const h = vi.hoisted(() => ({
  listBackups: vi.fn(async () => [{ name: 'vn-20260103-0000.tomoe.json', path: '/bk/vn-20260103-0000.tomoe.json' }]),
  openPath: vi.fn(),
}));
vi.mock('../src/lib/modules/flashcards/io/backupService', () => ({ listBackups: h.listBackups }));
vi.mock('../src/lib/fileService', () => ({ openPath: h.openPath }));

import BackupsModal from '../src/lib/modules/flashcards/components/BackupsModal.svelte';
import { setBackupEnabled, setBackupDir } from '../src/lib/shell';

beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); setBackupEnabled(true); setBackupDir('/bk'); });

describe('BackupsModal', () => {
  it('renders nothing when closed', () => {
    render(BackupsModal, { open: false, onClose: () => {} });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('lists this project\'s backups and restores one through openPath', async () => {
    render(BackupsModal, { open: true, onClose: () => {} });
    await screen.findByText('vn-20260103-0000.tomoe.json');
    await fireEvent.click(screen.getByRole('button', { name: /^open$/i }));
    expect(h.openPath).toHaveBeenCalledWith('/bk/vn-20260103-0000.tomoe.json');
  });
});
