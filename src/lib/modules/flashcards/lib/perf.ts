/** Diagnostics for the heavy card operations (pack / save / export). These help pin down the
 *  memory-pressure stalls seen on lower-RAM machines: base64 images are duplicated into every
 *  packed card and re-copied through the export pipeline, so a big project can exhaust the
 *  WebView2 renderer heap mid-session (a fresh restart temporarily clears it). */

type MemoryPerformance = { memory?: { usedJSHeapSize: number } };

/** Rough JS heap usage in whole MB, or null when the runtime doesn't expose it.
 *  `performance.memory` is a Chromium/WebView2 extension — absent in other engines and in tests. */
export function heapMB(): number | null {
  const mem = (performance as unknown as MemoryPerformance).memory;
  return mem ? Math.round(mem.usedJSHeapSize / 1_000_000) : null;
}

/** " · heap N MB" when the heap size is known, else "". For appending to diagnostic toasts. */
export function heapSuffix(): string {
  const mb = heapMB();
  return mb == null ? '' : ` · heap ${mb} MB`;
}

/** Reject with `Error(message())` if `p` does not settle within `ms`; the timer is cleared the
 *  moment `p` settles, so a resolved/rejected promise never triggers the watchdog. The message is
 *  built lazily (only on timeout) so it can sample state — e.g. the current heap — at that instant.
 *  Purpose: turn a silently-hung async step (an out-of-memory canvas render whose backing <img>
 *  never fires onload/onerror) into a visible, actionable failure instead of an infinite spinner. */
export function withTimeout<T>(p: Promise<T>, ms: number, message: () => string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message())), ms);
    p.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}
