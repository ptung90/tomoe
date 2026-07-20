import { DEFAULT_SETTINGS } from '../model';
import { settingsToPreset, type StylePreset } from '../lib/stylePreset';

/** An app-level Style Preset Library entry (localStorage, NOT part of any project document). */
export interface StylePresetEntry { id: string; name: string; addedAt: number; preset: StylePreset }

interface StylePresetFile { tomoeStylePreset: 1; name: string; preset: StylePreset }

/** Merge a (possibly partial / old-build) preset over the default preset so newly-added keys fill
 *  in. Nested image/titleFont/contentFont merge field-by-field (mirrors parseProject's merge). */
export function mergePresetOverDefaults(p: Partial<StylePreset> | null | undefined): StylePreset {
  const base = settingsToPreset(DEFAULT_SETTINGS);
  const src = p ?? {};
  return {
    ...base, ...src,
    image: { ...base.image, ...(src.image ?? {}) },
    titleFont: { ...base.titleFont, ...(src.titleFont ?? {}) },
    contentFont: { ...base.contentFont, ...(src.contentFont ?? {}) },
  };
}

/** Emit a portable `.tomoestyle.json` payload. Deep-cloned; pretty JSON + trailing newline. */
export function serializeStylePreset(name: string, preset: StylePreset): string {
  const out: StylePresetFile = { tomoeStylePreset: 1, name, preset: structuredClone(preset) };
  return JSON.stringify(out, null, 2) + '\n';
}

/** Parse a portable preset file. Throws `Error('Not a valid Tomoe style preset file')` on bad shape.
 *  The preset is merged over defaults for forward-safety (like parseProject). */
export function parseStylePreset(text: string): { name: string; preset: StylePreset } {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error('Not a valid Tomoe style preset file'); }
  const r = raw as { tomoeStylePreset?: unknown; name?: unknown; preset?: unknown };
  if (!r || typeof r !== 'object' || r.tomoeStylePreset !== 1 || !r.preset || typeof r.preset !== 'object') {
    throw new Error('Not a valid Tomoe style preset file');
  }
  return {
    name: typeof r.name === 'string' && r.name ? r.name : 'Preset',
    preset: mergePresetOverDefaults(r.preset as Partial<StylePreset>),
  };
}

/** True only for text that parses as JSON AND carries the `tomoeStylePreset` marker. Never throws. */
export function looksLikeStylePresetFile(text: string): boolean {
  try {
    const raw = JSON.parse(text) as { tomoeStylePreset?: unknown; preset?: unknown };
    return !!raw && typeof raw === 'object' && raw.tomoeStylePreset === 1 && !!raw.preset && typeof raw.preset === 'object';
  } catch { return false; }
}
