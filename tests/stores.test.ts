import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import {
  data, filePath, dirty, selectedPath, canUndo, canRedo,
  loadDocument, editValue, addItem, removeItem, undo, redo, select, markSaved,
} from '../src/lib/stores';

beforeEach(() => { loadDocument({ words: ['a'] }, '/tmp/x.json'); });

describe('stores', () => {
  it('loadDocument sets data, path, clears dirty and selection', () => {
    expect(get(data)).toEqual({ words: ['a'] });
    expect(get(filePath)).toBe('/tmp/x.json');
    expect(get(dirty)).toBe(false);
    expect(get(selectedPath)).toEqual([]);
    expect(get(canUndo)).toBe(false);
  });
  it('editValue updates immutably and sets dirty', () => {
    editValue(['words', 0], 'z');
    expect(get(data)).toEqual({ words: ['z'] });
    expect(get(dirty)).toBe(true);
    expect(get(canUndo)).toBe(true);
  });
  it('addItem / removeItem work through history', () => {
    addItem(['words']);
    expect(get(data)).toEqual({ words: ['a', ''] });
    removeItem(['words'], 0);
    expect(get(data)).toEqual({ words: [''] });
  });
  it('undo restores previous, redo re-applies', () => {
    editValue(['words', 0], 'z');
    undo();
    expect(get(data)).toEqual({ words: ['a'] });
    redo();
    expect(get(data)).toEqual({ words: ['z'] });
  });
  it('undo clamps a now-invalid selection to an existing ancestor', () => {
    addItem(['words']);          // words -> ['a','']
    select(['words', 1]);        // select the new item
    undo();                      // words -> ['a']; index 1 gone
    expect(get(selectedPath)).toEqual(['words']);
  });
  it('markSaved clears dirty', () => {
    editValue(['words', 0], 'z');
    markSaved('/tmp/x.json');
    expect(get(dirty)).toBe(false);
  });
  it('canRedo is false until an undo happens', () => {
    editValue(['words', 0], 'z');
    expect(get(canRedo)).toBe(false);
    undo();
    expect(get(canRedo)).toBe(true);
  });
});
