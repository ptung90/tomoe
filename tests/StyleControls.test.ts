import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { render, fireEvent, screen } from '@testing-library/svelte';
import StyleControls from '../src/lib/modules/flashcards/components/StyleControls.svelte';
import * as S from '../src/lib/modules/flashcards/stores';

beforeEach(() => { S.initProject(); });

describe('StyleControls', () => {
  it('editing border width commits to settings', async () => {
    render(StyleControls);
    await fireEvent.change(screen.getByLabelText('Width'), { target: { value: '6' } });
    expect(get(S.project).settings.border.width).toBe(6);
  });

  it('color picker applies live via input (border color, first)', async () => {
    const { container } = render(StyleControls);
    const colorInput = container.querySelector('input[type=color]') as HTMLInputElement;
    await fireEvent.input(colorInput, { target: { value: '#123456' } });
    expect(get(S.project).settings.border.color).toBe('#123456');
  });

  it('editing card margin commits to settings', async () => {
    render(StyleControls);
    await fireEvent.change(screen.getByLabelText('Card margin (mm)'), { target: { value: '12' } });
    expect(get(S.project).settings.margin).toBe(12);
  });

  it('vertical text align select commits', async () => {
    render(StyleControls);
    await fireEvent.change(screen.getByLabelText('Vertical text align'), { target: { value: 'middle' } });
    expect(get(S.project).settings.textVAlign).toBe('middle');
  });

  it('image fit select commits to image.backgroundSize', async () => {
    render(StyleControls);
    await fireEvent.change(screen.getByLabelText('Fit'), { target: { value: 'contain' } });
    expect(get(S.project).settings.image.backgroundSize).toBe('contain');
  });

  it('3-card fit checkbox commits', async () => {
    render(StyleControls);
    await fireEvent.change(screen.getByLabelText('3-card fit (fill height)'), { target: { checked: true } });
    expect(get(S.project).settings.threeCardFit).toBe(true);
  });

  it('title font family (first Family control) commits to titleFont', async () => {
    render(StyleControls);
    await fireEvent.change(screen.getAllByLabelText('Family')[0], { target: { value: 'serif' } });
    expect(get(S.project).settings.titleFont.family).toBe('serif');
  });

  it('title line-height (first Line height control) commits to titleFont', async () => {
    render(StyleControls);
    await fireEvent.change(screen.getAllByLabelText('Line height')[0], { target: { value: '1.4' } });
    expect(get(S.project).settings.titleFont.lineHeight).toBe(1.4);
  });

  it('title align-center button sets titleFont.textAlign', async () => {
    render(StyleControls);
    await fireEvent.click(screen.getAllByLabelText('align center')[0]);
    expect(get(S.project).settings.titleFont.textAlign).toBe('center');
  });
});
