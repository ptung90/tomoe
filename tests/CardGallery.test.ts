import { describe, it, expect, vi } from 'vitest';
import { get } from 'svelte/store';
import { render, fireEvent } from '@testing-library/svelte';
import CardGallery from '../src/lib/modules/flashcards/components/CardGallery.svelte';
import * as S from '../src/lib/modules/flashcards/stores';

function seed(layout: string, n: number) {
  S.initProject();
  const sid = S.addSchema('Words');
  S.updateSchema(sid, { fields: [{ id: 'f1', key: 'title', label: 'Title', type: 'text', multilingual: true }] });
  S.setTemplateLayout(sid, { layout });
  for (let i = 0; i < n; i++) S.addRecord(sid);
}

describe('CardGallery', () => {
  it('renders one thumbnail per record for a single layout', () => {
    seed('1top-1bot', 4);
    const { container } = render(CardGallery, { onOpen: vi.fn() });
    expect(container.querySelectorAll('.thumb').length).toBe(4);
    expect(container.querySelector('.fc-card')).toBeInTheDocument();
  });
  it('chunks 3card into pages of 3 (4 records → 2 thumbnails)', () => {
    seed('3card', 4);
    const { container } = render(CardGallery, { onOpen: vi.fn() });
    expect(container.querySelectorAll('.thumb').length).toBe(2);
  });
  it('clicking a thumbnail calls onOpen with the chunk first record id', async () => {
    seed('1top-1bot', 2);
    const onOpen = vi.fn();
    const { container } = render(CardGallery, { onOpen });
    const firstId = get(S.project).records[0].id;
    await fireEvent.click(container.querySelector('.thumb')!);
    expect(onOpen).toHaveBeenCalledWith(firstId);
  });
  it('shows an empty state when there are no schemas', () => {
    S.initProject();
    const { getByText } = render(CardGallery, { onOpen: vi.fn() });
    expect(getByText(/no cards yet/i)).toBeInTheDocument();
  });
});
