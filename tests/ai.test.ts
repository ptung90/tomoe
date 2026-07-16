import { describe, it, expect } from 'vitest';
import type { Schema } from '../src/lib/modules/flashcards/model';
import { buildRecordsPrompt, parseGeneratedRecords, extractText, generateRecords } from '../src/lib/modules/flashcards/lib/ai';

const schema: Schema = {
  id: 's1', name: 'Verbs', cardTemplates: [],
  fields: [
    { id: 'f1', key: 'word', label: 'Word', type: 'text', multilingual: true },
    { id: 'f2', key: 'note', label: 'Note', type: 'text', multilingual: false },
    { id: 'f3', key: 'pic', label: 'Pic', type: 'image' },
  ],
};

describe('buildRecordsPrompt', () => {
  it('includes field keys, count, and the instruction', () => {
    const { system, user } = buildRecordsPrompt(schema, 'common verbs', 5, ['en', 'vi']);
    expect(system).toContain('word');
    expect(system).toContain('note');
    expect(system).toContain('en');
    expect(user).toContain('common verbs');
    expect(user).toContain('5');
  });
  it('resolves a multilingual field label to the first locale for the prompt', () => {
    const s: Schema = { id: 's1', name: 'Verbs', cardTemplates: [], fields: [
      { id: 'f1', key: 'word', label: { en: 'Word', vi: 'Từ' }, type: 'text', multilingual: true },
    ] };
    const { system } = buildRecordsPrompt(s, 'x', 1, ['en', 'vi']);
    expect(system).toContain('(Word)');
  });
  it('falls back to the key when every locale of a multilingual label is blank', () => {
    const s: Schema = { id: 's1', name: 'Verbs', cardTemplates: [], fields: [
      { id: 'f1', key: 'word', label: { en: '', vi: '' }, type: 'text', multilingual: true },
    ] };
    const { system } = buildRecordsPrompt(s, 'x', 1, ['en', 'vi']);
    expect(system).toContain('(word)');
  });
});

describe('parseGeneratedRecords', () => {
  it('parses a plain JSON array into loose records (unknown keys dropped)', () => {
    const raw = '[{"word":{"en":"go","vi":"đi"},"note":"v","pic":"","extra":"x"}]';
    const recs = parseGeneratedRecords(raw, schema);
    expect(recs).toHaveLength(1);
    expect(recs[0].schemaId).toBe('s1');
    expect(recs[0].fields).toEqual({ word: { en: 'go', vi: 'đi' }, note: 'v', pic: '' });
    expect((recs[0].fields as Record<string, unknown>).extra).toBeUndefined();
  });
  it('tolerates a ```json fenced block', () => {
    const raw = 'Here you go:\n```json\n[{"word":"run"}]\n```\nDone.';
    expect(parseGeneratedRecords(raw, schema)).toHaveLength(1);
  });
  it('throws on non-JSON / non-array', () => {
    expect(() => parseGeneratedRecords('sorry, no', schema)).toThrow();
    expect(() => parseGeneratedRecords('{"word":"x"}', schema)).toThrow();
  });
});

describe('extractText', () => {
  it('concatenates text blocks, ignores others', () => {
    expect(extractText([{ type: 'text', text: 'a' }, { type: 'thinking' }, { type: 'text', text: 'b' }])).toBe('ab');
  });
});

describe('generateRecords', () => {
  it('calls the injected factory and returns parsed records (no network)', async () => {
    let seen: any = null;
    const fakeFactory = (apiKey: string) => ({
      messages: {
        create: async (body: any) => { seen = { apiKey, body }; return { content: [{ type: 'text', text: '[{"word":{"en":"go","vi":"đi"},"note":"v"}]' }] }; },
      },
    });
    const recs = await generateRecords(
      { apiKey: 'sk-test', model: 'claude-opus-4-8' }, schema, 'verbs', 3, ['en', 'vi'], fakeFactory,
    );
    expect(seen.apiKey).toBe('sk-test');
    expect(seen.body.model).toBe('claude-opus-4-8');
    expect(recs).toHaveLength(1);
    expect(recs[0].fields.word).toEqual({ en: 'go', vi: 'đi' });
  });
});
