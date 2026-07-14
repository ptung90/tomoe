import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { get } from 'svelte/store';
import Toolbar from '../src/lib/components/Toolbar.svelte';
import { loadDocument, editValue, data, twoLevel, setTwoLevel, configOpen } from '../src/lib/stores';

beforeEach(() => { loadDocument({ words: ['a'] }, '/tmp/demo.json'); setTwoLevel(false); });

describe('Toolbar', () => {
  it('shows the filename and enables undo after an edit', async () => {
    render(Toolbar);
    expect(screen.getByText('demo.json')).toBeInTheDocument();
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
  it('two-column toggle flips twoLevel', async () => {
    render(Toolbar);
    await fireEvent.click(screen.getByRole('button', { name: /two-column/i }));
    expect(get(twoLevel)).toBe(true);
    setTwoLevel(false);
  });
  it('settings button opens the config modal', async () => {
    configOpen.set(false);
    render(Toolbar);
    await fireEvent.click(screen.getByRole('button', { name: /settings/i }));
    expect(get(configOpen)).toBe(true);
  });
});
