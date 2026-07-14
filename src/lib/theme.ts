export type Theme = 'light' | 'dark' | 'system';
const KEY = 'jte-theme';

export function resolveTheme(t: Theme, prefersDark: boolean): 'light' | 'dark' {
  if (t === 'system') return prefersDark ? 'dark' : 'light';
  return t;
}

export function applyTheme(t: Theme): void {
  const root = document.documentElement;
  if (t === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', t);
  try { localStorage.setItem(KEY, t); } catch { /* ignore */ }
}

export function loadTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch { /* ignore */ }
  return 'system';
}

export function loadBool(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    if (v === 'true') return true;
    if (v === 'false') return false;
  } catch { /* ignore */ }
  return fallback;
}

export function saveBool(key: string, val: boolean): void {
  try { localStorage.setItem(key, String(val)); } catch { /* ignore */ }
}

export function loadStr(key: string, fallback: string): string {
  try { const v = localStorage.getItem(key); return v ?? fallback; } catch { return fallback; }
}
export function saveStr(key: string, val: string): void {
  try { localStorage.setItem(key, val); } catch { /* ignore */ }
}
