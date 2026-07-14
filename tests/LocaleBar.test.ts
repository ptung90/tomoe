import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { render, fireEvent, screen } from '@testing-library/svelte';
import LocaleBar from '../src/lib/modules/flashcards/components/LocaleBar.svelte';
import * as S from '../src/lib/modules/flashcards/stores';

beforeEach(() => { S.initProject(); }); // locales en, vi

describe('LocaleBar', () => {
  it('renders a button per locale and marks the active one', () => {
    render(LocaleBar);
    const en = screen.getByRole('button', { name: 'EN' });
    expect(en.closest('.chip')).toHaveClass('active'); // active class is on the wrapping chip
  });
  it('clicking a locale sets it active', async () => {
    render(LocaleBar);
    await fireEvent.click(screen.getByRole('button', { name: 'VI' }));
    expect(get(S.project).activeLocale).toBe('vi');
  });
  it('adds a locale from the input', async () => {
    render(LocaleBar);
    const input = screen.getByPlaceholderText(/add locale/i);
    await fireEvent.input(input, { target: { value: 'ja' } });
    await fireEvent.submit(input.closest('form')!);
    expect(get(S.project).locales).toContain('ja');
  });
});
