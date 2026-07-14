import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/svelte';

vi.mock('../src/lib/ai/openai', () => ({
  streamChat: vi.fn(async (o: any) => { o.onDelta('Answer'); return 'Answer'; }),
}));
import ChatWidget from '../src/lib/components/ChatWidget.svelte';
import { chatOpen, chatMessages, loadDocument, setAiConfig } from '../src/lib/stores';

beforeEach(() => { localStorage.clear(); loadDocument({ a: 1 }, null); chatMessages.set([]); chatOpen.set(false); });

describe('ChatWidget', () => {
  it('toggles open and sends a message', async () => {
    setAiConfig('sk-test', 'gpt-4o-mini');
    render(ChatWidget);
    await fireEvent.click(screen.getByRole('button', { name: /open chat/i }));
    await fireEvent.input(screen.getByPlaceholderText(/ask/i), { target: { value: 'hello' } });
    await fireEvent.click(screen.getByRole('button', { name: /send/i }));
    expect(await screen.findByText('Answer')).toBeInTheDocument();
  });
  it('shows a config notice when there is no token', async () => {
    setAiConfig('', 'gpt-4o-mini');
    render(ChatWidget);
    await fireEvent.click(screen.getByRole('button', { name: /open chat/i }));
    expect(screen.getByText(/token/i)).toBeInTheDocument();
  });
});
