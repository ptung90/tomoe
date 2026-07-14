import { fetch } from '@tauri-apps/plugin-http';
import type { ChatMessage } from './prompt';

export function parseSseEvents(text: string): { deltas: string[]; done: boolean } {
  const deltas: string[] = [];
  let done = false;
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('data:')) continue;
    const payload = t.slice(5).trim();
    if (payload === '[DONE]') { done = true; continue; }
    try {
      const obj = JSON.parse(payload);
      const c = obj?.choices?.[0]?.delta?.content;
      if (typeof c === 'string') deltas.push(c);
    } catch { /* partial/incomplete line */ }
  }
  return { deltas, done };
}

export function describeError(status: number, body?: string): string {
  if (status === 401) return 'Invalid API token — check it in Config.';
  if (status === 429) return 'Rate limit or quota exceeded.';
  return `Request failed (${status})${body ? `: ${body.slice(0, 200)}` : ''}`;
}

export async function streamChat(opts: {
  token: string; model: string; messages: ChatMessage[];
  onDelta: (t: string) => void; signal?: AbortSignal;
}): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opts.token}` },
    body: JSON.stringify({ model: opts.model, messages: opts.messages, stream: true }),
    signal: opts.signal,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(describeError(res.status, body));
  }

  let full = '';
  const reader = res.body?.getReader?.();
  if (reader) {
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const nl = buffer.lastIndexOf('\n');
      if (nl === -1) continue;
      const ready = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      const { deltas, done: sseDone } = parseSseEvents(ready);
      for (const d of deltas) { full += d; opts.onDelta(d); }
      if (sseDone) return full;
    }
    const tail = parseSseEvents(buffer);
    for (const d of tail.deltas) { full += d; opts.onDelta(d); }
    return full;
  }

  // Fallback: no stream body — parse the whole SSE text at once.
  const textAll = await res.text();
  const { deltas } = parseSseEvents(textAll);
  for (const d of deltas) { full += d; opts.onDelta(d); }
  return full;
}
