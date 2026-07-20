export interface FontSpec { family: string; size: number; weight?: number; color: string }
export interface EditLogEntry { by: string; at: string }

export interface MenuCategory {
  id: string;
  key: string;                    // "man","rau","canh","com","traicay","trangmieng"
  label: string;
  hideLabel?: boolean;
  defaultValue?: string;
  balanceByIngredient?: boolean;  // opt-in; default off
  maxPerTypePerWeek?: number;     // default 2 when balancing
}
export interface MenuPeriod { id: string; label: string; categories: MenuCategory[] }
export interface MenuTemplate { days: string[]; periods: MenuPeriod[] }
export interface MenuWeek {
  id: string;
  title: string;
  month?: number;
  weekNo?: number;
  cells: Record<string, string>; // key = `${categoryId}:${dayIndex}`
}
export interface MenuStyle {
  headerColor: string;
  headerTextColor: string;
  title: FontSpec;
  cell: FontSpec;
  border: { width: number; color: string };
  zebra: boolean;
  paperSize: 'A4' | 'A5' | 'Letter';
  orientation: 'portrait' | 'landscape';
}
export interface MenuDoc {
  version: number;
  projectName: string;
  projectIcon: string;
  template: MenuTemplate;
  weeks: MenuWeek[];
  settings: MenuStyle;
  editLog?: EditLogEntry[];
}

let _n = 0;
export function uid(prefix = 'm'): string {
  _n += 1;
  const r = Math.abs(Math.floor((performance.now() * 1000) % 1e9)).toString(36);
  return `${prefix}_${_n.toString(36)}${r}`;
}
export function cellKey(categoryId: string, dayIndex: number): string { return `${categoryId}:${dayIndex}`; }

export const DEFAULT_TEMPLATE: MenuTemplate = {
  days: ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6'],
  periods: [
    { id: 'p_trua', label: 'Trưa', categories: [
      { id: 'c_man',  key: 'man',  label: 'Món mặn', balanceByIngredient: true, maxPerTypePerWeek: 2 },
      { id: 'c_rau',  key: 'rau',  label: 'Món rau' },
      { id: 'c_canh', key: 'canh', label: 'Món canh' },
      { id: 'c_com',  key: 'com',  label: 'Món cơm', defaultValue: 'Cơm trắng' },
    ] },
    { id: 'p_xe', label: 'Xế', categories: [
      { id: 'c_traicay',   key: 'traicay',   label: 'Trái cây' },
      { id: 'c_trangmieng', key: 'trangmieng', label: 'Tráng miệng', hideLabel: true },
    ] },
  ],
};

export const DEFAULT_MENU_STYLE: MenuStyle = {
  headerColor: '#84b063',
  headerTextColor: '#1f3d0c',
  title: { family: 'Lexend', size: 20, weight: 700, color: '#1f3d0c' },
  cell: { family: 'Lexend', size: 13, weight: 400, color: '#1a1a1a' },
  border: { width: 1, color: '#4b7031' },
  zebra: false,
  paperSize: 'A4',
  orientation: 'landscape',
};

export function newMenuDoc(): MenuDoc {
  return {
    version: 1, projectName: 'Untitled', projectIcon: '🍱',
    template: structuredClone(DEFAULT_TEMPLATE),
    weeks: [],
    settings: structuredClone(DEFAULT_MENU_STYLE),
    editLog: [],
  };
}

export function serializeMenuDoc(d: MenuDoc): string { return JSON.stringify(d, null, 2) + '\n'; }

function sanitizeCat(c: any): MenuCategory {
  return {
    id: c?.id || uid('c'),
    key: typeof c?.key === 'string' ? c.key : '',
    label: typeof c?.label === 'string' ? c.label : '',
    ...(c?.hideLabel !== undefined ? { hideLabel: !!c.hideLabel } : {}),
    ...(typeof c?.defaultValue === 'string' ? { defaultValue: c.defaultValue } : {}),
    ...(c?.balanceByIngredient !== undefined ? { balanceByIngredient: !!c.balanceByIngredient } : {}),
    ...(typeof c?.maxPerTypePerWeek === 'number' ? { maxPerTypePerWeek: c.maxPerTypePerWeek } : {}),
  };
}

export function parseMenuDoc(text: string): MenuDoc {
  const raw = JSON.parse(text) as any;
  const base = newMenuDoc();
  const t = raw?.template && typeof raw.template === 'object' ? raw.template : base.template;
  const template: MenuTemplate = {
    days: Array.isArray(t.days) && t.days.length ? t.days.map(String) : base.template.days,
    periods: Array.isArray(t.periods) && t.periods.length
      ? t.periods.map((p: any) => ({
          id: p?.id || uid('p'),
          label: typeof p?.label === 'string' ? p.label : 'Buổi',
          categories: Array.isArray(p?.categories) ? p.categories.map(sanitizeCat) : [],
        }))
      : base.template.periods,
  };
  const s = raw?.settings || {};
  const settings: MenuStyle = {
    ...base.settings, ...s,
    title: { ...base.settings.title, ...(s.title || {}) },
    cell: { ...base.settings.cell, ...(s.cell || {}) },
    border: { ...base.settings.border, ...(s.border || {}) },
  };
  const weeks: MenuWeek[] = (Array.isArray(raw?.weeks) ? raw.weeks : []).map((w: any) => ({
    id: w?.id || uid('w'),
    title: typeof w?.title === 'string' ? w.title : 'Tuần',
    month: typeof w?.month === 'number' ? w.month : undefined,
    weekNo: typeof w?.weekNo === 'number' ? w.weekNo : undefined,
    cells: w?.cells && typeof w.cells === 'object' ? w.cells : {},
  }));
  return {
    version: typeof raw?.version === 'number' ? raw.version : 1,
    projectName: raw?.projectName ?? base.projectName,
    projectIcon: raw?.projectIcon ?? base.projectIcon,
    template, weeks, settings,
    editLog: Array.isArray(raw?.editLog)
      ? raw.editLog.filter((e: any) => e && typeof e.by === 'string' && typeof e.at === 'string')
      : [],
  };
}

export function looksLikeMenu(text: string): boolean {
  try {
    const o = JSON.parse(text);
    if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
    return !!o.template && Array.isArray(o.template.periods) && Array.isArray(o.weeks);
  } catch { return false; }
}
