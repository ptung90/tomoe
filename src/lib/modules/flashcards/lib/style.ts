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
      ...(l.paraGap !== undefined ? { paraGap: l.paraGap } : {}),
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

/** Deep-merge a StyleOverrides patch onto an (optional) base override object.
 *  Nested border/image/titleFont/contentFont merge field-by-field; scalars replace. Pure; base untouched. */
export function mergeStyle(base: StyleOverrides | undefined, patch: StyleOverrides): StyleOverrides {
  const out: StyleOverrides = { ...base, ...patch };
  if (base?.border || patch.border) out.border = { ...(base?.border ?? {}), ...(patch.border ?? {}) };
  if (base?.image || patch.image) out.image = { ...(base?.image ?? {}), ...(patch.image ?? {}) };
  if (base?.titleFont || patch.titleFont) out.titleFont = { ...(base?.titleFont ?? {}), ...(patch.titleFont ?? {}) };
  if (base?.contentFont || patch.contentFont) out.contentFont = { ...(base?.contentFont ?? {}), ...(patch.contentFont ?? {}) };
  return out;
}
