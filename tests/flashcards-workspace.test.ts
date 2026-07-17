import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { render, fireEvent, screen } from '@testing-library/svelte';
import Workspace from '../src/lib/modules/flashcards/Workspace.svelte';
import * as S from '../src/lib/modules/flashcards/stores';

vi.mock('@tauri-apps/plugin-dialog', () => ({ confirm: vi.fn(async () => true) }));
// Workspace's onDestroy releases the file lock (fire-and-forget); mock the service so tests never
// touch real lock-file fs (avoids a flaky post-unmount unhandled rejection).
vi.mock('../src/lib/modules/flashcards/io/lockService', () => ({
  acquireLock: vi.fn(), checkAndAcquireLock: vi.fn(), releaseLock: vi.fn(),
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
  it('Print button calls window.print and is disabled with no cards', async () => {
    const printSpy = vi.fn();
    (window as unknown as { print: () => void }).print = printSpy;
    const { getByRole, unmount } = render(Workspace);
    const btn = getByRole('button', { name: /print/i });
    await fireEvent.click(btn);
    expect(printSpy).toHaveBeenCalled();
    unmount();
    // now empty → disabled
    S.initProject();
    const second = render(Workspace);
    expect(second.getByRole('button', { name: /print/i })).toBeDisabled();
  });
});
