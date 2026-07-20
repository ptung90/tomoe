import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/svelte';
import { get } from 'svelte/store';
import Workspace from '../src/lib/modules/menu/Workspace.svelte';
import * as S from '../src/lib/modules/menu/stores';

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
});
