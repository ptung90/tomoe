import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { render, screen, fireEvent } from '@testing-library/svelte';

const h = vi.hoisted(() => ({
  exportCardsPdf: vi.fn(async (_project?: unknown, _selection?: unknown) => new Uint8Array([1, 2, 3])),
  writeFile: vi.fn(async () => {}),
  save: vi.fn(async () => '/out/cards.pdf'),
  showToast: vi.fn(),
}));
vi.mock('../src/lib/modules/flashcards/lib/pdfExport', () => ({
  exportCardsPdf: h.exportCardsPdf, pdfFileName: () => 'cards.pdf', pdfStamp: () => 'stamp',
}));
vi.mock('@tauri-apps/plugin-fs', () => ({ writeFile: h.writeFile }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ save: h.save }));
vi.mock('../src/lib/shell', () => ({ showToast: h.showToast }));

import ExportModal from '../src/lib/modules/flashcards/components/ExportModal.svelte';
import * as S from '../src/lib/modules/flashcards/stores';

beforeEach(() => {
  vi.clearAllMocks();
  S.initProject();
  const sid = S.addSchema('Country');
  S.updateSchema(sid, { fields: [{ id: 'f1', key: 'name', label: 'Name', type: 'text', multilingual: true }] });
  // one view already exists (auto); add records
  S.addRecord(sid); S.addRecord(sid); S.addRecord(sid);
});

describe('ExportModal', () => {
  it('renders a record row per record and shows the page count', () => {
    render(ExportModal, { open: true, onClose: () => {} });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox').length).toBeGreaterThanOrEqual(3); // 3 records (+ view(s))
    expect(screen.getByText(/\d+ pages?/)).toBeInTheDocument();
  });

  it('Save PDF exports with the current selection and writes the file', async () => {
    render(ExportModal, { open: true, onClose: () => {} });
    await fireEvent.click(screen.getByRole('button', { name: /save pdf/i }));
    expect(h.exportCardsPdf).toHaveBeenCalledTimes(1);
    // second arg is the selection { views:Set, records:Set }
    const sel = h.exportCardsPdf.mock.calls[0][1] as { views: Set<string>; records: Set<string> };
    expect(sel.records.size).toBe(3);
    expect(h.writeFile).toHaveBeenCalledTimes(1);
  });

  it('Print stashes the selection in the printSelection store', async () => {
    vi.stubGlobal('print', vi.fn());
    render(ExportModal, { open: true, onClose: () => {} });
    await fireEvent.click(screen.getByRole('button', { name: /print/i }));
    expect(get(S.printSelection)).not.toBeNull();
  });
});
