import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/svelte';
import { get } from 'svelte/store';
import ConfigModal from '../src/lib/components/ConfigModal.svelte';
import { aiToken, aiModel, configOpen } from '../src/lib/stores';

beforeEach(() => { localStorage.clear(); configOpen.set(true); });

describe('ConfigModal', () => {
  it('saves token and model', async () => {
    render(ConfigModal);
    await fireEvent.input(screen.getByLabelText(/token/i), { target: { value: 'sk-xyz' } });
    await fireEvent.input(screen.getByLabelText(/model/i), { target: { value: 'gpt-4o' } });
    await fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(get(aiToken)).toBe('sk-xyz');
    expect(get(aiModel)).toBe('gpt-4o');
    expect(get(configOpen)).toBe(false);
  });
});
