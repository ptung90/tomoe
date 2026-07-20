import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/svelte';
import { get } from 'svelte/store';
import Workspace from '../src/lib/modules/menu/Workspace.svelte';
import * as S from '../src/lib/modules/menu/stores';
import * as B2 from '../src/lib/modules/menu/dishBank';

beforeEach(() => S.initDoc());

describe('MenuWorkspace', () => {
  it('shows an empty state and can add a week', async () => {
    render(Workspace);
    await fireEvent.click(screen.getByRole('button', { name: /thêm tuần/i }));
    expect(get(S.doc).weeks.length).toBe(1);
  });
  it('renders the week table with day headers once a week exists', async () => {
    S.addWeek();
    render(Workspace);
    expect(await screen.findByText('Thứ 2')).toBeInTheDocument();
  });
  it('closes the template editor on Escape once it has focus', async () => {
    render(Workspace);
    await fireEvent.click(screen.getByRole('button', { name: /cấu trúc/i }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveFocus();
    await fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(get(S.templateEditorOpen)).toBe(false);
  });
});

describe('MenuWorkspace fill', () => {
  beforeEach(() => { S.initDoc(); localStorage.clear(); });
  it('"Tự bốc cả tuần (đè)" fills default cells', async () => {
    S.addWeek();
    render(Workspace);
    await fireEvent.click(screen.getByRole('button', { name: /bốc đè/i }));
    const com = get(S.doc).template.periods[0].categories.find((c) => c.id === 'c_com')!;
    expect(get(S.doc).weeks[0].cells[`${com.id}:0`]).toBe('Cơm trắng');
  });
});
