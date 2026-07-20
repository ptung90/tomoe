import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { render, fireEvent, screen, within } from '@testing-library/svelte';
import Workspace from '../src/lib/modules/flashcards/Workspace.svelte';
import * as S from '../src/lib/modules/flashcards/stores';

vi.mock('@tauri-apps/plugin-dialog', () => ({ confirm: vi.fn(async () => true) }));
vi.mock('../src/lib/modules/flashcards/io/backupService', () => ({
  writeBackup: vi.fn(), listBackups: vi.fn(async () => []), chooseBackupDir: vi.fn(), openBackupFolder: vi.fn(),
}));

beforeEach(() => {
  S.initProject();
  const sid = S.addSchema('Words');
  S.updateSchema(sid, { fields: [{ id: 'f1', key: 'title', label: 'Title', type: 'text', multilingual: true }] });
  S.addRecord(sid);
});

describe('Flashcards Workspace', () => {
  it('renders the left list and the detail form together', () => {
    render(Workspace);
    expect(screen.getByText('Words')).toBeInTheDocument();       // left pane schema
    expect(screen.getByText('Title')).toBeInTheDocument();       // right pane field (record auto-selected)
  });
  it('renders the card preview pane alongside list and detail', () => {
    const { container } = render(Workspace);
    // record auto-selected in beforeEach → a card renders
    expect(container.querySelector('.fc-card')).toBeInTheDocument();
  });
  it('merges the status bars: preview controls in the single footer (records), gallery controls after switching to cards', async () => {
    const { container } = render(Workspace);
    // records view: the delegated preview controls live in the one workspace footer — exactly one bar
    expect(container.querySelectorAll('.statusbar').length).toBe(1);
    expect(container.querySelector('.preview-statusbar')).toBeNull();     // no separate preview footer
    const footer = container.querySelector('.statusbar') as HTMLElement;
    expect(footer.querySelector('.filename')).toBeInTheDocument();        // project info…
    expect(within(footer).getByRole('tab', { name: 'Sheet' })).toBeInTheDocument(); // …+ delegated preview controls
    // switch to cards view → footer now hosts the gallery controls (Gallery/Sheets), not preview's
    await fireEvent.click(screen.getByRole('button', { name: /cards/i }));
    expect(container.querySelector('.gallery-statusbar')).toBeNull();
    expect(within(footer).getByRole('tab', { name: 'Gallery' })).toBeInTheDocument();
  });
  it('shows the project name in an editable header field', () => {
    render(Workspace);
    expect(screen.getByDisplayValue('Untitled')).toBeInTheDocument();
  });
  it('editing the header field renames the project (and blank falls back to Untitled)', async () => {
    render(Workspace);
    const input = screen.getByLabelText('project name');
    await fireEvent.change(input, { target: { value: 'Birds' } });
    expect(get(S.project).projectName).toBe('Birds');
    await fireEvent.change(input, { target: { value: '   ' } });
    expect(get(S.project).projectName).toBe('Untitled');
  });
  it('toggles between Records and Cards views', async () => {
    const { getByRole, container } = render(Workspace);
    // default: Records view shows the detail form field
    expect(screen.getByText('Title')).toBeInTheDocument();
    await fireEvent.click(getByRole('button', { name: /cards/i }));
    // Cards view shows gallery thumbnails
    expect(container.querySelector('.thumb')).toBeInTheDocument();
    await fireEvent.click(getByRole('button', { name: /records/i }));
    expect(screen.getByText('Title')).toBeInTheDocument();
  });
  it('Export button opens the export/print modal, and is disabled with no cards', async () => {
    const { getByRole, unmount } = render(Workspace);
    await fireEvent.click(getByRole('button', { name: /export/i }));
    expect(screen.getByRole('dialog', { name: /export/i })).toBeInTheDocument();
    unmount();
    // now empty → disabled
    S.initProject();
    const second = render(Workspace);
    expect(second.getByRole('button', { name: /export/i })).toBeDisabled();
  });
});
