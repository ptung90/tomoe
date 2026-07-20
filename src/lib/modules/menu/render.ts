import { cellKey, type MenuWeek, type MenuTemplate, type MenuStyle } from './model';

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}

export function renderWeekTable(week: MenuWeek, template: MenuTemplate, s: MenuStyle): string {
  const nDays = template.days.length;
  const totalCols = nDays + 2; // period-label col + category-label col + one per day
  const border = `${s.border.width}px solid ${s.border.color}`;
  const cellStyle = `border:${border};padding:6px 8px;font-family:${s.cell.family};font-size:${s.cell.size}px;color:${s.cell.color};vertical-align:middle;`;
  const headStyle = `${cellStyle}background:${s.headerColor};color:${s.headerTextColor};font-weight:600;text-align:center;`;

  const rows: string[] = [];
  // Title row (spans all columns)
  rows.push(
    `<tr><td colspan="${totalCols}" style="${headStyle}font-size:${s.title.size}px;font-family:${s.title.family};color:${s.title.color};">${escapeHtml(week.title)}</td></tr>`);
  // Day-header row (two empty corner cells + day labels)
  rows.push(
    `<tr><td style="${headStyle}"></td><td style="${headStyle}"></td>` +
    template.days.map((d) => `<td style="${headStyle}">${escapeHtml(d)}</td>`).join('') + `</tr>`);
  // Body rows
  for (const period of template.periods) {
    period.categories.forEach((cat, i) => {
      const tds: string[] = [];
      if (i === 0) tds.push(`<td rowspan="${period.categories.length}" style="${headStyle}">${escapeHtml(period.label)}</td>`);
      tds.push(`<td style="${headStyle}text-align:left;">${cat.hideLabel ? '' : escapeHtml(cat.label)}</td>`);
      for (let day = 0; day < nDays; day++) {
        const v = week.cells[cellKey(cat.id, day)] ?? '';
        const zebra = s.zebra && day % 2 === 1 ? 'background:rgba(0,0,0,0.03);' : '';
        tds.push(`<td style="${cellStyle}text-align:center;${zebra}">${escapeHtml(v)}</td>`);
      }
      rows.push(`<tr>${tds.join('')}</tr>`);
    });
  }
  return `<table style="border-collapse:collapse;width:100%;background:#fff;">${rows.join('')}</table>`;
}
