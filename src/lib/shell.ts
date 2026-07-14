import { writable, type Writable } from 'svelte/store';
import { loadTheme, type Theme } from './theme';

export const toast: Writable<{ message: string; kind: 'success' | 'error' } | null> = writable(null);
let _t: ReturnType<typeof setTimeout> | undefined;
export function showToast(message: string, kind: 'success' | 'error' = 'success'): void {
  toast.set({ message, kind }); if (_t) clearTimeout(_t); _t = setTimeout(() => toast.set(null), 2500);
}

// null = start screen; otherwise the id of the TomoeModule currently mounted.
export const activeModuleId: Writable<string | null> = writable(null);
export function setActiveModule(id: string | null): void { activeModuleId.set(id); }

export const theme: Writable<Theme> = writable(loadTheme());
export const configOpen: Writable<boolean> = writable(false);
