# Flashcards AI (generate records) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Generate flashcard records for a schema from a natural-language instruction using the user's own Anthropic key.

**Architecture:** Pure `buildRecordsPrompt` + tolerant `parseGeneratedRecords`; `generateRecords` calls Anthropic behind an injectable factory. Store `aiConfig` (localStorage) + `aiGenerateRecords` appends via the existing `importRecords`/`migrateRecordFields`. A modal opened per-schema from `SchemaRecordList`.

**Tech Stack:** Svelte 5, TS, vitest, `@anthropic-ai/sdk`.

## Global Constraints

- Everything under `src/lib/modules/flashcards/`. Module isolation.
- Anthropic only, model default `claude-opus-4-8`; call via `@anthropic-ai/sdk` with `dangerouslyAllowBrowser: true`, behind an injectable `factory` so tests use a fake (no network, no key).
- API key lives in `localStorage` (`tomoe.ai.apiKey`/`tomoe.ai.model`) — NEVER in the project document.
- Pure logic (prompt build, parse) is immutable + TDD. Locale coercion is delegated to `importRecords`/`migrateRecordFields` — do not re-implement it.
- Chrome = Calm Paper tokens; `#fff`-on-accent for the primary button is accepted (matches existing modals). lucide subpath imports only.
- Gates: `npm run check` 0 errors · `npm test` green, 0 unhandled (re-run once if EBUSY) · `npm run build` OK.

## File map

```
src/lib/modules/flashcards/
  lib/ai.ts                  # NEW (T1 pure; T2 adds generateRecords + SDK)
  stores.ts                  # MODIFY (T3): aiConfig + setAiConfig + aiGenerateRecords
  components/AiGenerateModal.svelte  # NEW (T4)
  components/SchemaRecordList.svelte # MODIFY (T4): Sparkles action
package.json                 # MODIFY (T2): + @anthropic-ai/sdk
tests/ ai.test.ts (T1/T2), flashcards-ai-store.test.ts (T3), AiGenerateModal.test.ts (T4)
```

---

## Task 1: ai.ts — prompt + parse (pure)

**Files:** Create `src/lib/modules/flashcards/lib/ai.ts`; Test `tests/ai.test.ts`.

**Interfaces produced:** `AiConfig`, `DEFAULT_AI_MODEL`, `buildRecordsPrompt(schema, instruction, count, locales)`, `parseGeneratedRecords(raw, schema)`, `extractText(content)`.

- [ ] **Step 1: Write the failing test** — create `tests/ai.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import type { Schema } from '../src/lib/modules/flashcards/model';
import { buildRecordsPrompt, parseGeneratedRecords, extractText } from '../src/lib/modules/flashcards/lib/ai';

const schema: Schema = {
  id: 's1', name: 'Verbs', cardTemplates: [],
  fields: [
    { id: 'f1', key: 'word', label: 'Word', type: 'text', multilingual: true },
    { id: 'f2', key: 'note', label: 'Note', type: 'text', multilingual: false },
    { id: 'f3', key: 'pic', label: 'Pic', type: 'image' },
  ],
};

describe('buildRecordsPrompt', () => {
  it('includes field keys, count, and the instruction', () => {
    const { system, user } = buildRecordsPrompt(schema, 'common verbs', 5, ['en', 'vi']);
    expect(system).toContain('word');
    expect(system).toContain('note');
    expect(system).toContain('en');
    expect(user).toContain('common verbs');
    expect(user).toContain('5');
  });
});

describe('parseGeneratedRecords', () => {
  it('parses a plain JSON array into loose records (unknown keys dropped)', () => {
    const raw = '[{"word":{"en":"go","vi":"đi"},"note":"v","pic":"","extra":"x"}]';
    const recs = parseGeneratedRecords(raw, schema);
    expect(recs).toHaveLength(1);
    expect(recs[0].schemaId).toBe('s1');
    expect(recs[0].fields).toEqual({ word: { en: 'go', vi: 'đi' }, note: 'v', pic: '' });
    expect((recs[0].fields as Record<string, unknown>).extra).toBeUndefined();
  });
  it('tolerates a ```json fenced block', () => {
    const raw = 'Here you go:\n```json\n[{"word":"run"}]\n```\nDone.';
    expect(parseGeneratedRecords(raw, schema)).toHaveLength(1);
  });
  it('throws on non-JSON / non-array', () => {
    expect(() => parseGeneratedRecords('sorry, no', schema)).toThrow();
    expect(() => parseGeneratedRecords('{"word":"x"}', schema)).toThrow();
  });
});

describe('extractText', () => {
  it('concatenates text blocks, ignores others', () => {
    expect(extractText([{ type: 'text', text: 'a' }, { type: 'thinking' }, { type: 'text', text: 'b' }])).toBe('ab');
  });
});
```

- [ ] **Step 2: RED** — `npm test -- ai` fails (cannot resolve).

- [ ] **Step 3: Implement** — create `src/lib/modules/flashcards/lib/ai.ts`:
```ts
import { type Schema, type RecordItem, type LocalizedText } from '../model';

export const DEFAULT_AI_MODEL = 'claude-opus-4-8';
export interface AiConfig { apiKey: string; model: string }

/** Build the system + user prompt for generating `count` records for `schema`. Pure. */
export function buildRecordsPrompt(
  schema: Schema, instruction: string, count: number, locales: string[],
): { system: string; user: string } {
  const fieldLines = schema.fields.map((f) => {
    if (f.type === 'image') return `- "${f.key}" (${f.label}): image — value is a string URL (use "" if none).`;
    if (f.multilingual === false) return `- "${f.key}" (${f.label}): text — value is a plain string.`;
    return `- "${f.key}" (${f.label}): text — value is an object mapping locale → string, locales: ${locales.join(', ')}.`;
  }).join('\n');
  const system =
    `You generate flashcard records as strict JSON.\n` +
    `The schema "${schema.name}" has these fields (use the KEY as the JSON property):\n${fieldLines}\n\n` +
    `Respond with ONLY a JSON array of objects — no markdown, no prose, no code fence. ` +
    `Each object has exactly the field keys above. Do not invent extra keys.`;
  const user = `${instruction}\n\nGenerate ${count} record(s) as a JSON array.`;
  return { system, user };
}

/** Concatenate the text of an Anthropic content array; ignore non-text blocks. */
export function extractText(content: Array<{ type: string; text?: string }>): string {
  return (content ?? []).filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text as string).join('');
}

/** Tolerantly parse an AI response into loose records for `schema`. Throws if no JSON array. */
export function parseGeneratedRecords(raw: string, schema: Schema): RecordItem[] {
  const arr = extractJsonArray(raw);
  const keys = new Set(schema.fields.map((f) => f.key));
  return arr.map((entry) => {
    const src = (entry && typeof entry === 'object') ? entry as Record<string, unknown> : {};
    const fields: Record<string, LocalizedText> = {};
    for (const [k, v] of Object.entries(src)) {
      if (!keys.has(k)) continue;
      if (typeof v === 'string') fields[k] = v;
      else if (v && typeof v === 'object' && !Array.isArray(v)) {
        const o: Record<string, string> = {};
        for (const [lk, lv] of Object.entries(v as Record<string, unknown>)) o[lk] = String(lv ?? '');
        fields[k] = o;
      } else if (v != null) fields[k] = String(v);
    }
    return { id: '', schemaId: schema.id, fieldsHash: '', fields };
  });
}

function extractJsonArray(raw: string): unknown[] {
  const text = (raw ?? '').trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1].trim() : text;
  const start = body.indexOf('[');
  const end = body.lastIndexOf(']');
  if (start < 0 || end <= start) throw new Error('No JSON array found in AI response');
  const parsed = JSON.parse(body.slice(start, end + 1));
  if (!Array.isArray(parsed)) throw new Error('AI response is not a JSON array');
  return parsed;
}
```

- [ ] **Step 4: GREEN** — `npm test -- ai` passes. `npm run check` 0 errors.
- [ ] **Step 5: Commit** — `git add src/lib/modules/flashcards/lib/ai.ts tests/ai.test.ts && git commit -m "feat(flashcards): AI prompt builder + tolerant records parser (pure)"`

---

## Task 2: ai.ts — generateRecords + @anthropic-ai/sdk

**Files:** Modify `src/lib/modules/flashcards/lib/ai.ts`; Modify `package.json`; Test `tests/ai.test.ts` (extend).

**Interfaces produced:** `AnthropicLike`, `AnthropicFactory`, `generateRecords(cfg, schema, instruction, count, locales, factory?): Promise<RecordItem[]>`.

- [ ] **Step 1: Add the dependency** — run: `npm install @anthropic-ai/sdk` (adds to package.json + lockfile).

- [ ] **Step 2: Write the failing test** — append to `tests/ai.test.ts`:
```ts
import { generateRecords } from '../src/lib/modules/flashcards/lib/ai';

describe('generateRecords', () => {
  it('calls the injected factory and returns parsed records (no network)', async () => {
    let seen: any = null;
    const fakeFactory = (apiKey: string) => ({
      messages: {
        create: async (body: any) => { seen = { apiKey, body }; return { content: [{ type: 'text', text: '[{"word":{"en":"go","vi":"đi"},"note":"v"}]' }] }; },
      },
    });
    const recs = await generateRecords(
      { apiKey: 'sk-test', model: 'claude-opus-4-8' }, schema, 'verbs', 3, ['en', 'vi'], fakeFactory,
    );
    expect(seen.apiKey).toBe('sk-test');
    expect(seen.body.model).toBe('claude-opus-4-8');
    expect(recs).toHaveLength(1);
    expect(recs[0].fields.word).toEqual({ en: 'go', vi: 'đi' });
  });
});
```

- [ ] **Step 3: RED** — `npm test -- ai` fails (generateRecords not exported).

- [ ] **Step 4: Implement** — add to the top of `src/lib/modules/flashcards/lib/ai.ts`:
```ts
import Anthropic from '@anthropic-ai/sdk';
```
and at the end of the file:
```ts
export interface AnthropicLike {
  messages: { create(body: unknown): Promise<{ content: Array<{ type: string; text?: string }> }> };
}
export type AnthropicFactory = (apiKey: string) => AnthropicLike;

const defaultFactory: AnthropicFactory = (apiKey) =>
  new Anthropic({ apiKey, dangerouslyAllowBrowser: true }) as unknown as AnthropicLike;

/** Generate records for `schema` from `instruction` via Anthropic. Network is behind `factory`. */
export async function generateRecords(
  cfg: AiConfig, schema: Schema, instruction: string, count: number, locales: string[],
  factory: AnthropicFactory = defaultFactory,
): Promise<RecordItem[]> {
  const { system, user } = buildRecordsPrompt(schema, instruction, count, locales);
  const client = factory(cfg.apiKey);
  const res = await client.messages.create({
    model: cfg.model || DEFAULT_AI_MODEL,
    max_tokens: 8192,
    system,
    messages: [{ role: 'user', content: user }],
  });
  return parseGeneratedRecords(extractText(res.content), schema);
}
```

- [ ] **Step 5: GREEN + gates** — `npm test -- ai` passes; `npm test` (full green, 0 unhandled — re-run once if EBUSY); `npm run check` (0 errors); `npm run build` (OK — confirms the SDK import resolves in the Vite build).
- [ ] **Step 6: Commit** — `git add src/lib/modules/flashcards/lib/ai.ts tests/ai.test.ts package.json package-lock.json && git commit -m "feat(flashcards): generateRecords via @anthropic-ai/sdk (injectable factory)"`

---

## Task 3: stores — aiConfig + aiGenerateRecords

**Files:** Modify `src/lib/modules/flashcards/stores.ts`; Test `tests/flashcards-ai-store.test.ts`.

**Interfaces produced:** `aiConfig` (Readable), `setAiConfig(patch)`, `aiGenerateRecords(schemaId, instruction, count): Promise<number>`.

- [ ] **Step 1: Write the failing test** — create `tests/flashcards-ai-store.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

vi.mock('../src/lib/modules/flashcards/lib/ai', async (orig) => {
  const actual = await orig<typeof import('../src/lib/modules/flashcards/lib/ai')>();
  return { ...actual, generateRecords: vi.fn(async () => [
    { id: '', schemaId: 'x', fieldsHash: '', fields: { word: { en: 'go', vi: '' } } },
    { id: '', schemaId: 'x', fieldsHash: '', fields: { word: { en: 'run', vi: '' } } },
  ]) };
});

import * as S from '../src/lib/modules/flashcards/stores';

beforeEach(() => {
  localStorage.clear();
  S.initProject();
});

describe('aiConfig', () => {
  it('setAiConfig persists to localStorage and updates the store', () => {
    S.setAiConfig({ apiKey: 'sk-1', model: 'claude-opus-4-8' });
    expect(get(S.aiConfig).apiKey).toBe('sk-1');
    expect(localStorage.getItem('tomoe.ai.apiKey')).toBe('sk-1');
  });
});

describe('aiGenerateRecords', () => {
  it('appends the generated records to the schema and returns the count', async () => {
    const sid = S.addSchema('Verbs');
    S.updateSchema(sid, { fields: [{ id: 'f1', key: 'word', label: 'Word', type: 'text', multilingual: true }] });
    const before = get(S.project).records.length;
    const n = await S.aiGenerateRecords(sid, 'verbs', 2);
    expect(n).toBe(2);
    expect(get(S.project).records.length).toBe(before + 2);
    expect(get(S.project).records.every((r) => r.schemaId === sid)).toBe(true);
  });
});
```

- [ ] **Step 2: RED** — `npm test -- flashcards-ai-store` fails (exports missing).

- [ ] **Step 3: Implement** — in `src/lib/modules/flashcards/stores.ts`:

Add to the model import line: `type Schema` is not needed; add the ai import after the existing imports (top of file, after line 6):
```ts
import * as ai from './lib/ai';
```
Add after the `filePath` writable (around line 13):
```ts
// ── AI config (localStorage, NOT in the document) ───────────────────────
function loadAiConfig(): ai.AiConfig {
  try {
    return {
      apiKey: localStorage.getItem('tomoe.ai.apiKey') ?? '',
      model: localStorage.getItem('tomoe.ai.model') ?? ai.DEFAULT_AI_MODEL,
    };
  } catch { return { apiKey: '', model: ai.DEFAULT_AI_MODEL }; }
}
const _aiConfig = writable<ai.AiConfig>(loadAiConfig());
export const aiConfig: Readable<ai.AiConfig> = derived(_aiConfig, (c) => c);
export function setAiConfig(patch: Partial<ai.AiConfig>): void {
  _aiConfig.update((c) => {
    const next = { ...c, ...patch };
    try {
      if (patch.apiKey !== undefined) localStorage.setItem('tomoe.ai.apiKey', next.apiKey);
      if (patch.model !== undefined) localStorage.setItem('tomoe.ai.model', next.model);
    } catch { /* ignore storage errors */ }
    return next;
  });
}
export async function aiGenerateRecords(schemaId: string, instruction: string, count: number): Promise<number> {
  const p = get(project);
  const schema = p.schemas.find((s) => s.id === schemaId);
  if (!schema) return 0;
  const recs = await ai.generateRecords(get(_aiConfig), schema, instruction, count, p.locales);
  if (recs.length) importRecords(schemaId, recs, 'append');
  return recs.length;
}
```

- [ ] **Step 4: GREEN + gates** — `npm test -- flashcards-ai-store` passes; `npm test` (full green, 0 unhandled — re-run once if EBUSY); `npm run check` (0 errors); `npm run build` (OK).
- [ ] **Step 5: Commit** — `git add src/lib/modules/flashcards/stores.ts tests/flashcards-ai-store.test.ts && git commit -m "feat(flashcards): aiConfig (localStorage) + aiGenerateRecords store action"`

---

## Task 4: AiGenerateModal + SchemaRecordList wiring

**Files:** Create `src/lib/modules/flashcards/components/AiGenerateModal.svelte`; Modify `src/lib/modules/flashcards/components/SchemaRecordList.svelte`; Test `tests/AiGenerateModal.test.ts`.

- [ ] **Step 1: Write the failing test** — create `tests/AiGenerateModal.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import AiGenerateModal from '../src/lib/modules/flashcards/components/AiGenerateModal.svelte';
import * as S from '../src/lib/modules/flashcards/stores';

beforeEach(() => {
  localStorage.clear();
  S.initProject();
  S.setAiConfig({ apiKey: '', model: 'claude-opus-4-8' });
});

describe('AiGenerateModal', () => {
  it('Generate is disabled without a key or instruction', () => {
    const { getByRole } = render(AiGenerateModal, { props: { schemaId: 's1', onClose: () => {} } });
    expect(getByRole('button', { name: /generate/i })).toBeDisabled();
  });
  it('with key + instruction, Generate calls aiGenerateRecords', async () => {
    const spy = vi.spyOn(S, 'aiGenerateRecords').mockResolvedValue(3);
    S.setAiConfig({ apiKey: 'sk-1' });
    const { getByRole, getByLabelText } = render(AiGenerateModal, { props: { schemaId: 's1', onClose: () => {} } });
    await fireEvent.input(getByLabelText(/instruction/i), { target: { value: 'verbs' } });
    await fireEvent.click(getByRole('button', { name: /generate/i }));
    expect(spy).toHaveBeenCalledWith('s1', 'verbs', expect.any(Number));
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: RED** — `npm test -- AiGenerateModal` fails (cannot resolve).

- [ ] **Step 3: Implement** — create `src/lib/modules/flashcards/components/AiGenerateModal.svelte`:
```svelte
<script lang="ts">
  import Sparkles from 'lucide-svelte/icons/sparkles';
  import X from 'lucide-svelte/icons/x';
  import { aiConfig, setAiConfig, aiGenerateRecords } from '../stores';
  import { showToast } from '../../../shell';

  let { schemaId, onClose }: { schemaId: string; onClose: () => void } = $props();

  let instruction = $state('');
  let count = $state(10);
  let busy = $state(false);
  let error = $state('');

  const canRun = $derived($aiConfig.apiKey.trim().length > 0 && instruction.trim().length > 0 && !busy);

  async function run() {
    if (!canRun) return;
    busy = true; error = '';
    try {
      const n = await aiGenerateRecords(schemaId, instruction.trim(), count);
      showToast(`Added ${n} record${n === 1 ? '' : 's'}`);
      onClose();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Generation failed';
    } finally { busy = false; }
  }
</script>

<div class="backdrop" role="button" tabindex="-1" aria-label="Close"
  onclick={onClose} onkeydown={(e) => e.key === 'Escape' && onClose()}></div>
<div class="modal" role="dialog" aria-modal="true" aria-label="Generate records with AI">
  <header>
    <span class="title"><Sparkles size={15} /> Generate records</span>
    <button type="button" class="close" aria-label="Close" onclick={onClose}><X size={16} /></button>
  </header>

  <label class="field">
    <span>Anthropic API key</span>
    <input type="password" value={$aiConfig.apiKey} placeholder="sk-ant-…"
      oninput={(e) => setAiConfig({ apiKey: (e.currentTarget as HTMLInputElement).value })} />
  </label>

  <label class="field">
    <span>Instruction</span>
    <textarea rows="3" bind:value={instruction} placeholder="e.g. 20 common Japanese verbs with English meaning"></textarea>
  </label>

  <label class="field row">
    <span>Count</span>
    <input type="number" min="1" max="50" bind:value={count} />
  </label>

  {#if error}<p class="err">{error}</p>{/if}

  <div class="actions">
    <button type="button" class="ghost" onclick={onClose}>Cancel</button>
    <button type="button" class="primary" disabled={!canRun} onclick={run}>
      <Sparkles size={13} /> {busy ? 'Generating…' : 'Generate'}
    </button>
  </div>
</div>

<style>
  .backdrop { position:fixed; inset:0; background:rgba(0,0,0,.35); z-index:40; }
  .modal { position:fixed; z-index:41; top:50%; left:50%; transform:translate(-50%,-50%);
    width:min(460px,92vw); background:var(--bg); color:var(--text); border:1px solid var(--border);
    border-radius:12px; box-shadow:0 12px 40px rgba(0,0,0,.25); padding:16px; display:flex; flex-direction:column; gap:12px; }
  header { display:flex; align-items:center; justify-content:space-between; }
  .title { display:inline-flex; align-items:center; gap:7px; font-weight:600; }
  .close { border:none; background:transparent; color:var(--text-muted); cursor:pointer; padding:4px; border-radius:6px; }
  .close:hover { background:var(--accent-weak); color:var(--accent); }
  .field { display:flex; flex-direction:column; gap:5px; font-size:12px; color:var(--text-muted); }
  .field.row { flex-direction:row; align-items:center; gap:10px; }
  .field input, .field textarea { font:inherit; color:var(--text); background:var(--sidebar);
    border:1px solid var(--border); border-radius:6px; padding:7px 9px; }
  .field.row input { width:80px; }
  .field textarea { resize:vertical; }
  .field input:focus-visible, .field textarea:focus-visible { outline:2px solid var(--accent); outline-offset:1px; }
  .err { color:#dc2626; font-size:12px; margin:0; }
  .actions { display:flex; justify-content:flex-end; gap:8px; }
  .ghost, .primary { display:inline-flex; align-items:center; gap:6px; border-radius:6px; padding:6px 12px;
    font:inherit; font-size:13px; cursor:pointer; }
  .ghost { border:1px solid var(--border); background:transparent; color:var(--text); }
  .ghost:hover { background:var(--accent-weak); color:var(--accent); }
  .primary { border:1px solid var(--accent); background:var(--accent); color:#fff; font-weight:600; }
  .primary:hover:not(:disabled) { opacity:.92; }
  .primary:disabled { opacity:.5; cursor:default; }
  .ghost:focus-visible, .primary:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
</style>
```

- [ ] **Step 4: Wire into SchemaRecordList** — in `src/lib/modules/flashcards/components/SchemaRecordList.svelte`:
  - add imports: `import Sparkles from 'lucide-svelte/icons/sparkles';` and `import AiGenerateModal from './AiGenerateModal.svelte';`
  - add local state (in `<script>`): `let aiSchemaId = $state<string | null>(null);`
  - in the `.schema-actions` div, add a button after the paste button:
```svelte
            <button type="button" aria-label="ai generate" title="Generate records with AI"
              onclick={() => aiSchemaId = schema.id}><Sparkles size={13} /></button>
```
  - at the end of the top-level `.list` div (after the `{/if}`, before `</div>`), mount:
```svelte
  {#if aiSchemaId}
    <AiGenerateModal schemaId={aiSchemaId} onClose={() => aiSchemaId = null} />
  {/if}
```

- [ ] **Step 5: GREEN + gates** — `npm test -- AiGenerateModal` passes; `npm test` (full green, 0 unhandled — re-run once if EBUSY); `npm run check` (0 errors); `npm run build` (OK).
- [ ] **Step 6: Manual verification (human, morning)** — paste a real Anthropic key, click the ✨ on a schema, enter an instruction, Generate → records appear.
- [ ] **Step 7: Commit** — `git add src/lib/modules/flashcards/components/AiGenerateModal.svelte src/lib/modules/flashcards/components/SchemaRecordList.svelte tests/AiGenerateModal.test.ts && git commit -m "feat(flashcards): AiGenerateModal + Sparkles action on schemas"`

---

## Self-review notes (author)
- Coverage: prompt build + tolerant parse + extractText (T1), generateRecords with injected factory (T2), aiConfig persistence + aiGenerateRecords append (T3, ai mocked), modal validation + generate call (T4, store mocked). Live Anthropic call = human morning (needs key/network).
- Delegation: parse returns loose values; `importRecords`→`migrateRecordFields` (already tested) coerces to each field's locale shape — no re-implementation.
- Isolation: key in localStorage, never in the project doc / history. Anthropic-only; OpenAI + AI edit/chat deferred.
- Testing gap (declared): the real SDK network call + `dangerouslyAllowBrowser` CORS behavior in the webview → human morning verify.
