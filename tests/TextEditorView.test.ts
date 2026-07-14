import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/svelte';
import { get } from 'svelte/store';
import TextEditorView from '../src/lib/modules/json-table/components/TextEditorView.svelte';
import { data, loadDocument, select } from '../src/lib/modules/json-table/stores';

beforeEach(() => { loadDocument({ obj: { a: 1 } }, null); select(['obj']); });

describe('TextEditorView', () => {
  it('loads the active node as JSON', () => {
    render(TextEditorView);
    const ta = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(ta.value).toContain('"a": 1');
  });
  it('disables Apply and shows an error for invalid JSON', async () => {
    render(TextEditorView);
    const ta = screen.getByRole('textbox') as HTMLTextAreaElement;
    await fireEvent.input(ta, { target: { value: '{"a":}' } });
    expect((screen.getByRole('button', { name: /apply/i }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/error/i)).toBeInTheDocument();
  });
  it('auto-fixes lenient input into valid JSON', async () => {
    render(TextEditorView);
    const ta = screen.getByRole('textbox') as HTMLTextAreaElement;
    await fireEvent.input(ta, { target: { value: '{a: 1,}' } });
    await fireEvent.click(screen.getByRole('button', { name: /auto-fix/i }));
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toContain('"a": 1');
    expect((screen.getByRole('button', { name: /apply/i }) as HTMLButtonElement).disabled).toBe(false);
  });
  it('Apply commits the parsed value to the node', async () => {
    render(TextEditorView);
    const ta = screen.getByRole('textbox') as HTMLTextAreaElement;
    await fireEvent.input(ta, { target: { value: '{"a": 2}' } });
    await fireEvent.click(screen.getByRole('button', { name: /apply/i }));
    expect((get(data) as any).obj).toEqual({ a: 2 });
  });
});
