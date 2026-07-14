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
    expect(screen.getByText(/no card to preview/i)).toBeInTheDocument();
  });
  it('offers the in-scope layouts in the layout selector', () => {
    render(CardPreview);
    const sel = screen.getByLabelText(/layout/i) as HTMLSelectElement;
    expect(sel.querySelectorAll('option').length).toBe(7);
  });
  it('3card preview shows the whole 3-record page, not just the selected record', () => {
    // seed: schema with 3card layout + 3 records
    S.initProject();
    const sid = S.addSchema('Words');
    S.updateSchema(sid, { fields: [
      { id: 'f1', key: 'title', label: 'Title', type: 'text', multilingual: true },
      { id: 'f2', key: 'def', label: 'Def', type: 'text', multilingual: true },
    ] });
    S.setTemplateLayout(sid, { layout: '3card' });
    S.addRecord(sid); S.addRecord(sid); S.addRecord(sid);
    const recs = get(S.project).records;
    S.setField(recs[0].id, 'title', 'Cat', 'en');
    S.setField(recs[1].id, 'title', 'Dog', 'en');
    S.setField(recs[2].id, 'title', 'Cow', 'en');
    S.selectRecord(recs[0].id);
    const { container } = render(CardPreview);
    const text = container.textContent ?? '';
    expect(text).toContain('Cat');
    expect(text).toContain('Dog'); // a neighbour in the same page — proves the chunk renders
    expect(text).toContain('Cow');
  });
});
