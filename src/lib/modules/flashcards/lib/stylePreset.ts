import type { Settings, StyleOverrides } from '../model';
import { resolveStyle } from './style';

/** A reusable style bundle: colours/fonts/spacing/image, EXCLUDING border + page geometry
 *  (paperSize/orientation) + layout. A `StylePreset` is applied Global-wide and its keys can be
 *  stripped from per-view / per-card overrides so everything follows it. */
export type StylePreset = Pick<StyleOverrides,
  'titleFont' | 'contentFont' | 'image' | 'margin' | 'padding' | 'imgPadding' | 'paraGap' | 'textVAlign'>;

export const PRESET_KEYS: (keyof StylePreset)[] = [
  'titleFont', 'contentFont', 'image', 'margin', 'padding', 'imgPadding', 'paraGap', 'textVAlign',
];

/** Capture the preset-relevant slice of a full Settings object (nested groups deep-copied). Pure. */
export function settingsToPreset(s: Settings): StylePreset {
  return {
    titleFont: { ...s.titleFont }, contentFont: { ...s.contentFont }, image: { ...s.image },
    margin: s.margin, padding: s.padding, imgPadding: s.imgPadding, paraGap: s.paraGap, textVAlign: s.textVAlign,
  };
}

/** Merge a preset onto settings → new Settings. border/paperSize/orientation stay untouched (a
 *  preset never carries them). Reuses the cascade merge; base is not mutated. Pure. */
export function applyPresetToSettings(s: Settings, preset: StylePreset): Settings {
  return resolveStyle(s, preset);
}

/** Remove every PRESET_KEY from an override; undefined if nothing remains (border/page kept). Pure. */
export function stripPresetKeys(o: StyleOverrides | undefined): StyleOverrides | undefined {
  if (!o) return undefined;
  const rest: StyleOverrides = { ...o };
  for (const k of PRESET_KEYS) delete (rest as Record<string, unknown>)[k];
  return Object.keys(rest).length ? rest : undefined;
}
