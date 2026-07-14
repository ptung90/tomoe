import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/svelte';
import { get } from 'svelte/store';
import LeafEditor from '../src/lib/editors/LeafEditor.svelte';
import { data, loadDocument } from '../src/lib/stores';

beforeEach(() => loadDocument({ s: 'hi', n: 3, b: false }, null));

describe('LeafEditor', () => {
  it('edits string', async () => {
    render(LeafEditor, { value: 'hi', path: ['s'] });
    await fireEvent.input(screen.getByDisplayValue('hi'), { target: { value: 'bye' } });
    expect((get(data) as any).s).toBe('bye');
  });
  it('edits number as number', async () => {
    render(LeafEditor, { value: 3, path: ['n'] });
    await fireEvent.input(screen.getByDisplayValue('3'), { target: { value: '7' } });
    expect((get(data) as any).n).toBe(7);
  });
  it('toggles boolean', async () => {
    render(LeafEditor, { value: false, path: ['b'] });
    await fireEvent.click(screen.getByRole('checkbox'));
    expect((get(data) as any).b).toBe(true);
  });
  it('uses a textarea for long strings and still edits', async () => {
    const long = 'x'.repeat(80);
    loadDocument({ s: long }, null);
    render(LeafEditor, { value: long, path: ['s'] });
    const ta = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(ta.tagName).toBe('TEXTAREA');
    await fireEvent.input(ta, { target: { value: 'shorter' } });
    expect((get(data) as any).s).toBe('shorter');
  });
  it('stays single-line in compact mode even for long strings', () => {
    const long = 'y'.repeat(80);
    loadDocument({ s: long }, null);
    render(LeafEditor, { value: long, path: ['s'], compact: true });
    expect((screen.getByRole('textbox') as HTMLElement).tagName).toBe('INPUT');
  });
});
