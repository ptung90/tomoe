import { writable, type Writable } from 'svelte/store';

export const toast: Writable<{ message: string; kind: 'success' | 'error' } | null> = writable(null);
let _t: ReturnType<typeof setTimeout> | undefined;
export function showToast(message: string, kind: 'success' | 'error' = 'success'): void {
  toast.set({ message, kind }); if (_t) clearTimeout(_t); _t = setTimeout(() => toast.set(null), 2500);
}
