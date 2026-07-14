# Tomoe Spec #7 — Flashcards AI (generate records) (design)

Date: 2026-07-14 (autonomous overnight run; decisions made without interactive brainstorming — see overnight plan doc).
Status: Approved-by-delegation → ready for implementation plan
Module: `src/lib/modules/flashcards/`
Depends on: specs #2 (records/schema), record ops merged.

## Goal

Let the user generate flashcard **records** for a schema from a natural-language
instruction, using their own Anthropic API key. E.g. "20 common Japanese verbs
with English meaning" → 20 records added to the schema, ready to edit and pack
into cards.

## Scope

**In scope**
- `lib/ai.ts`:
  - `AiConfig = { apiKey: string; model: string }` (default model `claude-opus-4-8`).
  - `buildRecordsPrompt(schema, instruction, count, locales): { system: string; user: string }` — pure. System explains the schema's fields (key/label/type/multilingual) + a strict JSON output contract; user carries the instruction + count.
  - `parseGeneratedRecords(raw, schema): RecordItem[]` — pure, **tolerant**: strips ```` ```json ```` fences, extracts the first JSON array, keeps only schema field keys, values passed through as `LocalizedText` (string or `{locale: value}`). Returns loose `RecordItem`s (`id:''`, `fieldsHash:''`); malformed/non-array → throws.
  - `generateRecords(cfg, schema, instruction, count, locales, factory?): Promise<RecordItem[]>` — builds the prompt, calls Anthropic via an **injectable `factory(apiKey) → client`** (default = `@anthropic-ai/sdk` with `dangerouslyAllowBrowser: true`), extracts the response text, delegates to `parseGeneratedRecords`.
- `stores.ts`: `aiConfig` writable (persisted to `localStorage`), `setAiConfig(patch)`, and `aiGenerateRecords(schemaId, instruction, count): Promise<number>` — calls `generateRecords` then `importRecords(schemaId, recs, 'append')` (which normalizes ids + runs `migrateRecordFields` to coerce each value to the field's locale shape). Returns count added.
- `components/AiGenerateModal.svelte`: API-key input (persisted), instruction textarea, count, Generate (loading/error/disabled states) → `aiGenerateRecords` → toast + close.
- `SchemaRecordList.svelte`: a per-schema **Sparkles** action → opens `AiGenerateModal` for that schema.

**Out of scope**
- OpenAI / other providers (the claude-api skill produces Anthropic SDK code and discourages provider shims; Tomoe CLAUDE.md defaults Anthropic). Deferred.
- AI **edit/rewrite** of an existing record/field, a chat panel, streaming, follow-up suggestions, structured-outputs (`output_config.format`) — the tolerant prompt+parse path is provider-shape-independent and fully unit-testable. Deferred.
- Persisting the key in the project file (secrets stay in `localStorage`, never in `.tomoe.json`).

## Decisions (made autonomously)

- **Anthropic only, user's own key, `claude-opus-4-8`.** The user pastes their key (stored in `localStorage`, app-scoped). Browser/webview call uses `@anthropic-ai/sdk` with `dangerouslyAllowBrowser: true` (the app is a local desktop app calling with the user's own key). Cannot be run live autonomously — built + unit-tested with an **injected fake factory** (no network).
- **Prompt-instructed JSON + tolerant pure parse** (not `output_config.format`). Robust to stray prose/fences and independent of the structured-output beta shape; the parse is pure and thoroughly tested. Locale-shape coercion is **not** re-implemented — `parseGeneratedRecords` returns loose values and `importRecords`→`migrateRecordFields` (already tested) coerces them.
- **Generate = append** to the schema (never overwrite). Records land as normal editable records; the user reviews/edits then packs into cards via the existing flow.
- **Key never touches the project.** `aiConfig` lives in `localStorage`, separate from the undoable document.

## Architecture

```
src/lib/modules/flashcards/
  lib/ai.ts                  # NEW: AiConfig, buildRecordsPrompt, parseGeneratedRecords, generateRecords(factory?)
  stores.ts                  # MODIFY: aiConfig (localStorage) + setAiConfig + aiGenerateRecords
  components/
    AiGenerateModal.svelte   # NEW: key + instruction + count → generate
    SchemaRecordList.svelte  # MODIFY: Sparkles action opens the modal per schema
package.json                 # MODIFY: + @anthropic-ai/sdk
```

- Network happens only inside `generateRecords`, behind an injectable factory → the prompt-build + response-parse logic is unit-testable with no network and no key.
- The modal owns its local open state inside `SchemaRecordList` (`aiSchemaId`), consistent with how the schema editor / paste flow are triggered.

## Data flow

```
SchemaRecordList "AI" (Sparkles) → AiGenerateModal(schemaId)
  → Generate → aiGenerateRecords(schemaId, instruction, count)
      → generateRecords(aiConfig, schema, instruction, count, locales)   [Anthropic]
      → parseGeneratedRecords(text, schema)                              [pure]
      → importRecords(schemaId, recs, 'append')  → migrateRecordFields   [coerce locales]
  → toast "Added N records" → close
```

## Error handling / edge cases

- No API key / empty instruction → Generate disabled (modal validates).
- Network / auth / parse failure → caught in the modal, shown as an inline error (no crash); the key is not cleared.
- Model returns fewer/more than `count` → accept what parses (count is a hint in the prompt, not enforced).
- Values as plain strings or `{locale: val}` objects both work — `migrateRecordFields` broadcasts a string across locales and maps an object per-locale.

## Testing

- `ai.test.ts`: `buildRecordsPrompt` includes each field key + the instruction + count; `parseGeneratedRecords` parses a plain array, a fenced ```` ```json ```` block, drops unknown keys, and throws on non-JSON / non-array; `generateRecords` with an **injected fake factory** (canned `messages.create` returning a JSON array in a text block) → returns parsed `RecordItem[]`, no network.
- `flashcards-ai-store.test.ts`: `setAiConfig` persists to `localStorage` and updates `aiConfig`; `aiGenerateRecords` (with `ai.generateRecords` mocked via `vi.mock`) appends the returned records to the schema and returns the count.
- `AiGenerateModal.test.ts`: renders key + instruction + count; Generate is disabled with no key or no instruction; with both present, clicking Generate calls the (mocked) `aiGenerateRecords`.
- Gates: `npm run check` 0 errors · `npm test` green, 0 unhandled · `npm run build` OK.
- **Manual (human, morning):** paste a real Anthropic key, run a generate, confirm records appear. (Live network + key — cannot be verified autonomously.)

## References

- flashcard-creator `src/js/records/ai.js` (`aiGenerateRecords`, prompt shape) — ported to TS, Anthropic-only, tolerant parse.
- Reuse `recordOps.importRecords`/`migrateRecordFields` (locale coercion), `model.ts` types, `ImageField`-style modal patterns, Calm Paper tokens, lucide subpath icons. `@anthropic-ai/sdk` per the claude-api skill (TS → official SDK; `dangerouslyAllowBrowser` for the desktop webview).
