import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { render } from '@testing-library/svelte';
import PrintView from '../src/lib/modules/flashcards/components/PrintView.svelte';
import * as S from '../src/lib/modules/flashcards/stores';

beforeEach(() => {
  S.initProject();
  const sid = S.addSchema('Words');
  S.updateSchema(sid, { fields: [{ id: 'f1', key: 'title', label: 'Title', type: 'text', multilingual: true }] });
  S.addRecord(sid); S.addRecord(sid);
});

describe('PrintView', () => {
  it('renders one .print-page per collected card, each with a card', () => {
    const { container } = render(PrintView);
    const pages = container.querySelectorAll('.print-page');
    expect(pages.length).toBe(get(S.project).records.length); // single layout → 1 per record
    expect(container.querySelector('.print-page .fc-card')).toBeInTheDocument();
  });
  it('renders nothing but the container when there are no cards', () => {
    S.initProject();
    const { container } = render(PrintView);
    expect(container.querySelectorAll('.print-page').length).toBe(0);
  });
  it('tiles N-up sheets per cardsPerPage — 7 records, 6/page → 2 sheets', () => {
    S.initProject();
    const sid = S.addSchema('Words');
    S.updateSchema(sid, { fields: [{ id: 'f1', key: 'title', label: 'Title', type: 'text', multilingual: true }] });
    for (let i = 0; i < 7; i++) S.addRecord(sid);
    S.setTemplateLayout(sid, { cardsPerPage: 6 });
    const { container } = render(PrintView);
    expect(container.querySelectorAll('.print-page').length).toBe(2);
    // fixed grid fills every cell of every sheet (6 + 6), even the trailing blanks.
    expect(container.querySelectorAll('.fc-sheet-cell').length).toBe(12);
  });
});
