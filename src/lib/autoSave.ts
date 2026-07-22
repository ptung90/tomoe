import type { Readable } from 'svelte/store';

/** Whether an auto-save should fire now: the feature is enabled, the document has unsaved changes,
 *  AND it's already bound to a file (auto-save never pops a Save dialog for an untitled project). Pure. */
export function shouldAutoSave(enabled: boolean, dirty: boolean, hasPath: boolean): boolean {
  return enabled && dirty && hasPath;
}

export interface AutoSaveDeps {
  enabled: Readable<boolean>;
  dirty: Readable<boolean>;
  filePath: Readable<string | null>;
  save: () => void;
  /** Debounce window after the last change before saving (ms). */
  delay?: number;
}

/** Wire auto-save for one module: whenever it has unsaved changes to a bound file (and the feature
 *  is enabled), save `delay` ms after edits settle. Coalesces rapid edits (debounce) and re-checks
 *  the condition when the timer fires. Returns a cleanup that unsubscribes and cancels any pending
 *  save — call it when the active module changes or the app unmounts. */
export function startAutoSave(deps: AutoSaveDeps): () => void {
  const { enabled, dirty, filePath, save, delay = 2000 } = deps;
  let e = false, d = false, hasPath = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const schedule = () => {
    if (timer) { clearTimeout(timer); timer = undefined; }
    if (!shouldAutoSave(e, d, hasPath)) return;
    timer = setTimeout(() => {
      timer = undefined;
      if (shouldAutoSave(e, d, hasPath)) save();
    }, delay);
  };

  const unsubs = [
    enabled.subscribe((v) => { e = v; schedule(); }),
    dirty.subscribe((v) => { d = v; schedule(); }),
    filePath.subscribe((v) => { hasPath = v !== null && v !== ''; schedule(); }),
  ];

  return () => {
    for (const u of unsubs) u();
    if (timer) { clearTimeout(timer); timer = undefined; }
  };
}
