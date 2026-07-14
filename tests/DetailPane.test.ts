import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/svelte';
import DetailPane from '../src/lib/modules/json-table/components/DetailPane.svelte';
import { loadDocument, select, setTwoLevel, setEditorTab } from '../src/lib/modules/json-table/stores';

// Keep every test starting from a known mode/tab state.
beforeEach(() => { setTwoLevel(false); setEditorTab('form'); });

describe('DetailPane', () => {
  beforeEach(() => { loadDocument({ words: ['cat'], meta: { v: 1 } }, null); setTwoLevel(false); setEditorTab('form'); });

  it('renders chips for a selected scalar array', () => {
    select(['words']);
    render(DetailPane);
    expect(screen.getByDisplayValue('cat')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add/i })).toBeInTheDocument();
  });
  it('renders an object form at root', () => {
    select([]);
    render(DetailPane);
    expect(screen.getByText('words')).toBeInTheDocument();
    expect(screen.getByText('meta')).toBeInTheDocument();
  });
});

describe('DetailPane — two-level mode', () => {
  it('shows two columns for an object with containers when enabled', () => {
    loadDocument({ keySound: 'ai', cards: [{ grapheme: 'gg' }] }, null);
    select([]);
    setTwoLevel(true);
    render(DetailPane);
    expect(screen.getByDisplayValue('ai')).toBeInTheDocument();                    // left scalar
    expect(screen.getByRole('columnheader', { name: 'grapheme' })).toBeInTheDocument(); // right auto-opened table
    setTwoLevel(false);
  });
  it('stays single view for an all-scalar object even when enabled', () => {
    loadDocument({ a: '1', b: '2' }, null);
    select([]);
    setTwoLevel(true);
    render(DetailPane);
    expect(screen.queryByText('Select a field on the left.')).not.toBeInTheDocument();
    setTwoLevel(false);
  });
  it('shows parent-context two columns when an array (with object parent) is selected', () => {
    loadDocument({ folder: { keySound: 'ai', words: ['p', 'q'] } }, null);
    select(['folder', 'words']);         // an array whose parent (folder) is an object
    setTwoLevel(true);
    render(DetailPane);
    expect(screen.getByDisplayValue('ai')).toBeInTheDocument();  // parent field on the left
    expect(screen.getByDisplayValue('p')).toBeInTheDocument();   // the array on the right
    setTwoLevel(false);
  });
});

describe('DetailPane — text tab', () => {
  it('renders the raw text editor on the Text tab', async () => {
    loadDocument({ a: 1, b: 2 }, null);
    select([]);
    render(DetailPane);
    await fireEvent.click(screen.getByRole('button', { name: 'Text' }));
    const ta = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(ta.value).toContain('"a": 1');
    setEditorTab('form');
  });
});
