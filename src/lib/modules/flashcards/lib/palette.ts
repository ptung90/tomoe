// Montessori continent color code, deepened for legible thin borders on a white card.
// Used as quick presets in the color pickers (see ColorField).
export interface ContinentColor { key: string; en: string; vi: string; hex: string }

export const CONTINENT_COLORS: ContinentColor[] = [
  { key: 'northAmerica', en: 'North America', vi: 'Bắc Mỹ',          hex: '#D9600F' },
  { key: 'southAmerica', en: 'South America', vi: 'Nam Mỹ',          hex: '#E0619B' },
  { key: 'europe',       en: 'Europe',        vi: 'Châu Âu',         hex: '#E00000' },
  { key: 'africa',       en: 'Africa',        vi: 'Châu Phi',        hex: '#1E7A45' },
  { key: 'asia',         en: 'Asia',          vi: 'Châu Á',          hex: '#E0A400' },
  { key: 'oceania',      en: 'Oceania',       vi: 'Châu Đại Dương',  hex: '#7A4A22' },
  { key: 'antarctica',   en: 'Antarctica',    vi: 'Nam Cực',         hex: '#2E86C1' },
];

/** The continent whose hex equals `color` (case-insensitive), or null when it's a custom color. */
export function continentForColor(color: string): ContinentColor | null {
  const c = (color || '').toLowerCase();
  return CONTINENT_COLORS.find((x) => x.hex.toLowerCase() === c) ?? null;
}
