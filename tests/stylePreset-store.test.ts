import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import * as S from '../src/lib/modules/flashcards/stores';
import { settingsToPreset } from '../src/lib/modules/flashcards/lib/stylePreset';

beforeEach(() => { localStorage.clear(); S.initProject(); });

describe('style preset library store', () => {
  it('save/rename/delete round-trips through localStorage', () => {
    const id = S.saveStylePreset('Warm');
    expect(get(S.stylePresetLibrary).map((e) => e.name)).toEqual(['Warm']);
    S.renameStylePreset(id, 'Cool');
    expect(get(S.stylePresetLibrary)[0].name).toBe('Cool');
    S.deleteStylePreset(id);
    expect(get(S.stylePresetLibrary)).toEqual([]);
  });
  it('saveStylePreset captures the current Global style', () => {
    S.setSettings({ margin: 33 });
    S.saveStylePreset('Base');
    expect(get(S.stylePresetLibrary)[0].preset.margin).toBe(33);
  });
  it('updateStylePreset overwrites an existing preset with the current Global style (keeps id/name)', () => {
    S.setSettings({ margin: 5 });
    const id = S.saveStylePreset('P');
    S.setSettings({ margin: 40 });
    S.updateStylePreset(id);
    const entry = get(S.stylePresetLibrary).find((e) => e.id === id)!;
    expect(entry.name).toBe('P');
    expect(entry.preset.margin).toBe(40);
  });
});

describe('applyStylePreset', () => {
  function schemaWithViewStyle() {
    const sid = S.addSchema('Cards');
    S.updateSchema(sid, { fields: [{ id: 'f1', key: 'title', label: 'Title', type: 'text', multilingual: true }] });
    // view override: a preset key (titleFont) + a non-preset key (border)
    S.setTemplateStyle(sid, { titleFont: { size: 99 }, border: { width: 7 } });
    return sid;
  }

  it('writes Global; syncViews strips preset keys from view overrides (keeps border)', () => {
    schemaWithViewStyle();
    const preset = { ...settingsToPreset(get(S.project).settings), margin: 40 };
    S.applyStylePreset(preset, { syncViews: true, clearCards: true });
    const p = get(S.project);
    expect(p.settings.margin).toBe(40);
    const vstyle = p.schemas[0].cardTemplates[0].style;
    expect(vstyle?.titleFont).toBeUndefined();       // preset key stripped from view
    expect(vstyle?.border).toEqual({ width: 7 });    // border override kept
  });

  it('with both flags off, only Global changes (view override intact)', () => {
    schemaWithViewStyle();
    const preset = { ...settingsToPreset(get(S.project).settings), margin: 40 };
    S.applyStylePreset(preset, { syncViews: false, clearCards: false });
    const p = get(S.project);
    expect(p.settings.margin).toBe(40);
    expect(p.schemas[0].cardTemplates[0].style?.titleFont).toEqual({ size: 99 });
  });
});
