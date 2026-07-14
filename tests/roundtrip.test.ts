import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  updateAtPath, addArrayItem, removeArrayItem, getAtPath,
} from '../src/lib/jsonModel';

const raw = readFileSync(
  resolve(process.cwd(), 'tests/fixtures/reading-folders-data.json'),
  'utf-8');

const stringify = (v: unknown) => JSON.stringify(v, null, 2);

describe('round-trip integrity on real reading-folders data', () => {
  it('parse -> stringify is byte-identical (ignoring trailing newline)', () => {
    const model = JSON.parse(raw);
    expect(stringify(model)).toBe(raw.replace(/\n$/, ''));
  });

  it('editing one word preserves overall key order and structure', () => {
    const model = JSON.parse(raw);
    // folders[0].cards[0].words[0] -> change first word
    const path = ['folders', 0, 'cards', 0, 'words', 0];
    const original = getAtPath(model, path);
    expect(typeof original).toBe('string');
    const edited = updateAtPath(model, path, 'CHANGED');
    expect(getAtPath(edited, path)).toBe('CHANGED');
    // Root key order unchanged.
    expect(Object.keys(edited as object)).toEqual(Object.keys(model));
    // Only the one leaf differs — re-stringify parses back cleanly.
    expect(() => JSON.parse(stringify(edited))).not.toThrow();
  });

  it('adding and removing a word in a card round-trips to valid JSON', () => {
    const model = JSON.parse(raw);
    const wordsPath = ['folders', 0, 'cards', 0, 'words'];
    const before = (getAtPath(model, wordsPath) as string[]).length;
    const added = addArrayItem(model, wordsPath);
    expect((getAtPath(added, wordsPath) as string[]).length).toBe(before + 1);
    const removed = removeArrayItem(added, wordsPath, before);
    expect((getAtPath(removed, wordsPath) as string[]).length).toBe(before);
    expect(stringify(removed)).toBe(stringify(model));
  });
});
