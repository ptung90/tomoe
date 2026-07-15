import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
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
  it('offers the 12 single-card layouts in the layout selector', () => {
    render(CardPreview);
    const sel = screen.getByLabelText(/layout/i) as HTMLSelectElement;
    expect(sel.querySelectorAll('option').length).toBe(12);
  });

  it('Sheet toggle renders a .fc-sheet', async () => {
    const { container } = render(CardPreview);
    await fireEvent.click(screen.getByRole('tab', { name: 'Sheet' }));
    expect(container.querySelector('.fc-sheet')).toBeInTheDocument();
    expect(container.querySelector('.fc-sheet-cell')).toBeInTheDocument();
  });

  it('Card mode (default) shows the single card, not a sheet', () => {
    const { container } = render(CardPreview);
    expect(container.querySelector('.fc-card')).toBeInTheDocument();
    expect(container.querySelector('.fc-sheet')).not.toBeInTheDocument();
  });

  it('status bar shows a zoom readout: auto-fit by default, explicit after zooming, Fit resets it', async () => {
    render(CardPreview);
    const pct = screen.getByRole('button', { name: 'Fit to pane' });
    expect(pct).toHaveTextContent('%');
    expect(pct.className).toContain('auto');              // auto-fit initially
    await fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(pct.className).not.toContain('auto');          // now an explicit user zoom
    await fireEvent.click(pct);                            // click % = Fit to pane
    expect(pct.className).toContain('auto');
  });

  it('Fixed: changing Cards/page commits cardsPerPage via setTemplateLayout', async () => {
    const sid = get(S.project).schemas[0].id;
    render(CardPreview);
    await fireEvent.click(screen.getByRole('button', { name: 'style' }));
    await fireEvent.click(screen.getByRole('tab', { name: 'Page' }));
    await fireEvent.change(screen.getByLabelText('Cards per page'), { target: { value: '6' } });
    const tpl = get(S.project).schemas.find((s) => s.id === sid)!.cardTemplates[0];
    expect(tpl.cardsPerPage).toBe(6);
    expect(tpl.autoFit).toBeFalsy();
  });

  it('Auto-fit: switching mode + choosing a card size commits autoFit + cardSize', async () => {
    const sid = get(S.project).schemas[0].id;
    render(CardPreview);
    await fireEvent.click(screen.getByRole('button', { name: 'style' }));
    await fireEvent.click(screen.getByRole('tab', { name: 'Page' }));
    await fireEvent.click(screen.getByRole('tab', { name: 'Auto-fit' }));
    await fireEvent.change(screen.getByLabelText('Card size'), { target: { value: 'A7' } });
    const tpl = get(S.project).schemas.find((s) => s.id === sid)!.cardTemplates[0];
    expect(tpl.autoFit).toBe(true);
    expect(tpl.cardSize).toBe('A7');
  });

  it('Card mode shows the real cell size — a 3-up card is shorter than a 1-up card', () => {
    const sid = get(S.project).schemas[0].id;
    const cardH = () => {
      const el = render(CardPreview).container.querySelector('.fc-card') as HTMLElement | null;
      return el ? parseInt(el.style.height, 10) : NaN;
    };
    S.setTemplateLayout(sid, { cardsPerPage: 1 });
    const h1 = cardH();
    S.setTemplateLayout(sid, { cardsPerPage: 3 });
    const h3 = cardH();
    expect(h3).toBeGreaterThan(0);
    expect(h3).toBeLessThan(h1); // one cell of a 3-up sheet, not the full page
  });
});
