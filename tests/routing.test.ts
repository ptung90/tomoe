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
});
