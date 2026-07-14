import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { render, fireEvent, screen } from '@testing-library/svelte';
import StyleControls from '../src/lib/modules/flashcards/components/StyleControls.svelte';
import * as S from '../src/lib/modules/flashcards/stores';

beforeEach(() => { S.initProject(); });

describe('StyleControls', () => {
  it('editing border width commits to settings', async () => {
    render(StyleControls);
    const input = screen.getByLabelText(/border width/i);
    await fireEvent.change(input, { target: { value: '6' } });
    expect(get(S.project).settings.border.width).toBe(6);
  });
  it('editing title font size commits to settings', async () => {
    render(StyleControls);
    const input = screen.getByLabelText(/title font size/i);
    await fireEvent.change(input, { target: { value: '20' } });
    expect(get(S.project).settings.titleFont.size).toBe(20);
  });
  it('color picker applies live via input (not only on change/blur)', async () => {
    const { container } = render(StyleControls);
    const colorInput = container.querySelector('input[type=color]') as HTMLInputElement; // border color (first)
    await fireEvent.input(colorInput, { target: { value: '#123456' } });
    expect(get(S.project).settings.border.color).toBe('#123456');
  });
});
