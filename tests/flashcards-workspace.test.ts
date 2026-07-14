import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Workspace from '../src/lib/modules/flashcards/Workspace.svelte';
import * as S from '../src/lib/modules/flashcards/stores';

vi.mock('@tauri-apps/plugin-dialog', () => ({ confirm: vi.fn(async () => true) }));

beforeEach(() => {
  S.initProject();
  const sid = S.addSchema('Words');
  S.updateSchema(sid, { fields: [{ id: 'f1', key: 'title', label: 'Title', type: 'text', multilingual: true }] });
  S.addRecord(sid);
});

describe('Flashcards Workspace', () => {
  it('renders the left list and the detail form together', () => {
    render(Workspace);
    expect(screen.getByText('Words')).toBeInTheDocument();       // left pane schema
    expect(screen.getByText('Title')).toBeInTheDocument();       // right pane field (record auto-selected)
  });
  it('shows the project name in the header', () => {
    render(Workspace);
    expect(screen.getByText('Untitled')).toBeInTheDocument();
  });
});
