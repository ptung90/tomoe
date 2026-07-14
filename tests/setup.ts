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
