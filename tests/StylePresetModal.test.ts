import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { render, fireEvent, screen } from '@testing-library/svelte';
import StylePresetModal from '../src/lib/modules/flashcards/components/StylePresetModal.svelte';
import * as S from '../src/lib/modules/flashcards/stores';

beforeEach(() => { localStorage.clear(); S.initProject(); S.stylePresetOpen.set(true); });

describe('StylePresetModal', () => {
  it('saves the current style as a named preset', async () => {
    render(StylePresetModal);
    await fireEvent.input(screen.getByLabelText('New preset name'), { target: { value: 'Warm' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Save current' }));
    expect(get(S.stylePresetLibrary).map((e) => e.name)).toEqual(['Warm']);
  });

  it('Update overwrites the preset with the current Global style', async () => {
    S.setSettings({ margin: 5 });
    const id = S.saveStylePreset('P');
    S.setSettings({ margin: 40 });
    render(StylePresetModal);
    await fireEvent.click(screen.getByRole('button', { name: 'update from current style' }));
    expect(get(S.stylePresetLibrary).find((e) => e.id === id)!.preset.margin).toBe(40);
  });

  it('applies a preset with the chosen options and closes', async () => {
    S.saveStylePreset('Base');
    render(StylePresetModal);
    await fireEvent.click(screen.getByRole('button', { name: 'Apply' }));       // open options
    await fireEvent.click(screen.getByRole('button', { name: 'Apply preset' })); // confirm
    expect(get(S.stylePresetLibrary).length).toBe(1); // apply doesn't touch the library
    expect(get(S.stylePresetOpen)).toBe(false);       // modal closed after apply
  });
});
