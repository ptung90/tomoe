import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/svelte';
import { get } from 'svelte/store';
import ChatMessage from '../src/lib/components/ChatMessage.svelte';
import { data, loadDocument, select } from '../src/lib/stores';

beforeEach(() => { loadDocument({ words: ['x'] }, null); select(['words', 0]); });

describe('ChatMessage', () => {
  it('assistant Insert writes the content into the selected (non-array) node', async () => {
    select(['words', 0]);
    render(ChatMessage, { role: 'assistant', content: 'hello' });
    await fireEvent.click(screen.getByRole('button', { name: /insert/i }));
    expect((get(data) as any).words[0]).toBe('hello');
  });
  it('Append adds to a selected array instead of replacing it', async () => {
    select(['words']);                       // the array itself
    render(ChatMessage, { role: 'assistant', content: '["y"]' });
    await fireEvent.click(screen.getByRole('button', { name: /append/i }));
    expect((get(data) as any).words).toEqual(['x', 'y']);
  });
  it('Revert undoes the applied insert', async () => {
    select(['words', 0]);
    render(ChatMessage, { role: 'assistant', content: 'hello' });
    await fireEvent.click(screen.getByRole('button', { name: /insert/i }));
    expect((get(data) as any).words[0]).toBe('hello');
    await fireEvent.click(screen.getByRole('button', { name: /revert/i }));
    expect((get(data) as any).words[0]).toBe('x');
  });
  it('user messages have no Insert button', () => {
    render(ChatMessage, { role: 'user', content: 'hi' });
    expect(screen.queryByRole('button', { name: /insert/i })).not.toBeInTheDocument();
  });
});
