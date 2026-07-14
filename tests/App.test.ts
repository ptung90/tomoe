import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import App from '../src/App.svelte';
import { setActiveModule } from '../src/lib/shell';
import { loadDocument } from '../src/lib/modules/json-table/stores';

// App.svelte's onMount wires up shell fileService (Tauri open-file routing + cold-start
// file pull) — keep those inert under jsdom so mounting App doesn't touch a real Tauri runtime.
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(() => Promise.resolve(() => {})) }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(() => Promise.resolve(null)) }));

beforeEach(() => setActiveModule(null));

describe('App', () => {
  it('shows the start screen when no module is active', () => {
    render(App);
    expect(screen.getByText(/New JSON Table/i)).toBeInTheDocument();
    expect(screen.getByText(/New Flashcards/i)).toBeInTheDocument();
  });

  it('renders the active module’s workspace when one is set', () => {
    loadDocument({ words: ['cat'] }, '/tmp/x.json');
    setActiveModule('json-table');
    render(App);
    expect(screen.getByPlaceholderText('Search…')).toBeInTheDocument();
    // 'root' appears both as the tree root and the breadcrumb root.
    expect(screen.getAllByRole('button', { name: 'root' }).length).toBeGreaterThan(0);
  });
});
