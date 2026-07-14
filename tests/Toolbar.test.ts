import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { get } from 'svelte/store';
import Toolbar from '../src/lib/components/Toolbar.svelte';
import { activeModuleId, setActiveModule } from '../src/lib/shell';
import { loadDocument, editValue, data } from '../src/lib/modules/json-table/stores';

// Toolbar's Open button goes through the shell fileService, which touches Tauri's
// dialog/fs/event/core APIs at import time — stub them so mounting stays inert under jsdom.
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(() => Promise.resolve(() => {})) }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(() => Promise.resolve(null)) }));
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(async () => null),
  save: vi.fn(async () => null),
  confirm: vi.fn(async () => true),
}));
vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: vi.fn(async () => '{}'),
  writeTextFile: vi.fn(async () => {}),
}));

beforeEach(() => {
  loadDocument({ words: ['a'] }, '/tmp/demo.json');
  setActiveModule('json-table');
});

describe('Toolbar', () => {
  it('disables file/edit actions when no module is active', () => {
    setActiveModule(null);
    render(Toolbar);
    expect((screen.getByRole('button', { name: /^save$/i }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: /undo/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('enables undo after an edit to the active module', async () => {
    render(Toolbar);
    const undoBtn = screen.getByRole('button', { name: /undo/i }) as HTMLButtonElement;
    expect(undoBtn.disabled).toBe(true);
    editValue(['words', 0], 'z');
    await tick();
    expect(undoBtn.disabled).toBe(false);
  });

  it('undo button reverts the last edit', async () => {
    render(Toolbar);
    editValue(['words', 0], 'z');
    await fireEvent.click(screen.getByRole('button', { name: /undo/i }));
    expect((get(data) as any).words).toEqual(['a']);
  });

  it('New button returns to the start screen', async () => {
    render(Toolbar);
    await fireEvent.click(screen.getByRole('button', { name: /^new$/i }));
    expect(get(activeModuleId)).toBeNull();
  });
});
