# Tomoe Spec #4c — Flashcards Escape-hatch Card Edit + Apply card→record (design)

Date: 2026-07-14
Status: Approved (brainstorming) → ready for implementation plan
Module: `src/lib/modules/flashcards/`
Depends on: Spec #4b (pack-all + persisted cards + status) — merged.

Final slice of roadmap spec #4. #4b made packed cards persisted snapshots with a
synced/stale status; this spec lets the user **edit a packed card's content
directly** (its escape hatch) and **apply those edits back to the source
records** (reverse of the pack mapping). This completes the record ⇄ card loop.

## Goal

Let the user open a persisted packed card and edit the full content of each cell
— label, content, and image — independently of the source records, then either
**Apply to records** (push the edits back into the mapped record fields) or
**Regenerate** (discard the edits and re-pull from records). An edited card is
flagged **Edited**; the existing **Stale** (source changed) and **Synced**
states from #4b remain.

## Scope

**In scope**
- `Card.edited?: boolean`.
- `CardEditorModal.svelte`: edit each cell of a packed card — `label` (`<input>`), `content` (`RichText`, Markdown), `image` (`ImageField`: URL / paste / pick-file). Save persists to `project.cards` (commit) and sets `edited=true`.
- Pure `cardOps` additions: `setCardCell(project, cardId, i, patch)`, `applyCardToRecords(project, cardId)`; `regenerateCard` also clears `edited`.
- Apply card→record (reverse of the compound auto-map): cell `i` → record `packedRecordIds[i]`; label → first text field, content → second text field, image → first image field; text written to `activeLocale`; then restamp `sourceHash` + `edited=false`.
- CardGallery: **Edit** button on every packed card; **Apply to records** when `edited`; badge shows Edited / Stale / Synced; existing Regenerate/Delete stay (Regenerate now also clears `edited`).

**Out of scope (later)**
- Per-card appearance overrides (layout / orientation / split / font / border) — not editable here; not mapped to records.
- Editing single-layout (auto-derived) cards — edit their record instead.
- Image search / crop — #5 (this uses the existing URL/paste/pick `ImageField`).
- Applying appearance; multi-locale apply (writes the active locale only).

## Model: three directions of divergence

A packed card is a stored snapshot. It can differ from its source records two ways:
- **Source changed** (card behind) → `isCardStale` true → **Stale**. Resolve with Regenerate (record→card).
- **Manually edited** (card ahead) → `edited` true → **Edited**. Resolve with Apply (card→record) or Regenerate (discard).
- Neither → **Synced**.

Badge precedence: `edited ? 'Edited' : isCardStale ? 'Stale' : 'Synced'`. Both
Apply and Regenerate restamp `sourceHash` and clear `edited`, returning to Synced.

## Architecture

Everything under `src/lib/modules/flashcards/`.

```
model.ts                  # MODIFY: Card.edited?: boolean
cardOps.ts                # MODIFY: setCardCell, applyCardToRecords; regenerateCard clears edited
stores.ts                 # MODIFY: setCardCell, applyCardToRecords wrappers; cardEditorOpen UI store
components/
  CardEditorModal.svelte  # NEW: per-cell label + content (RichText) + image (ImageField)
  CardGallery.svelte      # MODIFY: Edit button (opens editor); Apply to records when edited; Edited badge
```

### Pure ops (`cardOps.ts`)

- `setCardCell(project, cardId, i, patch: { label?: string; content?: string; image?: string }): Project` — update `card.sections[i].label/content` and/or the `card.images` entry for `slot === i` (set/replace url; remove the entry when `image === ''`); set `card.edited = true`. Immutable. No-op if card/cell absent.
- `applyCardToRecords(project, cardId): Project` — for a packed card, resolve schema via `schemaForCard` + its template; for each cell `i` with a source record `packedRecordIds[i]`, write back via the reverse auto-map: label → first text field, content → second text field, image → first image field. Text fields: write to `activeLocale` if the field value is a multilingual object, else set the plain string. Image field: set the plain string. Then restamp `sourceHash = hashFields(project, packedRecordIds)` and set `edited = false`. Immutable; touches only the mapped records + the card.
- `regenerateCard` (existing): additionally set `edited = false` on the rebuilt card.
- Reverse mapping mirrors `recordsToCard`'s compound auto-map (label = first text field, content = second text field, image = first image field) so apply is the exact inverse of pack.

### Store wrappers + UI store (`stores.ts`)

- `cardEditorOpen: Writable<string | null>` (card id being edited; UI-only, not in history).
- `setCardCell(cardId, i, patch)`, `applyCardToRecords(cardId)` → `commit(cardOps.x(get(project), …))` (undoable). `regenerateCard`/`deleteCard` already exist.

### CardEditorModal

- Renders when `$cardEditorOpen` matches a card. Header (title + close). Body: one row per cell (by `packedRecordIds` length / sections), each with: label `<input>`, content `<RichText value onChange>`, image `<ImageField value onChange>`. Edits call `setCardCell(cardId, i, patch)` (debounced text like RecordDetail via `keyedDebounce`; image immediate). Footer: **Apply to records** (confirm) + **Close**. Follows the SchemaEditorModal/ConfigModal pattern + Calm Paper tokens.

### CardGallery changes

- Packed card actions: add **Edit** (sets `cardEditorOpen`), **Apply to records** (shown when `edited`, confirm then `applyCardToRecords`). Badge computes Edited/Stale/Synced. Regenerate stays (shown when Stale or Edited). Delete stays. Mount `<CardEditorModal />` (once, in CardGallery or Workspace).

## Data flow

```
Edit → CardEditorModal → setCardCell → commit → card.sections/images updated + edited=true → badge "Edited"
Apply to records → applyCardToRecords → reverse-map into source record fields (activeLocale) + restamp + edited=false
Regenerate → rebuild from records + restamp + edited=false (discards edits)
Save → project.cards (incl. edited) round-trips; reopen recomputes status
```

## Error handling / edge cases

- Apply on a card whose source record was deleted → skip that cell's write (no record to write to); other cells still apply.
- Apply confirm dialog (overwrites record fields). Cancel → no change.
- Editing an image to empty → removes that cell's image (card shows placeholder); apply writes empty string to the record's image field.
- Regenerate on an edited card → discards edits (re-pull from records), clears `edited` — the "revert" path.
- A card both edited and source-changed → badge shows Edited (precedence); Apply pushes the edit, Regenerate discards to current records.
- Single-layout cards → no Edit/Apply (not packed/persisted).

## Testing

- `cardOps.test.ts` (extend): `setCardCell` (updates label/content, adds/replaces/removes image, sets `edited`); `applyCardToRecords` (writes label→first text field, content→second text field, image→first image field of the right record, at `activeLocale`; restamps `sourceHash`; clears `edited`; skips deleted-record cells); `regenerateCard` clears `edited`.
- `stores` (extend): `setCardCell`/`applyCardToRecords` undoable; `cardEditorOpen` toggles.
- `CardEditorModal.test.ts`: renders a cell's label/image inputs for a packed card (text/image only — avoid mounting RichText/TipTap in jsdom, per spec #3 convention); editing the label commits via `setCardCell` and sets `edited`.
- `CardGallery.test.ts` (extend): Edit button sets `cardEditorOpen`; Apply appears only when `edited`; clicking Apply writes back to the record (assert a record field changed) and clears the Edited badge.
- Round-trip: a project with an edited packed card serialize→parse preserves `edited` + content.
- Gates: `npm run check` 0 errors · `npm test` green, 0 unhandled · `npm run build` OK.

## References

- Old app reverse mapping: `flashcard-creator/src/js/records/pack.js` `applyCardToRecord` (single + compound; compound writes each section/image back to its stamped `recordId`). Ported to a pure op; compound only; auto-mapped (no per-slot mapping UI).
- Reuse `RichText`, `ImageField` (spec #2/#3), `recordsToCard`/`schemaForCard`/`hashFields` (spec #4a/#4b), `keyedDebounce`, `buildCardHTML`, `EmptyState`.
