import { describe, it, expect, vi } from 'vitest';
import { get } from 'svelte/store';
import { render, fireEvent } from '@testing-library/svelte';
import CardGallery from '../src/lib/modules/flashcards/components/CardGallery.svelte';
import * as S from '../src/lib/modules/flashcards/stores';

vi.mock('@tauri-apps/plugin-dialog', () => ({ confirm: vi.fn(async () => true) }));

function seed(layout: string, n: number) {
  S.initProject();
  const sid = S.addSchema('Words');
  S.updateSchema(sid, { fields: [
    { id: 'f1', key: 'title', label: 'Title', type: 'text', multilingual: true },
    { id: 'f2', key: 'def', label: 'Def', type: 'text', multilingual: true },
  ] });
  S.setTemplateLayout(sid, { layout });
  for (let i = 0; i < n; i++) S.addRecord(sid);
  return sid;
}

describe('CardGallery', () => {
  it('renders one thumbnail per record for a single layout', () => {
    seed('1top-1bot', 4);
    const { container } = render(CardGallery, { onOpen: vi.fn() });
    expect(container.querySelectorAll('.thumb').length).toBe(4);
    expect(container.querySelector('.fc-card')).toBeInTheDocument();
  });
  it('clicking a thumbnail calls onOpen with that record id', async () => {
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

  it('Gallery view (default) shows per-card thumbnails, not sheets', () => {
    seed('1top-1bot', 3);
    const { container } = render(CardGallery, { onOpen: vi.fn() });
    expect(container.querySelectorAll('.thumb').length).toBe(3);
    expect(container.querySelector('.fc-sheet')).not.toBeInTheDocument();
  });

  it('Sheets view tiles the cards onto paper (one .fc-sheet per page, same as Print/PDF)', async () => {
    const sid = seed('1top-1bot', 3);
    S.setTemplateLayout(sid, { cardsPerPage: 2, autoFit: false }); // 3 cards → 2 sheets
    const { container, getByRole } = render(CardGallery, { onOpen: vi.fn() });
    await fireEvent.click(getByRole('tab', { name: 'Sheets' }));
    expect(container.querySelectorAll('.fc-sheet').length).toBe(2);
    expect(container.querySelector('.thumb')).not.toBeInTheDocument(); // no per-card thumbs in sheets view
  });

  it('status bar zoom: 100% by default, changes on zoom in, resets on click', async () => {
    seed('1top-1bot', 2);
    const { getByRole } = render(CardGallery, { onOpen: vi.fn() });
    const pct = getByRole('button', { name: 'Reset zoom' });
    expect(pct.textContent).toContain('100%');
    expect(pct.className).toContain('auto');
    await fireEvent.click(getByRole('button', { name: 'Zoom in' }));
    expect(pct.className).not.toContain('auto');
    await fireEvent.click(pct);
    expect(pct.textContent).toContain('100%');
  });
});

describe('CardGallery — packed cards', () => {
  it('Pack all creates persisted cards and excludes those records from the auto section', async () => {
    seed('1top-1bot', 3); // 3 records → after pack: 3 packed cards, 0 auto
    const { container, getByRole } = render(CardGallery, { onOpen: vi.fn() });
    await fireEvent.click(getByRole('button', { name: /pack all/i }));
    expect(get(S.project).cards.length).toBe(3);
    expect(container.querySelectorAll('.thumb.packed').length).toBe(3);
    expect(container.querySelectorAll('.thumb.auto').length).toBe(0);
  });
  it('shows a stale badge after a source record changes, cleared by Regenerate', async () => {
    const sid = seed('1top-1bot', 3);
    S.packAllForSchema(sid);
    S.setField(get(S.project).records[0].id, 'title', 'CHANGED', 'en');
    const { container, getByRole } = render(CardGallery, { onOpen: vi.fn() });
    expect(container.querySelector('.badge.stale')).toBeInTheDocument();
    await fireEvent.click(getByRole('button', { name: /regenerate/i }));
    expect(container.querySelector('.badge.stale')).not.toBeInTheDocument();
  });
  it('Delete removes a packed card', async () => {
    const sid = seed('1top-1bot', 1);
    S.packAllForSchema(sid);
    const { getByRole } = render(CardGallery, { onOpen: vi.fn() });
    await fireEvent.click(getByRole('button', { name: /delete/i }));
    expect(get(S.project).cards.length).toBe(0);
  });
});

describe('CardGallery — edit + apply', () => {
  it('Edit button opens the card editor', async () => {
    const sid = seed('1top-1bot', 1);
    S.packAllForSchema(sid);
    const { getByRole } = render(CardGallery, { onOpen: vi.fn() });
    await fireEvent.click(getByRole('button', { name: /^edit/i }));
    expect(get(S.cardEditorOpen)).toBe(get(S.project).cards[0].id);
    S.cardEditorOpen.set(null);
  });
  it('Apply shows when edited and writes back to records + clears Edited', async () => {
    const sid = seed('1top-1bot', 3);
    S.packAllForSchema(sid);
    const cardId = get(S.project).cards[0].id;
    const r0 = get(S.project).cards[0].recordId!;
    S.setCardCell(cardId, 0, { content: 'a bird' });
    const { container, getByRole } = render(CardGallery, { onOpen: vi.fn() });
    expect(container.querySelector('.badge.edited')).toBeInTheDocument();
    await fireEvent.click(getByRole('button', { name: /apply/i }));
    expect((get(S.project).records.find((r) => r.id === r0)!.fields.def as Record<string, string>).en).toBe('a bird');
    expect(container.querySelector('.badge.edited')).not.toBeInTheDocument();
  });
});
