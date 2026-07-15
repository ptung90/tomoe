import type { Settings, StyleOverrides } from '../model';

/** Merge partial style layers over a full Settings base (later layers win), per property.
 *  Nested border/image/titleFont/contentFont merge field-by-field; scalars replace. Pure; base untouched. */
export function resolveStyle(base: Settings, ...layers: (StyleOverrides | undefined)[]): Settings {
  let out: Settings = {
    ...base,
    border: { ...base.border }, image: { ...base.image },
    titleFont: { ...base.titleFont }, contentFont: { ...base.contentFont },
  };
  for (const l of layers) {
    if (!l) continue;
    out = {
      ...out,
      ...(l.margin !== undefined ? { margin: l.margin } : {}),
      ...(l.padding !== undefined ? { padding: l.padding } : {}),
      ...(l.imgPadding !== undefined ? { imgPadding: l.imgPadding } : {}),
      ...(l.textVAlign !== undefined ? { textVAlign: l.textVAlign } : {}),
      ...(l.paperSize !== undefined ? { paperSize: l.paperSize } : {}),
      ...(l.orientation !== undefined ? { orientation: l.orientation } : {}),
      border: { ...out.border, ...(l.border ?? {}) },
      image: { ...out.image, ...(l.image ?? {}) },
      titleFont: { ...out.titleFont, ...(l.titleFont ?? {}) },
      contentFont: { ...out.contentFont, ...(l.contentFont ?? {}) },
    };
  }
  return out;
}
