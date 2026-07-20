import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/lib/modules/flashcards/model';
import { PRESET_KEYS, settingsToPreset, applyPresetToSettings, stripPresetKeys } from '../src/lib/modules/flashcards/lib/stylePreset';

describe('stylePreset core', () => {
  it('PRESET_KEYS excludes border/paperSize/orientation', () => {
    expect(PRESET_KEYS).not.toContain('border');
    expect(PRESET_KEYS).not.toContain('paperSize');
    expect(PRESET_KEYS).not.toContain('orientation');
    expect(PRESET_KEYS).toEqual(
      expect.arrayContaining(['titleFont', 'contentFont', 'image', 'margin', 'padding', 'imgPadding', 'paraGap', 'textVAlign']),
    );
  });
  it('settingsToPreset captures exactly the preset keys', () => {
    const p = settingsToPreset(DEFAULT_SETTINGS);
    expect(Object.keys(p).sort()).toEqual([...PRESET_KEYS].sort());
    expect(p.titleFont?.family).toBe(DEFAULT_SETTINGS.titleFont.family);
    expect((p as Record<string, unknown>).border).toBeUndefined();
  });
  it('applyPresetToSettings sets preset keys, leaves border/paper untouched, base unmutated', () => {
    const preset = { ...settingsToPreset(DEFAULT_SETTINGS), margin: 25, titleFont: { ...DEFAULT_SETTINGS.titleFont, color: '#123456' } };
    const out = applyPresetToSettings(DEFAULT_SETTINGS, preset);
    expect(out.margin).toBe(25);
    expect(out.titleFont.color).toBe('#123456');
    expect(out.border).toEqual(DEFAULT_SETTINGS.border);
    expect(out.paperSize).toBe(DEFAULT_SETTINGS.paperSize);
    expect(DEFAULT_SETTINGS.margin).not.toBe(25); // base untouched
  });
  it('stripPresetKeys removes preset keys, keeps border, undefined when empty', () => {
    expect(stripPresetKeys({ border: { width: 8 }, margin: 5, titleFont: { size: 20 } })).toEqual({ border: { width: 8 } });
    expect(stripPresetKeys({ margin: 5 })).toBeUndefined();
    expect(stripPresetKeys(undefined)).toBeUndefined();
  });
});
