import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/svelte';
import ImageField from '../src/lib/modules/flashcards/components/ImageField.svelte';

describe('ImageField', () => {
  it('shows the url in the input and fires onChange on typing', async () => {
    const onChange = vi.fn();
    render(ImageField, { value: 'http://x/a.png', onChange });
    const input = screen.getByPlaceholderText(/image url/i) as HTMLInputElement;
    expect(input.value).toBe('http://x/a.png');
    await fireEvent.input(input, { target: { value: 'http://x/b.png' } });
    expect(onChange).toHaveBeenCalledWith('http://x/b.png');
  });
  it('clear button empties the value', async () => {
    const onChange = vi.fn();
    render(ImageField, { value: 'http://x/a.png', onChange });
    await fireEvent.click(screen.getByRole('button', { name: /clear/i }));
    expect(onChange).toHaveBeenCalledWith('');
  });
  it('hides clear when empty', () => {
    render(ImageField, { value: '', onChange: vi.fn() });
    expect(screen.queryByRole('button', { name: /clear/i })).not.toBeInTheDocument();
  });
});
