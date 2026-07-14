import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

vi.mock('../src/lib/modules/flashcards/lib/ai', async (orig) => {
  const actual = await orig<typeof import('../src/lib/modules/flashcards/lib/ai')>();
  return { ...actual, generateRecords: vi.fn(async () => [
    { id: '', schemaId: 'x', fieldsHash: '', fields: { word: { en: 'go', vi: '' } } },
    { id: '', schemaId: 'x', fieldsHash: '', fields: { word: { en: 'run', vi: '' } } },
  ]) };
});

import * as S from '../src/lib/modules/flashcards/stores';

beforeEach(() => {
  localStorage.clear();
  S.initProject();
});

describe('aiConfig', () => {
  it('setAiConfig persists to localStorage and updates the store', () => {
    S.setAiConfig({ apiKey: 'sk-1', model: 'claude-opus-4-8' });
    expect(get(S.aiConfig).apiKey).toBe('sk-1');
    expect(localStorage.getItem('tomoe.ai.apiKey')).toBe('sk-1');
  });
});

describe('aiGenerateRecords', () => {
  it('appends the generated records to the schema and returns the count', async () => {
    const sid = S.addSchema('Verbs');
    S.updateSchema(sid, { fields: [{ id: 'f1', key: 'word', label: 'Word', type: 'text', multilingual: true }] });
    const before = get(S.project).records.length;
    const n = await S.aiGenerateRecords(sid, 'verbs', 2);
    expect(n).toBe(2);
    expect(get(S.project).records.length).toBe(before + 2);
    expect(get(S.project).records.every((r) => r.schemaId === sid)).toBe(true);
  });
});
