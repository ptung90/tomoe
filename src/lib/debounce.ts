/** Per-key trailing debounce. Calls with the same key coalesce to the last args. */
export function keyedDebounce<A extends unknown[]>(fn: (...a: A) => void, ms: number) {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const pending = new Map<string, A>();
  return {
    call(key: string, ...args: A): void {
      pending.set(key, args);
      const prev = timers.get(key);
      if (prev) clearTimeout(prev);
      timers.set(key, setTimeout(() => {
        timers.delete(key);
        const a = pending.get(key);
        pending.delete(key);
        if (a) fn(...a);
      }, ms));
    },
    flushAll(): void {
      for (const [key, t] of timers) {
        clearTimeout(t);
        const a = pending.get(key);
        if (a) fn(...a);
      }
      timers.clear();
      pending.clear();
    },
  };
}
