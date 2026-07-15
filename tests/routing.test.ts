import { describe, it, expect } from 'vitest';
import { pickModuleForOpen } from '../src/lib/modules/registry';

describe('open routing', () => {
  it('.tomoe.json → flashcards', () => {
    expect(pickModuleForOpen('/a.tomoe.json', '{}').id).toBe('flashcards');
  });
  it('.json with schemas+cards → flashcards (sniff)', () => {
    expect(pickModuleForOpen('/a.json', JSON.stringify({ schemas: [], cards: [{}] })).id).toBe('flashcards');
  });
  it('plain .json object → json-table', () => {
    expect(pickModuleForOpen('/a.json', '{"foo":1}').id).toBe('json-table');
  });
  it('invalid JSON → json-table (fallback)', () => {
    expect(pickModuleForOpen('/a.json', 'not json').id).toBe('json-table');
  });

  // Legacy flashcard-creator exports carry .json and route by content sniff.
  it('legacy .json with project_name/project_icon → flashcards', () => {
    expect(pickModuleForOpen('/old.json', JSON.stringify({ version: '1.0', project_name: 'Verbs', project_icon: '🐟', settings: {}, cards: [] })).id).toBe('flashcards');
  });
  it('legacy .json single-schema (schema object + records) → flashcards', () => {
    expect(pickModuleForOpen('/old.json', JSON.stringify({ schema: { id: 's', fields: [] }, records: [{ fields: {} }] })).id).toBe('flashcards');
  });
  it('.json with schemas + records arrays → flashcards', () => {
    expect(pickModuleForOpen('/old.json', JSON.stringify({ schemas: [], records: [] })).id).toBe('flashcards');
  });
});
