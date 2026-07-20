import { describe, it, expect } from 'vitest';
import { renderWeekTable } from '../src/lib/modules/menu/render';
import { newMenuDoc, cellKey } from '../src/lib/modules/menu/model';

describe('renderWeekTable', () => {
  const { template, settings } = newMenuDoc();
  const trua = template.periods[0];          // Trưa: 4 categories
  const week = { id: 'w', title: 'Thực đơn tháng 6 - Tuần 2',
    cells: { [cellKey(trua.categories[0].id, 0)]: 'Thịt kho trứng' } };

  it('renders the title', () => {
    expect(renderWeekTable(week, template, settings)).toContain('Thực đơn tháng 6 - Tuần 2');
  });
  it('period label spans its categories via rowspan', () => {
    const html = renderWeekTable(week, template, settings);
    expect(html).toMatch(/rowspan="4"[^>]*>\s*Trưa/);
  });
  it('places a filled cell', () => {
    expect(renderWeekTable(week, template, settings)).toContain('Thịt kho trứng');
  });
  it('hideLabel category renders an empty label cell (no "Tráng miệng")', () => {
    expect(renderWeekTable(week, template, settings)).not.toContain('Tráng miệng');
  });
  it('renders one column header per day', () => {
    const html = renderWeekTable(week, template, settings);
    for (const d of template.days) expect(html).toContain(d);
  });
  it('escapes HTML in cell text', () => {
    const w = { id: 'w', title: 'T', cells: { [cellKey(trua.categories[0].id, 0)]: '<b>x</b>' } };
    expect(renderWeekTable(w, template, settings)).toContain('&lt;b&gt;x&lt;/b&gt;');
  });
});
