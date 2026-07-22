import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { render, fireEvent, screen } from '@testing-library/svelte';
import ConfigModal from '../src/lib/components/ConfigModal.svelte';
import { configOpen, autoSaveEnabled, setAutoSaveEnabled } from '../src/lib/shell';

beforeEach(() => { setAutoSaveEnabled(true); configOpen.set(true); });

describe('ConfigModal — auto-save', () => {
  it('auto-save is ON by default (checkbox checked)', () => {
    expect(get(autoSaveEnabled)).toBe(true);
    render(ConfigModal);
    expect((screen.getByLabelText('enable auto-save') as HTMLInputElement).checked).toBe(true);
  });

  it('unchecking the toggle disables auto-save', async () => {
    render(ConfigModal);
    await fireEvent.click(screen.getByLabelText('enable auto-save'));
    expect(get(autoSaveEnabled)).toBe(false);
  });
});
