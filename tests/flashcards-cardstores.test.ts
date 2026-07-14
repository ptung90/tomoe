import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import * as S from '../src/lib/modules/flashcards/stores';

beforeEach(() => { S.initProject(); });

describe('card stores', () => {
  it('setSettings commits a deep-merged, undoable settings change', () => {
    S.setSettings({ paperSize: 'A4' });
    expect(get(S.project).settings.paperSize).toBe('A4');
    expect(get(S.dirty)).toBe(true);
    S.undo();
    expect(get(S.project).settings.paperSize).not.toBe('A4');
  });
  it('setTemplateLayout creates and patches the schema template', () => {
    const sid = S.addSchema('Words');
    S.setTemplateLayout(sid, { layout: '2x2' });
    expect(get(S.project).schemas[0].cardTemplates[0].layout).toBe('2x2');
  });
});
