import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/svelte';
import ImageSearchModal from '../src/lib/modules/flashcards/components/ImageSearchModal.svelte';

const hits = [
  { thumb: 'https://x/a_300.jpg', full: 'https://x/a.jpg', title: 'A' },
  { thumb: 'https://x/b_300.jpg', full: 'https://x/b.jpg', title: 'B' },
];

describe('ImageSearchModal', () => {
  it('searches and renders result thumbnails; clicking one picks its full url', async () => {
    const search = vi.fn(async () => hits);
    const onPick = vi.fn();
    const { container } = render(ImageSearchModal, { onPick, onClose: vi.fn(), search });
    await fireEvent.input(screen.getByPlaceholderText(/search/i), { target: { value: 'owl' } });
    await fireEvent.submit(screen.getByPlaceholderText(/search/i).closest('form')!);
    expect(search).toHaveBeenCalledWith('owl');
    const imgs = container.querySelectorAll('.hit');
    expect(imgs.length).toBe(2);
    await fireEvent.click(imgs[0]);
    expect(onPick).toHaveBeenCalledWith('https://x/a.jpg');
  });
  it('shows "no images" when the search returns empty', async () => {
    render(ImageSearchModal, { onPick: vi.fn(), onClose: vi.fn(), search: vi.fn(async () => []) });
    await fireEvent.input(screen.getByPlaceholderText(/search/i), { target: { value: 'zzz' } });
    await fireEvent.submit(screen.getByPlaceholderText(/search/i).closest('form')!);
    expect(await screen.findByText(/no images/i)).toBeInTheDocument();
  });
});
