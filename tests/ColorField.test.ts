import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import ColorField from '../src/lib/modules/flashcards/components/ColorField.svelte';
import { resetContinentColors } from '../src/lib/modules/flashcards/stores';

beforeEach(() => { localStorage.clear(); resetContinentColors(); }); // presets = palette defaults

describe('ColorField', () => {
  it('lists the 7 continent presets plus Custom and reflects a matching color', () => {
    render(ColorField, { value: '#E00000', oninput: () => {}, ariaLabel: 'Border color' });
    const select = screen.getByLabelText('Border color preset') as HTMLSelectElement;
    expect(select.options.length).toBe(8);       // 7 continents + Custom
    expect(select.value).toBe('#E00000');         // Europe reflected
  });

  it('shows Custom for a non-preset color', () => {
    render(ColorField, { value: '#123456', oninput: () => {}, ariaLabel: 'Color' });
    expect((screen.getByLabelText('Color preset') as HTMLSelectElement).value).toBe('__custom__');
  });

  it('emits the continent hex when a preset is picked', async () => {
    const oninput = vi.fn();
    render(ColorField, { value: '#000000', oninput, ariaLabel: 'Color' });
    await fireEvent.change(screen.getByLabelText('Color preset'), { target: { value: '#1E7A45' } });
    expect(oninput).toHaveBeenCalledWith('#1E7A45');
  });

  it('emits from the free color swatch too', async () => {
    const oninput = vi.fn();
    render(ColorField, { value: '#000000', oninput, ariaLabel: 'Color' });
    await fireEvent.input(screen.getByLabelText('Color'), { target: { value: '#abcdef' } });
    expect(oninput).toHaveBeenCalledWith('#abcdef');
  });
});
