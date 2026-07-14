import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/svelte';
import { get } from 'svelte/store';
import BigEditor from '../src/lib/modules/json-table/editors/BigEditor.svelte';
import { data, bigEditorPath, loadDocument, openBigEditor, closeBigEditor } from '../src/lib/modules/json-table/stores';

beforeEach(() => { loadDocument({ note: 'hello world' }, null); closeBigEditor(); });

describe('BigEditor', () => {
  it('is hidden until a path is opened', () => {
    render(BigEditor);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('opens with the current value and edits it', async () => {
    openBigEditor(['note']);
    render(BigEditor);
    const ta = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(ta.value).toBe('hello world');
    await fireEvent.input(ta, { target: { value: 'edited long text' } });
    expect((get(data) as any).note).toBe('edited long text');
  });
  it('closes via Done', async () => {
    openBigEditor(['note']);
    render(BigEditor);
    await fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(get(bigEditorPath)).toBe(null);
  });
});
