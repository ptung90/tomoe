# AI Chat (ChatGPT) Integration — Design Spec

**Date:** 2026-07-05
**Status:** Approved (design), ready for implementation plan
**Repo:** `d:\github\json-table-editor`
**Builds on:** the shipped editor (redesign, 2-level, pure-text mode)

## 1. Purpose

Let the user ask ChatGPT (their own OpenAI API key) for help while editing — e.g. "fill 5 example words for this card" — from a Messenger-style chat panel, and insert the answer into the currently-selected node. A config button stores the API token and model.

### Success criteria
- A floating chat widget (bottom-right) opens a chat panel; messages stream in.
- Chat requests carry **smart context** so GPT understands the data (selected node + ancestor key fields + document meta).
- Each assistant reply has an **Insert into selected node** action (validated, undo-tracked).
- A **Config** button stores the OpenAI **token** and **model** (persisted).
- No token → chat prompts the user to configure one. Core editing/saving stays offline; only AI calls the network.

### Non-goals (v1)
- GPT directly editing the tree via tool/function calling (deferred).
- Persisting chat history across app restarts (in-memory only).
- Manual per-message context scope picker or a "whole file" toggle (smart context only).
- Providers other than OpenAI; multi-conversation management.

## 2. Decisions (locked during brainstorming)

| Area | Decision |
|---|---|
| **Integration** | Chat + **Insert into selected node** button on each reply (validate → `editValue`). |
| **Token storage** | `localStorage` (plaintext, local-only). Never logged; sent only in the `Authorization` header. |
| **Model** | Default `gpt-4o-mini`; changeable in Config. |
| **Responses** | **Streaming** (SSE) — text appears incrementally. |
| **Context** | **Smart context (auto):** selected node JSON + ancestor objects' scalar fields + document top-level meta, size-capped. Injected **only when the selected node changes** (not every turn) — it stays in history, so tokens aren't wasted repeating it. |
| **Network** | Call OpenAI from the **Rust side via `tauri-plugin-http`** (avoids webview CORS). |
| **Offline** | AI is the sole network feature; editing/saving remain offline. |

## 3. Smart context (why a lone node isn't enough)

A selected `words: ["b[ai]t", ...]` array alone tells GPT nothing about the domain. `buildContext(data, selectedPath)` assembles (in order, capped to ~4000 chars total):
1. **Document meta:** root's non-`folders`-like fields that are scalars or *small* containers (e.g. `title`, `source`, `markerConvention`, `legend`, `notes`) — the big top-level array(s) are summarized, not dumped.
2. **Ancestor chain:** for each ancestor object on `selectedPath`, its **scalar** fields (e.g. `folder.keySound`, `card.grapheme`) with the breadcrumb.
3. **Selected node:** its path and `JSON.stringify(node, null, 2)` (truncated with a note if very large).

**Token efficiency (avoid repetition):** the API is stateless but we send the running history each call, so the context only needs to be injected **once**. `sendChat` tracks `lastContextPath`; it attaches the context block to the current user message **only when `selectedPath` differs from `lastContextPath`** (first turn, or after the user selects a different node). Same-node follow-ups send just the user text — the earlier context is still in the history the model receives. Combined with a **capped context size**, a **bounded history** (keep the last ~12 turns), and OpenAI's automatic prompt caching of the stable system prefix, per-message token cost stays low.

## 4. Architecture

`jsonModel.ts` and the editors are untouched. Insert reuses `editValue` + `jsonText` (validate/auto-fix). New AI code is isolated under `lib/ai/`.

### `lib/ai/prompt.ts` (pure, tested)
- `buildContext(data: JsonValue | null, path: Path): string` — the smart-context block per §3 (capped).
- `buildMessages(history, userText, context: string | null): ChatMessage[]` — prepend a stable system prompt (role: JSON-editing assistant; answer with the value/JSON to insert when asked to fill), then history, then the new user turn. When `context` is non-null it is prepended to that user turn (`"Context:\n<...>\n\nUser: <text>"`); when null, only `userText` is sent. Keeps the system prefix identical across calls (cache-friendly).
- `type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }`
- History passed to `buildMessages` is already bounded (last ~12 turns) by the caller.

### `lib/ai/openai.ts` (network; thin, mockable)
- `streamChat(opts: { token: string; model: string; messages: ChatMessage[]; onDelta: (t: string) => void; signal?: AbortSignal }): Promise<string>` — POST `https://api.openai.com/v1/chat/completions` with `stream: true` via `@tauri-apps/plugin-http` `fetch`; read the response body stream, parse SSE `data:` lines, call `onDelta` per token, resolve with the full text.
- `describeError(status: number, body?: string): string` — 401 → "Invalid API token", 429 → "Rate limit / quota", others → generic + message.
- SSE parsing (`parseSseChunk`) is a **pure** helper, unit-tested independently of the network.

### `lib/stores.ts` (extended)
- `aiToken: Writable<string>` (init from `localStorage['jte-ai-token']`), `aiModel: Writable<string>` (init `localStorage['jte-ai-model'] ?? 'gpt-4o-mini'`).
- `setAiConfig(token: string, model: string): void` — persist both.
- `chatOpen: Writable<boolean>`, `chatBusy: Writable<boolean>`.
- `chatMessages: Writable<Array<{ role: 'user' | 'assistant'; content: string }>>` (in-memory).
- `sendChat(text: string): Promise<void>` — guards token; pushes user msg + an empty assistant msg; computes `context = buildContext($data,$selectedPath)` **only if `$selectedPath` differs from the module-level `lastContextPath`** (else `null`), then updates `lastContextPath`; builds messages from the bounded history; calls `streamChat`, appending deltas to the last assistant message; sets `chatBusy`; on error pushes/updates an assistant error line. A new document load resets `lastContextPath`.
- `insertAnswer(text: string): void` — `validateJson(text)`; if ok → `editValue($selectedPath, value)`; else `editValue($selectedPath, text)` (as string); toast "Inserted".

### Components
- `lib/components/ChatWidget.svelte` — floating 💬 button (bottom-right) toggling a panel; panel = header (title + close), scrollable `ChatMessage` list, textarea + Send (Enter send / Shift+Enter newline), "typing…" while busy, "Configure a token" notice when none.
- `lib/components/ChatMessage.svelte` — a bubble (user right/accent, assistant left/surface); assistant bubbles show an **Insert into selected node** button (disabled if `$data === null`).
- `lib/components/ConfigModal.svelte` — token input (password + show/hide), model select (`gpt-4o-mini`/`gpt-4o`/custom text), Save/Clear; opens from a Toolbar **⚙** button; backdrop/Esc close.
- `Toolbar.svelte` — add the ⚙ (settings) button.
- `App.svelte` — mount `<ChatWidget />` and `<ConfigModal />`.

### Rust / config
- Add `tauri-plugin-http`; init in `lib.rs`.
- `capabilities/default.json`: add `http:default` + `{ "identifier": "http:allow-fetch", "allow": [{ "url": "https://api.openai.com/*" }] }` (scope OpenAI only).
- Dependency (JS): `@tauri-apps/plugin-http`.

## 5. Data flow
1. **Config:** ⚙ → modal → Save → `setAiConfig` persists token+model.
2. **Open chat:** 💬 → `chatOpen=true`. No token → notice with a link to open Config.
3. **Send:** `sendChat(text)` → build messages incl. smart context → `streamChat` → deltas append to the assistant bubble live.
4. **Insert:** assistant bubble → Insert → `insertAnswer` validates & writes to `selectedPath` via `editValue` (undo-tracked) → toast.
5. **Errors:** 401/429/network → friendly assistant line; token stays.

## 6. Error handling / security
- Missing token → no request; chat shows "Add your OpenAI token in ⚙ Config".
- 401 → "Invalid API token"; 429 → "Rate limit or quota exceeded"; network → "Network error — check your connection".
- Token: `localStorage` only, masked in the UI, never written to logs or toasts.
- Requests go to `api.openai.com` only (capability-scoped); no other host allowed.
- Large context truncated to keep token cost bounded.

## 7. Testing
- **`prompt.ts`:** `buildContext` includes ancestor scalars + doc meta + node, omits huge containers, respects the cap; `buildMessages` shape (system first, context present, history order).
- **`openai.ts`:** `parseSseChunk` assembles deltas from mocked SSE lines incl. `[DONE]`; `describeError` maps 401/429/other. (No real network in tests.)
- **stores:** `setAiConfig` persists; `insertAnswer` writes parsed JSON when valid and a string when not (assert `data` via `editValue`); `sendChat` with a mocked `streamChat` appends an assistant message; **context is included on the first send and after a node change, but omitted on a same-node follow-up** (assert via the messages the mocked `streamChat` receives).
- **components:** ChatWidget open/close + send (mocked) renders bubbles; ChatMessage Insert calls the store; ConfigModal saves token/model; Toolbar ⚙ opens modal.
- Keep all existing tests; `jsonModel` untouched.
- **Manual:** enter a real token → ask "fill 5 example words for this ai card" with a `words` node selected → streamed reply → Insert → Ctrl+S. Wrong token → 401 message.

## 8. Repo structure (additions)
```
src/lib/
  ai/prompt.ts            # smart context + message builder (pure)
  ai/openai.ts            # streaming chat + SSE parse + error map
  components/ChatWidget.svelte
  components/ChatMessage.svelte
  components/ConfigModal.svelte
  stores.ts               # + aiToken, aiModel, chatOpen, chatBusy, chatMessages, actions
  components/Toolbar.svelte  # + settings button
  ../App.svelte           # mount ChatWidget + ConfigModal
src-tauri/                # + tauri-plugin-http, capability for api.openai.com
tests/                    # prompt, openai(parse/error), stores(ai), components
package.json              # + @tauri-apps/plugin-http
```

## 9. Risks / sequencing
- **Streaming via plugin-http:** if streaming the response body proves troublesome, implement **non-streaming first** (accumulate full JSON response — guaranteed to work), then layer streaming on top. The plan splits these so a working chat lands before streaming.
- **CORS:** avoided by routing through Rust (`tauri-plugin-http`).

## 10. Deferred to v2
Tool-calling edits, persistent history, per-message context scope + "whole file", multiple providers/conversations, token encryption at rest, Anthropic support.
