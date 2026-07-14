import '@testing-library/jest-dom/vitest';

// jsdom does not implement Element.animate; Svelte transitions (e.g. Toast.svelte's
// `transition:fly`) call it directly, producing unhandled errors during tests.
if (!Element.prototype.animate) {
  Element.prototype.animate = () => ({
    cancel() {},
    finished: Promise.resolve(),
    onfinish: null,
  } as unknown as Animation);
}

// jsdom does not implement ResizeObserver; Svelte's `bind:clientWidth`/`clientHeight`
// (e.g. CardPreview.svelte's scale-to-fit pane) use it to track element size.
globalThis.ResizeObserver ??= class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;
