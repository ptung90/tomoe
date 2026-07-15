export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 4;

/** Clamp a zoom factor into the allowed range; NaN → min, ±Infinity clamp to max/min. Pure. */
export function clampZoom(v: number, min = ZOOM_MIN, max = ZOOM_MAX): number {
  if (Number.isNaN(v)) return min;
  return Math.min(max, Math.max(min, v));
}

/** Multiplicative wheel step: scroll up (deltaY < 0) zooms in, down zooms out. Clamped. Pure. */
export function zoomStep(current: number, deltaY: number, factor = 1.1): number {
  const next = deltaY < 0 ? current * factor : current / factor;
  return clampZoom(next);
}
