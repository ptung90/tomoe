import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/lib/modules/flashcards/model';
import { settingsToPreset } from '../src/lib/modules/flashcards/lib/stylePreset';
import { serializeStylePreset, parseStylePreset, looksLikeStylePresetFile, mergePresetOverDefaults } from '../src/lib/modules/flashcards/io/stylePresetIO';

describe('stylePresetIO', () => {
  const preset = settingsToPreset(DEFAULT_SETTINGS);
  it('serialize → parse round-trips (name + preset), ends with newline', () => {
    const text = serializeStylePreset('Warm', preset);
    expect(text.endsWith('\n')).toBe(true);
    const back = parseStylePreset(text);
    expect(back.name).toBe('Warm');
    expect(back.preset).toEqual(preset);
  });
  it('parse rejects a file without the marker', () => {
    expect(() => parseStylePreset('{"foo":1}')).toThrow('Not a valid Tomoe style preset file');
    expect(() => parseStylePreset('not json')).toThrow();
  });
  it('looksLikeStylePresetFile gates on the marker', () => {
    expect(looksLikeStylePresetFile(serializeStylePreset('X', preset))).toBe(true);
    expect(looksLikeStylePresetFile('{"tomoeSchema":1}')).toBe(false);
  });
  it('mergePresetOverDefaults fills newly-added keys for an old partial preset', () => {
    const partial = { margin: 30 } as never;
    const merged = mergePresetOverDefaults(partial);
    expect(merged.margin).toBe(30);
    expect(merged.titleFont?.family).toBe(DEFAULT_SETTINGS.titleFont.family);
    expect(merged.image?.borderRadius).toBe(DEFAULT_SETTINGS.image.borderRadius);
  });
});
