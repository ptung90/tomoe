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

  it('status bar shows a zoom readout: 100% by default, explicit after zooming, Fit resets to auto', async () => {
    render(CardPreview);
    const pct = screen.getByRole('button', { name: 'Fit to pane' });
    expect(pct).toHaveTextContent('100%');
    expect(pct.className).not.toContain('auto');           // opens at explicit 100%, not auto-fit
    await fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(pct.className).not.toContain('auto');           // still an explicit user zoom
    await fireEvent.click(pct);                             // click % = Fit to pane
    expect(pct.className).toContain('auto');
  });

  it('Fixed: changing Cols/Rows commits gridCols/gridRows via setTemplateLayout', async () => {
    const sid = get(S.project).schemas[0].id;
    render(CardPreview);
    await fireEvent.click(screen.getByRole('button', { name: 'style' }));
    await fireEvent.click(screen.getByRole('tab', { name: 'Page' }));
    await fireEvent.change(screen.getByLabelText('Columns'), { target: { value: '2' } });
    await fireEvent.change(screen.getByLabelText('Rows'), { target: { value: '5' } });
    const tpl = get(S.project).schemas.find((s) => s.id === sid)!.cardTemplates[0];
    expect(tpl.gridCols).toBe(2);
    expect(tpl.gridRows).toBe(5);
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

describe('CardPreview — views', () => {
  it('shows exactly one .fc-card by default (single implicit view), named in its column header', () => {
    const { container } = render(CardPreview);
    expect(container.querySelectorAll('.fc-card')).toHaveLength(1);
    expect(container.querySelector('.view-col-label')?.textContent).toBe('View 1');
  });

  it('the "Add view" tile adds a 2nd view, shown side by side, and makes it active', async () => {
    const { container } = render(CardPreview);
    await fireEvent.click(screen.getByRole('button', { name: 'Add view' }));
    expect(container.querySelectorAll('.fc-card')).toHaveLength(2);
    const cols = container.querySelectorAll('.view-col');
    expect(cols).toHaveLength(2);
    expect(cols[1].classList.contains('active')).toBe(true);
  });

  it('clicking a view column makes it active; the layout dropdown then targets that view only', async () => {
    const sid = get(S.project).schemas[0].id;
    const { container } = render(CardPreview);
    await fireEvent.click(screen.getByRole('button', { name: 'Add view' })); // active view is now View 2
    const cols = container.querySelectorAll('.view-col');
    await fireEvent.click(cols[0]); // switch back to View 1
    await fireEvent.change(screen.getByLabelText(/layout/i), { target: { value: '2x2' } });
    const tpls = get(S.project).schemas.find((s) => s.id === sid)!.cardTemplates;
    expect(tpls[0].layout).toBe('2x2');
    expect(tpls[1].layout).not.toBe('2x2');
  });

  it('Sheet mode shows exactly one sheet (the active view\'s), even with 2 views', async () => {
    render(CardPreview);
    await fireEvent.click(screen.getByRole('button', { name: 'Add view' }));
    await fireEvent.click(screen.getByRole('tab', { name: 'Sheet' }));
    expect(document.querySelectorAll('.fc-sheet')).toHaveLength(1);
  });

  it('the active view\'s column is visually focused (.active); clicking the other column makes IT active', async () => {
    const { container } = render(CardPreview);
    await fireEvent.click(screen.getByRole('button', { name: 'Add view' })); // View 2 becomes active
    const cols = container.querySelectorAll('.view-col');
    expect(cols).toHaveLength(2);
    expect(cols[0].classList.contains('active')).toBe(false);
    expect(cols[1].classList.contains('active')).toBe(true);

    await fireEvent.click(cols[0]); // click the inactive (View 1) column
    const colsAfter = container.querySelectorAll('.view-col');
    expect(colsAfter[0].classList.contains('active')).toBe(true);
    expect(colsAfter[1].classList.contains('active')).toBe(false);
  });

  it('Rename (via the ⋯ menu) commits the new name through renameView', async () => {
    const sid = get(S.project).schemas[0].id;
    render(CardPreview);
    await fireEvent.click(screen.getByRole('button', { name: 'View 1 options' }));
    await fireEvent.click(screen.getByRole('menuitem', { name: /rename/i }));
    const input = screen.getByRole('textbox', { name: /rename view 1/i });
    await fireEvent.input(input, { target: { value: 'Front' } });
    await fireEvent.blur(input);
    const tpl = get(S.project).schemas.find((s) => s.id === sid)!.cardTemplates[0];
    expect(tpl.name).toBe('Front');
    expect(screen.getByText('Front')).toBeInTheDocument();
  });

  it('Delete (via the ⋯ menu) removes a view; the last remaining view has no delete affordance', async () => {
    const sid = get(S.project).schemas[0].id;
    render(CardPreview);
    await fireEvent.click(screen.getByRole('button', { name: 'Add view' }));
    expect(get(S.project).schemas.find((s) => s.id === sid)!.cardTemplates).toHaveLength(2);

    await fireEvent.click(screen.getByRole('button', { name: 'View 2 options' }));
    await fireEvent.click(screen.getByRole('menuitem', { name: 'Delete View 2' }));
    expect(get(S.project).schemas.find((s) => s.id === sid)!.cardTemplates).toHaveLength(1);

    await fireEvent.click(screen.getByRole('button', { name: 'View 1 options' }));
    expect(screen.getByRole('menuitem', { name: 'Delete View 1' })).toBeDisabled();
  });
});
