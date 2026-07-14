# Tomoe Spec #4b — Flashcards Pack-all + Persisted Cards + Status (design)

Date: 2026-07-14
Status: Approved (brainstorming) → ready for implementation plan
Module: `src/lib/modules/flashcards/`
Depends on: Spec #4a (cards gallery + chunking) — merged.

Second slice of roadmap spec #4. #4a made cards a live derived projection
(auto-synced, `3card` auto-chunks 3 records/page). This spec introduces the
**persistence + divergence foundation**: a user can turn a compound schema's
auto-chunked pages into **persisted `Card` snapshots** ("Pack all"), which then
carry a **synced/stale status** and can be **regenerated** or **deleted**. This
foundation is what #4c (escape-hatch card edit + apply card→record) will build on.

## Goal

Let the user commit a compound (`3card`) schema's records into persisted packed
cards, so those groupings are fixed, survive save/reopen, and show whether they
are still in sync with their source records — with a one-click regenerate to
re-pull content. Single-layout cards stay auto-derived (spec #4a), never persisted.

## Scope

**In scope**
- `Card.sourceHash?: string` + a `hashFields` util; packed cards persisted in `project.cards` (already serialized by `serializeProject`/`parseProject`).
- Pure ops (`cardOps.ts`): `packRecords(project, schemaId, recordIds)`, `packAllForSchema(project, schemaId)`, `regenerateCard(project, cardId)`, `deleteCard(project, cardId)`, `isCardStale(card, project)`.
- Store wrappers: `packAllForSchema`, `regenerateCard`, `deleteCard` (undoable via `commit`).
- `CardGallery` changes: a compound schema section gets a **Pack all** button; the gallery renders that schema's **persisted packed cards** (with a synced/stale badge, **Regenerate** when stale, **Delete**) followed by **auto-chunked cards for records not in any packed card** (packed records are excluded from auto → no duplication).
- Save/reopen persists packed cards; status is recomputed on load.

**Out of scope (later)**
- Manual per-record pack selection dialog (dropped — "Pack all" only).
- Editing a card's content directly (escape-hatch edit) + apply card→record — #4c.
- Persisting single-layout cards (stay auto-derived).
- Compound layouts other than `3card`; mixing multiple schemas into one card.

## Model: snapshot + divergence

A packed card is a **snapshot**: `packRecords` builds its `sections`/`images`
(via `recordsToCard`) from the source records at pack time and stores them in
`project.cards`, plus `sourceHash` = `hashFields` of the source records' fields at
build time. Because the content is stored (not re-derived every render), it can
**diverge** from its source records — that divergence is exactly what
`isCardStale` reports (current source hash ≠ stored `sourceHash`) and what
`regenerateCard` resolves (rebuild + restamp). This snapshot model is the
foundation #4c needs (an edited card is a diverged snapshot).

Single-layout cards remain pure derivations (spec #4a) — no snapshot, no status.

## Architecture

Everything under `src/lib/modules/flashcards/`.

```
model.ts                  # MODIFY: Card.sourceHash?: string
lib/hash.ts               # NEW: hashFields(project, recordIds) → string (ported _hashStr)
cardOps.ts                # NEW: packRecords, packAllForSchema, regenerateCard, deleteCard, isCardStale (pure)
stores.ts                 # MODIFY: packAllForSchema, regenerateCard, deleteCard wrappers
components/
  CardGallery.svelte      # MODIFY: render persisted packed cards (status/regen/delete) + Pack all + auto for unpacked
```

### Pure ops (`cardOps.ts`)

- `hashFields(project, recordIds): string` (or in `lib/hash.ts`) — a stable hash of the given records' `fields` (JSON of the relevant records, in id order), ported from flashcard-creator `_hashStr`. Deterministic; used for `sourceHash`.
- `packRecords(project, schemaId, recordIds): Project` — resolve the schema + its template (`cardTemplates[0] ?? deriveAutoTemplate`), chunk `recordIds` by `cardsPerPage(template.layout)`, build one packed `Card` per chunk via `recordsToCard(chunkRecords, …)`, set `packedRecordIds` + `templateId` + `sourceHash` (hash of that chunk), append to `project.cards`. Idempotent-ish: skip records already in an existing packed card of this template (avoid dupes) OR replace — **replace**: remove existing packed cards of this template first, then rebuild (mirrors old app `packRecords`). Immutable.
- `packAllForSchema(project, schemaId): Project` — `packRecords(project, schemaId, <all records of that schema in order>)`.
- `regenerateCard(project, cardId): Project` — for a packed card, re-resolve its records from `packedRecordIds`, rebuild content via `recordsToCard`, restamp `sourceHash`. Immutable.
- `deleteCard(project, cardId): Project` — remove the card from `project.cards`.
- `isCardStale(card, project): boolean` — `hashFields(project, card.packedRecordIds) !== card.sourceHash` (also stale if a source record was deleted).

### Store wrappers (`stores.ts`)

`packAllForSchema(schemaId)`, `regenerateCard(cardId)`, `deleteCard(cardId)` →
`commit(cardOps.x(get(project), …))` (undoable). No new UI-state stores needed.

### CardGallery changes

For each schema:
- **Single layout** → unchanged (auto-derived thumbnails, #4a).
- **Compound (`3card`)**:
  - Section header adds a **Pack all** button → `packAllForSchema(schema.id)`.
  - Compute the set of records already in a persisted packed card of this schema's template (`packedRecordIds` union).
  - Render **persisted packed cards** first: thumbnail via `buildCardHTML` of the stored card (NOT re-derived — render the snapshot), a **status badge** (synced / stale via `isCardStale`), a **Regenerate** button (enabled/prominent when stale), a **Delete** button. Click the thumbnail → open first record in Records view (as #4a).
  - Then render **auto-chunked cards for records NOT in any packed card** (derived, #4a behavior) — so newly-added, not-yet-packed records still appear.

Rendering a persisted packed card: build its HTML from the stored `Card`
(`buildCardHTML(card, settings, activeLocale)`), so a stale card visibly shows its
old content until regenerated — reinforcing the status.

## Data flow

```
Pack all → packAllForSchema → packRecords → recordsToCard(chunk) snapshots + sourceHash
         → commit → project.cards updated → gallery shows packed cards + status
Record edited later → isCardStale(card) true → "stale" badge → Regenerate → rebuild + restamp
Save → serializeProject writes project.cards → reopen → parseProject restores → status recomputed
```

## Error handling / edge cases

- Pack all with 0 records → no-op (no cards created).
- A packed card whose source record was deleted → `isCardStale` true; Regenerate rebuilds from remaining records (fewer cells, padded); if all sources gone, the card renders empty and can be deleted.
- Re-running Pack all → replaces this template's existing packed cards (no accumulation of duplicates).
- Single-layout schema → no Pack all button, no packed cards.
- Undo/redo covers pack/regenerate/delete (they route through `commit`).

## Testing

- `cardOps.test.ts`: `packRecords` (chunking by 3, sourceHash set, packedRecordIds, replace-on-repack), `packAllForSchema`, `isCardStale` (false right after pack; true after editing a source record's field; true after deleting a source record), `regenerateCard` (restamps hash → not stale), `deleteCard`; immutability throughout.
- `hash` util: deterministic + order-stable + changes when a field changes.
- `flashcards-cardstores.test.ts` (extend): pack→undo restores; regenerate/delete commit.
- `CardGallery.test.ts` (extend): Pack all creates persisted cards (assert `get(project).cards.length`); packed records excluded from the auto section (no duplicate thumbnails for packed records); stale badge appears after editing a source record; Regenerate clears it; Delete removes the packed card.
- Persist round-trip (model or io test): a project with packed cards serialize→parse preserves cards incl. `sourceHash`.
- Gates: `npm run check` 0 errors · `npm test` green, 0 unhandled · `npm run build` OK.

## References

- Old app pack logic: `flashcard-creator/src/js/records/pack.js` (`packRecords`, `packAll`, `syncAllPacked`, `_stampPackedRecordIds`) and `_hashStr` in `src/js/core/utils.js`. Ported to pure TS; "Pack all" only (no manual dialog); auto compound mapping (no per-slot mapping UI).
- Reuse `recordsToCard`/`cardsPerPage`/`chunkRecords` (spec #4a, `cardMapping.ts`), `buildCardHTML` (`lib/card-render.ts`), `EmptyState`.
