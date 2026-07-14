# AI Chat (ChatGPT) Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Messenger-style chat panel that streams answers from the user's OpenAI account, carries smart context, and inserts replies into the selected node; plus a Config button for the token/model.

**Architecture:** Pure `lib/ai/prompt.ts` (smart context + message builder) and `lib/ai/openai.ts` (SSE parse + error map + `streamChat` via `tauri-plugin-http`) back new stores (`aiToken`, `aiModel`, `chatMessages`, …) and three components (`ChatWidget`, `ChatMessage`, `ConfigModal`). Insert reuses `editValue` + `jsonText`; `jsonModel` and editors are untouched. OpenAI is called from Rust (plugin-http) to avoid CORS.

**Tech Stack:** Svelte 5, TypeScript, Vitest + @testing-library/svelte, Tauri v2, `@tauri-apps/plugin-http` + `tauri-plugin-http`.

## Global Constraints

- **`jsonModel.ts` frozen**; Insert uses `editValue` + `jsonText` (`validateJson`).
- **Token:** `localStorage` only, masked in UI, **never logged**, sent only in `Authorization` to `https://api.openai.com`.
- **Network:** OpenAI via `@tauri-apps/plugin-http` (Rust side); capability scoped to `https://api.openai.com/*`. Editing/saving stay offline.
- **Model default `gpt-4o-mini`**, changeable in Config. Responses **streamed** (SSE).
- **Smart context** injected **only when `selectedPath` changes** (tracked by `lastContextPath`); capped ~4000 chars; history bounded to last 12 turns.
- English UI copy; Lucide icons via subpath imports.
- Tauri builds: `CARGO_HOME=D:\dev-cache\.cargo`; stop `app.exe` before `tauri build`.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/lib/ai/prompt.ts` | **New, pure.** `buildContext`, `buildMessages`, `ChatMessage`. |
| `src/lib/ai/openai.ts` | **New.** `parseSseEvents`, `describeError` (pure) + `streamChat` (network). |
| `src/lib/theme.ts` | **Modify.** add `loadStr`/`saveStr`. |
| `src/lib/stores.ts` | **Modify.** AI state + `setAiConfig`, `insertAnswer`, `sendChat`, open flags. |
| `src/lib/components/ConfigModal.svelte` | **New.** token + model settings. |
| `src/lib/components/ChatMessage.svelte` | **New.** bubble + Insert. |
| `src/lib/components/ChatWidget.svelte` | **New.** floating button + panel. |
| `src/lib/components/Toolbar.svelte` | **Modify.** ⚙ settings button. |
| `src/App.svelte` | **Modify.** mount ChatWidget + ConfigModal. |
| `src-tauri/*` | **Modify.** add `tauri-plugin-http` + capability. |
| `package.json` | **Modify.** add `@tauri-apps/plugin-http`. |
| `tests/*` | prompt, openai, stores(ai), components. |

---

## Task 1: `lib/ai/prompt.ts` — smart context + messages

**Files:**
- Create: `src/lib/ai/prompt.ts`
- Test: `tests/aiPrompt.test.ts`

**Interfaces:**
- Consumes: `getAtPath`, `JsonValue`, `Path` from `jsonModel`; `pathExists` from `pathUtils`.
- Produces:
  - `type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }`
  - `type Turn = { role: 'user' | 'assistant'; content: string }`
  - `buildContext(data: JsonValue | null, path: Path): string`
  - `buildMessages(history: Turn[], userText: string, context: string | null): ChatMessage[]`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { buildContext, buildMessages } from '../src/lib/ai/prompt';

const doc = {
  title: 'Reading Folders',
  notes: ['lowercased'],
  folders: [{ keySound: 'ai', cards: [{ grapheme: 'ai', words: ['b[ai]t'] }] }],
};

describe('buildContext', () => {
  it('includes doc meta, ancestor scalars, and the selected node', () => {
    const ctx = buildContext(doc, ['folders', 0, 'cards', 0, 'words']);
    expect(ctx).toContain('Reading Folders');   // doc meta
    expect(ctx).toContain('keySound');           // ancestor folder scalar
    expect(ctx).toContain('grapheme');           // ancestor card scalar
    expect(ctx).toContain('b[ai]t');             // selected node content
  });
  it('does not dump the whole folders array as meta', () => {
    const ctx = buildContext(doc, ['title']);
    // title selected; folders (big) should not be inlined as meta
    expect(ctx).not.toContain('b[ai]t');
  });
  it('returns empty string for no document', () => {
    expect(buildContext(null, [])).toBe('');
  });
});

describe('buildMessages', () => {
  it('puts system first and context in the final user turn', () => {
    const msgs = buildMessages([{ role: 'user', content: 'hi' }], 'fill it', 'CTX');
    expect(msgs[0].role).toBe('system');
    expect(msgs[1]).toEqual({ role: 'user', content: 'hi' });
    expect(msgs[2].role).toBe('user');
    expect(msgs[2].content).toContain('CTX');
    expect(msgs[2].content).toContain('fill it');
  });
  it('omits context block when context is null', () => {
    const msgs = buildMessages([], 'plain', null);
    expect(msgs[msgs.length - 1].content).toBe('plain');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/aiPrompt.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/ai/prompt.ts`**

```ts
import { getAtPath, type JsonValue, type Path } from '../jsonModel';
import { pathExists } from '../pathUtils';

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };
export type Turn = { role: 'user' | 'assistant'; content: string };

const CAP = 4000;
const SYSTEM =
  'You are a helpful assistant embedded in a JSON data editor. When asked to fill or generate a value, '
  + 'reply with just the value to insert — a JSON literal (object/array/number/boolean) when structured, '
  + 'or plain text for a single string. Be concise.';

const isObj = (v: JsonValue): v is Record<string, JsonValue> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
const isScalar = (v: JsonValue) => v === null || typeof v !== 'object';

export function buildContext(data: JsonValue | null, path: Path): string {
  if (data === null || !pathExists(data, path)) return '';
  const parts: string[] = [];

  // 1. Document meta: root scalars, small scalar arrays, small objects (skip big containers).
  if (isObj(data)) {
    const meta: Record<string, JsonValue> = {};
    for (const [k, v] of Object.entries(data)) {
      if (isScalar(v)) meta[k] = v;
      else if (Array.isArray(v) && v.length <= 6 && v.every(isScalar)) meta[k] = v;
      else if (isObj(v) && JSON.stringify(v).length <= 400) meta[k] = v;
    }
    if (Object.keys(meta).length) parts.push('Document meta:\n' + JSON.stringify(meta, null, 2));
  }

  // 2. Ancestor chain: each ancestor object's scalar fields.
  const crumbs: string[] = ['root'];
  let cur: JsonValue = data;
  for (let i = 0; i < path.length; i++) {
    cur = (cur as Record<string, JsonValue> & JsonValue[])[path[i] as never];
    if (i < path.length - 1 && isObj(cur)) {
      const scalars: Record<string, JsonValue> = {};
      for (const [k, v] of Object.entries(cur)) if (isScalar(v)) scalars[k] = v;
      crumbs.push(`${path[i]} ${JSON.stringify(scalars)}`);
    } else {
      crumbs.push(String(path[i]));
    }
  }
  parts.push('Path: ' + crumbs.join(' > '));

  // 3. Selected node.
  parts.push('Selected node:\n' + JSON.stringify(getAtPath(data, path), null, 2));

  let out = parts.join('\n\n');
  if (out.length > CAP) out = out.slice(0, CAP) + '\n…(truncated)';
  return out;
}

export function buildMessages(history: Turn[], userText: string, context: string | null): ChatMessage[] {
  const msgs: ChatMessage[] = [{ role: 'system', content: SYSTEM }];
  for (const h of history) msgs.push({ role: h.role, content: h.content });
  msgs.push({ role: 'user', content: context ? `Context:\n${context}\n\nRequest: ${userText}` : userText });
  return msgs;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/aiPrompt.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/prompt.ts tests/aiPrompt.test.ts
git commit -m "feat: AI smart-context + message builder (pure)"
```

---

## Task 2: `lib/ai/openai.ts` — SSE parse, error map, streaming call

**Files:**
- Create: `src/lib/ai/openai.ts`
- Test: `tests/aiOpenai.test.ts`
- Modify: `package.json` (add `@tauri-apps/plugin-http`)

**Interfaces:**
- Consumes: `ChatMessage` from `prompt`; `@tauri-apps/plugin-http` `fetch`.
- Produces:
  - `parseSseEvents(text: string): { deltas: string[]; done: boolean }`
  - `describeError(status: number, body?: string): string`
  - `streamChat(opts: { token: string; model: string; messages: ChatMessage[]; onDelta: (t: string) => void; signal?: AbortSignal }): Promise<string>`

- [ ] **Step 1: Install the http plugin (JS side)**

Run: `npm install @tauri-apps/plugin-http@^2`
Expected: added to `dependencies`.

- [ ] **Step 2: Write the failing test** (pure parts only — no network)

```ts
import { describe, it, expect } from 'vitest';
import { parseSseEvents, describeError } from '../src/lib/ai/openai';

describe('parseSseEvents', () => {
  it('extracts delta contents and detects [DONE]', () => {
    const text =
      'data: {"choices":[{"delta":{"content":"He"}}]}\n' +
      'data: {"choices":[{"delta":{"content":"llo"}}]}\n' +
      'data: [DONE]';
    const r = parseSseEvents(text);
    expect(r.deltas).toEqual(['He', 'llo']);
    expect(r.done).toBe(true);
  });
  it('ignores non-data and unparseable lines', () => {
    const r = parseSseEvents(': keep-alive\ndata: {bad json');
    expect(r.deltas).toEqual([]);
    expect(r.done).toBe(false);
  });
});

describe('describeError', () => {
  it('maps common statuses', () => {
    expect(describeError(401)).toMatch(/token/i);
    expect(describeError(429)).toMatch(/rate|quota/i);
    expect(describeError(500, 'boom')).toMatch(/boom|error/i);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/aiOpenai.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `src/lib/ai/openai.ts`**

```ts
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/aiOpenai.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ai/openai.ts tests/aiOpenai.test.ts package.json package-lock.json
git commit -m "feat: OpenAI streaming client + SSE parse/error map"
```

---

## Task 3: stores — AI state + actions

**Files:**
- Modify: `src/lib/theme.ts` (add `loadStr`/`saveStr`)
- Modify: `src/lib/stores.ts`
- Test: `tests/aiStores.test.ts`

**Interfaces:**
- Consumes: `prompt` (`buildContext`, `buildMessages`, `Turn`), `openai` (`streamChat`), `jsonText` (`validateJson`), `editValue`, `selectedPath`, `data`, `showToast`.
- Produces (stores.ts):
  - `aiToken: Writable<string>`, `aiModel: Writable<string>`
  - `chatOpen: Writable<boolean>`, `configOpen: Writable<boolean>`, `chatBusy: Writable<boolean>`
  - `chatMessages: Writable<Turn[]>`
  - `setAiConfig(token: string, model: string): void`
  - `insertAnswer(text: string): void`
  - `sendChat(text: string): Promise<void>`
  - `openConfig(): void` / `closeConfig(): void`

- [ ] **Step 1: Add `loadStr`/`saveStr` to `src/lib/theme.ts`** (append)

```ts
export function loadStr(key: string, fallback: string): string {
  try { const v = localStorage.getItem(key); return v ?? fallback; } catch { return fallback; }
}
export function saveStr(key: string, val: string): void {
  try { localStorage.setItem(key, val); } catch { /* ignore */ }
}
```

- [ ] **Step 2: Write the failing test**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

vi.mock('../src/lib/ai/openai', () => ({
  streamChat: vi.fn(async (opts: any) => { opts.onDelta('Hi'); return 'Hi'; }),
}));
import { streamChat } from '../src/lib/ai/openai';
import {
  aiToken, aiModel, chatMessages, data, selectedPath,
  setAiConfig, insertAnswer, sendChat, loadDocument, select,
} from '../src/lib/stores';

beforeEach(() => {
  localStorage.clear();
  loadDocument({ obj: { a: 1 }, words: ['x'] }, null);
  chatMessages.set([]);
  setAiConfig('sk-test', 'gpt-4o-mini');
  (streamChat as any).mockClear();
});

describe('AI stores', () => {
  it('setAiConfig persists token and model', () => {
    setAiConfig('sk-abc', 'gpt-4o');
    expect(get(aiToken)).toBe('sk-abc');
    expect(get(aiModel)).toBe('gpt-4o');
    expect(localStorage.getItem('jte-ai-token')).toBe('sk-abc');
    expect(localStorage.getItem('jte-ai-model')).toBe('gpt-4o');
  });
  it('insertAnswer writes parsed JSON when valid, string otherwise', () => {
    select(['obj']);
    insertAnswer('{"a": 9}');
    expect((get(data) as any).obj).toEqual({ a: 9 });
    select(['words', 0]);
    insertAnswer('hello');
    expect((get(data) as any).words[0]).toBe('hello');
  });
  it('sendChat appends an assistant reply via streamChat', async () => {
    select(['words']);
    await sendChat('fill it');
    const msgs = get(chatMessages);
    expect(msgs[msgs.length - 2]).toEqual({ role: 'user', content: 'fill it' });
    expect(msgs[msgs.length - 1]).toEqual({ role: 'assistant', content: 'Hi' });
  });
  it('includes context on first send and after node change, omits on same-node follow-up', async () => {
    select(['words']);
    await sendChat('one');
    await sendChat('two');                         // same node
    select(['obj']);
    await sendChat('three');                       // node changed
    const calls = (streamChat as any).mock.calls;
    const last = (c: any) => c[0].messages[c[0].messages.length - 1].content as string;
    expect(last(calls[0])).toContain('Context:');  // first: has context
    expect(last(calls[1])).not.toContain('Context:'); // same node: no context
    expect(last(calls[2])).toContain('Context:');  // changed node: context again
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/aiStores.test.ts`
Expected: FAIL — exports missing.

- [ ] **Step 4: Extend `src/lib/stores.ts`**

Add imports near the top:
```ts
import { loadStr, saveStr } from './theme';
import { buildContext, buildMessages, type Turn } from './ai/prompt';
import { streamChat } from './ai/openai';
import { validateJson } from './jsonText';
```
Add stores near `editorTab`:
```ts
export const aiToken = writable<string>(loadStr('jte-ai-token', ''));
export const aiModel = writable<string>(loadStr('jte-ai-model', 'gpt-4o-mini'));
export const chatOpen = writable<boolean>(false);
export const configOpen = writable<boolean>(false);
export const chatBusy = writable<boolean>(false);
export const chatMessages = writable<Turn[]>([]);
```
Add actions near the other setters:
```ts
export function setAiConfig(token: string, model: string): void {
  aiToken.set(token); aiModel.set(model);
  saveStr('jte-ai-token', token); saveStr('jte-ai-model', model);
}
export function openConfig(): void { configOpen.set(true); }
export function closeConfig(): void { configOpen.set(false); }

export function insertAnswer(text: string): void {
  const cur = get(data);
  if (cur === null) return;
  const r = validateJson(text);
  editValue(get(selectedPath), r.ok ? r.value : text);
  showToast('Inserted');
}

let lastContextPath: string | null = null;
export async function sendChat(text: string): Promise<void> {
  const token = get(aiToken);
  if (!token) {
    chatMessages.update((m) => [...m,
      { role: 'user', content: text },
      { role: 'assistant', content: 'Add your OpenAI token in ⚙ Config first.' }]);
    return;
  }
  const path = get(selectedPath);
  const key = JSON.stringify(path);
  const context = key !== lastContextPath ? buildContext(get(data), path) : null;
  lastContextPath = key;

  const prior = get(chatMessages).slice(-12);
  const messages = buildMessages(prior, text, context);

  chatMessages.update((m) => [...m,
    { role: 'user', content: text },
    { role: 'assistant', content: '' }]);
  chatBusy.set(true);
  try {
    await streamChat({
      token, model: get(aiModel), messages,
      onDelta: (d) => chatMessages.update((m) => {
        const c = [...m];
        c[c.length - 1] = { role: 'assistant', content: c[c.length - 1].content + d };
        return c;
      }),
    });
  } catch (e) {
    chatMessages.update((m) => {
      const c = [...m];
      c[c.length - 1] = { role: 'assistant', content: `⚠ ${(e as Error).message}` };
      return c;
    });
  } finally {
    chatBusy.set(false);
  }
}
```
Also reset `lastContextPath = null;` inside `loadDocument` (so a new file re-sends context):
find `export function loadDocument(...)` and add `lastContextPath = null;` — but it's declared later. Instead, reset it in `loadDocument` by moving the `let lastContextPath` declaration ABOVE `loadDocument`, or set via a small exported-free module variable. Simplest: declare `let lastContextPath: string | null = null;` near the top of the module (just after the `history` writable) and reference it in both `loadDocument` and `sendChat`.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/aiStores.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/theme.ts src/lib/stores.ts tests/aiStores.test.ts
git commit -m "feat: AI stores — config, sendChat (context-on-change), insertAnswer"
```

---

## Task 4: `ConfigModal.svelte`

**Files:**
- Create: `src/lib/components/ConfigModal.svelte`
- Test: `tests/ConfigModal.test.ts`

**Interfaces:**
- Consumes: `aiToken`, `aiModel`, `configOpen`, `setAiConfig`, `closeConfig`; Lucide `x`, `eye`, `eye-off`.

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ConfigModal.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/lib/components/ConfigModal.svelte`**

```svelte
<script lang="ts">
  import X from 'lucide-svelte/icons/x';
  import { aiToken, aiModel, configOpen, setAiConfig, closeConfig } from '../stores';

  let token = $state('');
  let model = $state('gpt-4o-mini');
  let show = $state(false);
  $effect(() => { if ($configOpen) { token = $aiToken; model = $aiModel || 'gpt-4o-mini'; } });

  function save() { setAiConfig(token.trim(), model.trim() || 'gpt-4o-mini'); closeConfig(); }
  function clear() { token = ''; }
</script>

{#if $configOpen}
  <div class="backdrop" role="button" tabindex="-1" aria-label="close"
    onclick={closeConfig} onkeydown={(e) => e.key === 'Escape' && closeConfig()}></div>
  <div class="dialog" role="dialog" aria-label="AI configuration">
    <header>
      <span>AI Settings</span>
      <button class="x" aria-label="close" onclick={closeConfig}><X size={18} /></button>
    </header>
    <label for="tok">OpenAI token</label>
    <div class="row">
      <input id="tok" type={show ? 'text' : 'password'} bind:value={token} placeholder="sk-..." />
      <button onclick={() => (show = !show)}>{show ? 'Hide' : 'Show'}</button>
    </div>
    <label for="mdl">Model</label>
    <input id="mdl" type="text" bind:value={model} placeholder="gpt-4o-mini" list="models" />
    <datalist id="models"><option value="gpt-4o-mini"></option><option value="gpt-4o"></option></datalist>
    <footer>
      <button onclick={clear}>Clear</button>
      <button class="save" onclick={save}>Save</button>
    </footer>
    <p class="hint">Stored locally on this machine only.</p>
  </div>
{/if}

<style>
  .backdrop { position:fixed; inset:0; background:rgba(0,0,0,.4); z-index:1000; border:none; }
  .dialog { position:fixed; z-index:1001; top:50%; left:50%; transform:translate(-50%,-50%);
    width:min(460px,92vw); background:var(--surface); color:var(--text); border:1px solid var(--border);
    border-radius:12px; box-shadow:0 20px 60px rgba(0,0,0,.35); padding:16px; display:flex; flex-direction:column; gap:8px; }
  header { display:flex; justify-content:space-between; align-items:center; font-weight:600; margin-bottom:4px; }
  .x { border:none; background:transparent; color:var(--text-muted); cursor:pointer; }
  label { font-size:12px; color:var(--text-muted); margin-top:6px; }
  .row { display:flex; gap:6px; }
  .row input { flex:1; }
  footer { display:flex; justify-content:flex-end; gap:8px; margin-top:12px; }
  footer .save { background:var(--accent); border-color:var(--accent); color:#fff; }
  footer button, .row button { border:1px solid var(--border); border-radius:8px; padding:5px 14px; background:var(--surface); color:var(--text); cursor:pointer; }
  .hint { font-size:11px; color:var(--text-muted); margin-top:8px; }
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/ConfigModal.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/ConfigModal.svelte tests/ConfigModal.test.ts
git commit -m "feat: ConfigModal for AI token + model"
```

---

## Task 5: `ChatMessage.svelte`

**Files:**
- Create: `src/lib/components/ChatMessage.svelte`
- Test: `tests/ChatMessage.test.ts`

**Interfaces:**
- Consumes: `data`, `insertAnswer` from `stores`; Lucide `corner-down-left`.
- Props: `{ role: 'user' | 'assistant'; content: string }`. Assistant bubbles show an **Insert into selected node** button (disabled when `$data === null`).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/svelte';
import { get } from 'svelte/store';
import ChatMessage from '../src/lib/components/ChatMessage.svelte';
import { data, loadDocument, select } from '../src/lib/stores';

beforeEach(() => { loadDocument({ words: ['x'] }, null); select(['words', 0]); });

describe('ChatMessage', () => {
  it('assistant Insert writes the content into the selected node', async () => {
    render(ChatMessage, { role: 'assistant', content: 'hello' });
    await fireEvent.click(screen.getByRole('button', { name: /insert/i }));
    expect((get(data) as any).words[0]).toBe('hello');
  });
  it('user messages have no Insert button', () => {
    render(ChatMessage, { role: 'user', content: 'hi' });
    expect(screen.queryByRole('button', { name: /insert/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ChatMessage.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/lib/components/ChatMessage.svelte`**

```svelte
<script lang="ts">
  import CornerDownLeft from 'lucide-svelte/icons/corner-down-left';
  import { data, insertAnswer } from '../stores';
  let { role, content }: { role: 'user' | 'assistant'; content: string } = $props();
</script>

<div class="msg {role}">
  <div class="bubble">{content}</div>
  {#if role === 'assistant' && content}
    <button class="insert" disabled={$data === null} onclick={() => insertAnswer(content)}>
      <CornerDownLeft size={13} /> Insert into selected node
    </button>
  {/if}
</div>

<style>
  .msg { display:flex; flex-direction:column; gap:3px; margin:6px 0; max-width:85%; }
  .msg.user { align-self:flex-end; align-items:flex-end; }
  .msg.assistant { align-self:flex-start; align-items:flex-start; }
  .bubble { padding:8px 12px; border-radius:12px; white-space:pre-wrap; word-break:break-word; }
  .user .bubble { background:var(--accent); color:#fff; border-bottom-right-radius:4px; }
  .assistant .bubble { background:var(--surface); border:1px solid var(--border); border-bottom-left-radius:4px; }
  .insert { display:inline-flex; align-items:center; gap:4px; font-size:11px; border:none; background:transparent;
    color:var(--accent); cursor:pointer; padding:2px 4px; }
  .insert:disabled { color:var(--text-muted); cursor:default; }
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/ChatMessage.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/ChatMessage.svelte tests/ChatMessage.test.ts
git commit -m "feat: ChatMessage bubble + Insert action"
```

---

## Task 6: `ChatWidget.svelte`

**Files:**
- Create: `src/lib/components/ChatWidget.svelte`
- Test: `tests/ChatWidget.test.ts`

**Interfaces:**
- Consumes: `chatOpen`, `chatMessages`, `chatBusy`, `aiToken`, `sendChat`, `openConfig` from `stores`; `ChatMessage`; Lucide `message-square`, `x`, `send`.

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ChatWidget.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/lib/components/ChatWidget.svelte`**

```svelte
<script lang="ts">
  import MessageSquare from 'lucide-svelte/icons/message-square';
  import X from 'lucide-svelte/icons/x';
  import Send from 'lucide-svelte/icons/send';
  import { chatOpen, chatMessages, chatBusy, aiToken, sendChat, openConfig } from '../stores';
  import ChatMessage from './ChatMessage.svelte';

  let text = $state('');

  function submit() {
    const t = text.trim();
    if (!t || $chatBusy) return;
    text = '';
    sendChat(t);
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
  }
</script>

{#if !$chatOpen}
  <button class="fab" aria-label="open chat" onclick={() => chatOpen.set(true)}>
    <MessageSquare size={22} />
  </button>
{:else}
  <div class="panel">
    <header>
      <span>AI Assistant</span>
      <button class="x" aria-label="close chat" onclick={() => chatOpen.set(false)}><X size={18} /></button>
    </header>
    <div class="log">
      {#if !$aiToken}
        <p class="notice">Add your OpenAI token to start —
          <button class="link" onclick={openConfig}>open Config</button>.</p>
      {/if}
      {#each $chatMessages as m}
        <ChatMessage role={m.role} content={m.content} />
      {/each}
      {#if $chatBusy}<p class="typing">typing…</p>{/if}
    </div>
    <div class="input">
      <textarea placeholder="Ask GPT to fill or generate…" bind:value={text} onkeydown={onKey} rows="1"></textarea>
      <button class="send" aria-label="send" disabled={$chatBusy} onclick={submit}><Send size={18} /></button>
    </div>
  </div>
{/if}

<style>
  .fab { position:fixed; right:20px; bottom:20px; z-index:900; width:52px; height:52px; border-radius:50%;
    border:none; background:var(--accent); color:#fff; box-shadow:0 6px 20px rgba(0,0,0,.25); cursor:pointer;
    display:flex; align-items:center; justify-content:center; }
  .panel { position:fixed; right:20px; bottom:20px; z-index:900; width:min(380px,92vw); height:min(520px,80vh);
    display:flex; flex-direction:column; background:var(--bg); border:1px solid var(--border);
    border-radius:14px; box-shadow:0 12px 40px rgba(0,0,0,.3); overflow:hidden; }
  header { display:flex; justify-content:space-between; align-items:center; padding:10px 14px;
    background:var(--accent); color:#fff; font-weight:600; }
  header .x { border:none; background:transparent; color:#fff; cursor:pointer; }
  .log { flex:1; overflow:auto; padding:12px; display:flex; flex-direction:column; }
  .notice, .typing { color:var(--text-muted); font-size:13px; }
  .link { border:none; background:transparent; color:var(--accent); cursor:pointer; text-decoration:underline; padding:0; }
  .input { display:flex; gap:6px; padding:10px; border-top:1px solid var(--border); }
  .input textarea { flex:1; resize:none; max-height:120px; font:inherit; color:var(--text); background:var(--surface);
    border:1px solid var(--border); border-radius:8px; padding:8px 10px; }
  .send { border:none; background:var(--accent); color:#fff; border-radius:8px; padding:0 12px; cursor:pointer; }
  .send:disabled { opacity:.5; cursor:default; }
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/ChatWidget.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/ChatWidget.svelte tests/ChatWidget.test.ts
git commit -m "feat: ChatWidget floating panel"
```

---

## Task 7: Toolbar settings button + mount in App

**Files:**
- Modify: `src/lib/components/Toolbar.svelte`
- Modify: `src/App.svelte`
- Test: `tests/Toolbar.test.ts` (add case)

**Interfaces:**
- Consumes: `openConfig` from `stores`; Lucide `settings`. App mounts `ChatWidget` + `ConfigModal`.

- [ ] **Step 1: Write the failing test** (append to `tests/Toolbar.test.ts`; add `configOpen` to the stores import)

```ts
import { configOpen } from '../src/lib/stores';

describe('Toolbar — settings', () => {
  it('opens the config modal', async () => {
    configOpen.set(false);
    render(Toolbar);
    await fireEvent.click(screen.getByRole('button', { name: /settings/i }));
    expect(get(configOpen)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/Toolbar.test.ts`
Expected: FAIL — no settings button.

- [ ] **Step 3: Modify `Toolbar.svelte`**

Add import:
```ts
  import Settings from 'lucide-svelte/icons/settings';
  import { openConfig } from '../stores';
```
(extend the existing `../stores` import or add this line).
Add the button just before the theme toggle button:
```svelte
  <button class="settings" onclick={openConfig} aria-label="settings" title="AI settings">
    <Settings size={18} />
  </button>
```
Add style:
```css
  .settings { color:var(--text-muted); }
```

- [ ] **Step 4: Mount widgets in `src/App.svelte`**

Add imports:
```ts
  import ChatWidget from './lib/components/ChatWidget.svelte';
  import ConfigModal from './lib/components/ConfigModal.svelte';
```
Add before the closing `</div>` of `.app` (next to `<Toast />` / `<BigEditor />`):
```svelte
  <ChatWidget />
  <ConfigModal />
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/Toolbar.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/Toolbar.svelte src/App.svelte tests/Toolbar.test.ts
git commit -m "feat: settings button + mount ChatWidget/ConfigModal"
```

---

## Task 8: Rust — `tauri-plugin-http` + capability  ⚠️ REQUIRES RUST

**Files:**
- Modify: `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`, `src-tauri/capabilities/default.json`

**Interfaces:** enables `@tauri-apps/plugin-http` `fetch` to reach `https://api.openai.com/*`.

- [ ] **Step 1: Add the plugin**

Run: `npm run tauri add http`
Expected: `Cargo.toml` gains `tauri-plugin-http`; `lib.rs` gets `.plugin(tauri_plugin_http::init())`; capability updated. (If the CLI doesn't edit `lib.rs`, add the plugin line manually next to the other `.plugin(...)` calls.)

- [ ] **Step 2: Scope the capability** (`src-tauri/capabilities/default.json`)

Add to the `permissions` array:
```json
    {
      "identifier": "http:default",
      "allow": [{ "url": "https://api.openai.com/*" }]
    }
```

- [ ] **Step 3: Verify Rust compiles**

Run: `CARGO_HOME=D:\dev-cache\.cargo cargo check --manifest-path src-tauri/Cargo.toml`
Expected: `Finished`.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/lib.rs src-tauri/capabilities/default.json
git commit -m "feat: tauri-plugin-http scoped to api.openai.com"
```

---

## Task 9: Full verification + rebuild

**Files:** none.

- [ ] **Step 1: Full suite** — Run: `npx vitest run` → all PASS (new: aiPrompt, aiOpenai, aiStores, ConfigModal, ChatMessage, ChatWidget + Toolbar case).
- [ ] **Step 2: Build + typecheck** — `npm run build` succeeds; `npm run check` 0 errors.
- [ ] **Step 3: Rebuild app** — stop `app.exe`, then `CARGO_HOME=D:\dev-cache\.cargo npm run tauri build`.
- [ ] **Step 4: Manual acceptance** — launch; ⚙ → enter a real OpenAI token → Save. Select a `words` node → 💬 → "fill 5 example words for this ai card" → streamed reply → **Insert** → Ctrl+S. Try a wrong token → 401 message. Ask a follow-up on the same node → confirm it still answers (context not re-sent). 
- [ ] **Step 5: Commit** — `git commit -am "chore: AI chat verified + app rebuilt"`.

---

## Self-Review

**Spec coverage:**
- §2 chat + Insert: Tasks 5 (Insert), 6 (chat). ✓
- §2 token localStorage + Config: Tasks 3 (setAiConfig/loadStr), 4 (modal). ✓
- §2 model default + streaming: Tasks 2 (streamChat), 4 (model field). ✓
- §2/§3 smart context + only-on-change: Task 1 (buildContext), Task 3 (`lastContextPath`). ✓
- §4 openai via plugin-http: Tasks 2 + 8. ✓
- §4 components + stores: Tasks 3–7. ✓
- §6 error handling (401/429/no token): Tasks 2 (describeError), 3 (no-token guard), 6 (notice). ✓
- §6 security (mask, no log, scoped host): Task 4 (password field), Task 8 (capability scope); token only in Authorization (Task 2). ✓
- §7 testing: each task has tests incl. context-on-change; Task 9 full suite + manual. ✓
- §8 repo structure: matches. ✓
- §9 streaming risk: Task 2 `streamChat` has a non-stream fallback (reader-absent path). ✓

**Placeholder scan:** none — full code in every code step; commands have expected output. ✓

**Type consistency:** `ChatMessage`/`Turn` (Task 1) used by `openai.streamChat` (Task 2) and stores (Task 3). `buildContext`/`buildMessages` signatures match Task 3 usage. `streamChat(opts)` shape identical in Task 2 def and Task 3 call + mocks. Store exports (`aiToken`, `aiModel`, `chatMessages`, `chatOpen`, `configOpen`, `chatBusy`, `setAiConfig`, `insertAnswer`, `sendChat`, `openConfig`, `closeConfig`) defined in Task 3 and consumed identically in Tasks 4–7. `validateJson` reused from `jsonText`. ✓
