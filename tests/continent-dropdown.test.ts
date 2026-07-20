import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { render, fireEvent, screen } from '@testing-library/svelte';
import Workspace from '../src/lib/modules/flashcards/Workspace.svelte';
import * as S from '../src/lib/modules/flashcards/stores';

beforeEach(() => { S.initProject(); });

describe('continent dropdown', () => {
  it('selecting a continent sets project.category', async () => {
    render(Workspace);
    await fireEvent.change(screen.getByLabelText('Continent'), { target: { value: 'europe' } });
    expect(get(S.project).category).toBe('europe');
  });
  it('selecting "no continent" clears the category', async () => {
    S.setProjectCategory('europe');
    render(Workspace);
    await fireEvent.change(screen.getByLabelText('Continent'), { target: { value: '' } });
    expect(get(S.project).category).toBeUndefined();
  });
});
