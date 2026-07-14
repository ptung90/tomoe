import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/svelte';
import { get } from 'svelte/store';
import TwoLevelView from '../src/lib/components/TwoLevelView.svelte';
import { data, loadDocument, select } from '../src/lib/stores';

const doc = () => ({ keySound: 'KS', graphemes: ['ai', 'ay'], cards: [{ grapheme: 'gg' }] });
beforeEach(() => { loadDocument(doc(), null); select([]); });

describe('TwoLevelView', () => {
  it('edits a scalar field on the left', async () => {
    render(TwoLevelView, { value: doc(), path: [] });
    await fireEvent.input(screen.getByDisplayValue('KS'), { target: { value: 'ee' } });
    expect((get(data) as any).keySound).toBe('ee');
  });
  it('auto-opens the first container on the right (graphemes chips)', () => {
    render(TwoLevelView, { value: doc(), path: [] });
    expect(screen.getByDisplayValue('ay')).toBeInTheDocument();
  });
  it('clicking a container opens it on the right', async () => {
    render(TwoLevelView, { value: doc(), path: [] });
    await fireEvent.click(screen.getByRole('button', { name: /open cards/i }));
    expect(screen.getByRole('columnheader', { name: 'grapheme' })).toBeInTheDocument();
  });
});
