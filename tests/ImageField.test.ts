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
  it('escapes single quotes in the thumbnail url', () => {
    const { container } = render(ImageField, { value: "http://x/o'brien.png", onChange: vi.fn() });
    const style = container.querySelector('.thumb')!.getAttribute('style') ?? '';
    expect(style).toMatch(/background-image:\s*url\(/);
    expect(style).toContain('%27');
    expect(style).not.toContain("o'brien");
  });
  it('shows a Search button and an Edit image button (edit only when a value exists)', () => {
    const { rerender } = render(ImageField, { value: '', onChange: vi.fn() });
    expect(screen.getByRole('button', { name: /search/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit image/i })).not.toBeInTheDocument();
    rerender({ value: 'http://x/a.png', onChange: vi.fn() });
    expect(screen.getByRole('button', { name: /edit image/i })).toBeInTheDocument();
  });
});
