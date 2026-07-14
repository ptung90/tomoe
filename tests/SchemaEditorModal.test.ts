import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { render, fireEvent, screen } from '@testing-library/svelte';
import SchemaEditorModal from '../src/lib/modules/flashcards/components/SchemaEditorModal.svelte';
import * as S from '../src/lib/modules/flashcards/stores';

vi.mock('@tauri-apps/plugin-dialog', () => ({ confirm: vi.fn(async () => true) }));

beforeEach(() => { S.initProject(); });

describe('SchemaEditorModal', () => {
  it('renders nothing when closed', () => {
    render(SchemaEditorModal);
    expect(screen.queryByText(/schema name/i)).not.toBeInTheDocument();
  });
  it('creates a new schema with a field on save', async () => {
    render(SchemaEditorModal);
    S.schemaEditorOpen.set('__new__');
    await screen.findByText(/schema name/i);
    await fireEvent.input(screen.getByLabelText(/schema name/i), { target: { value: 'Verbs' } });
    await fireEvent.click(screen.getByRole('button', { name: /add field/i }));
    const keyInput = screen.getByLabelText(/field key/i);
    await fireEvent.input(keyInput, { target: { value: 'title' } });
    await fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    const schemas = get(S.project).schemas;
    expect(schemas).toHaveLength(1);
    expect(schemas[0].name).toBe('Verbs');
    expect(schemas[0].fields[0].key).toBe('title');
    expect(get(S.schemaEditorOpen)).toBeNull();
  });
});
