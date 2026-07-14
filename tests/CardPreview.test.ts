import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import CardPreview from '../src/lib/modules/flashcards/components/CardPreview.svelte';
import * as S from '../src/lib/modules/flashcards/stores';
import { get } from 'svelte/store';

beforeEach(() => {
  S.initProject();
  const sid = S.addSchema('Words');
  S.updateSchema(sid, { fields: [{ id: 'f1', key: 'title', label: 'Title', type: 'text', multilingual: true }] });
  S.addRecord(sid);
  S.setField(get(S.project).records[0].id, 'title', 'Owl', 'en');
});

describe('CardPreview', () => {
  it('renders a card for the selected record', () => {
    const { container } = render(CardPreview);
    expect(container.querySelector('.fc-card')).toBeInTheDocument();
    expect(container.textContent).toContain('Owl');
  });
  it('shows an empty state when no record is selected', () => {
    S.selectRecord(null);
    render(CardPreview);
    expect(screen.getByText(/no record selected/i)).toBeInTheDocument();
  });
  it('offers the in-scope layouts in the layout selector', () => {
    render(CardPreview);
    const sel = screen.getByLabelText(/layout/i) as HTMLSelectElement;
    expect(sel.querySelectorAll('option').length).toBe(7);
  });
});
