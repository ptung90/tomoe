# Flashcards — Image auto-fill + Copy-JSON image strip

**Date:** 2026-07-16
**Module:** `src/lib/modules/flashcards`
**Status:** Design approved, ready for implementation plan.

## Motivation

Two related image concerns in the flashcards module:

1. **Copy-JSON is bloated.** The per-schema "Copy records JSON" button
   (`SchemaRecordList.copyJson`) serializes records verbatim. When an image
   field holds a base64 `data:` URL, the copied JSON is huge and useless for
   pasting into an external AI chat. We want the copy to stay compact.

2. **No image auto-fill.** Images are only set manually, one field at a time
   (Pick / Paste / Search / Crop in `ImageField.svelte`). There is no way to
   populate images across many records at once. This is part of roadmap spec 5
   (Images); search + crop are done, batch auto-fill is not.

Base64-vs-URL storage strategy is explicitly **out of scope** for this spec —
we keep the current mixed model (uploads/crops → base64, Wikimedia → remote URL).

## Part A — Copy-JSON image strip

### Behavior

When copying a schema's records as JSON, for every field whose schema type is
`image`:

- If the value is a base64 data URL (starts with `data:`) → replace with the
  literal string `"[image]"`.
- Otherwise (remote `http(s)` URL, or empty) → keep as-is. Remote URLs are short
  and give the AI useful context.

Non-image fields are untouched, including multilingual objects.

### Implementation

- New pure helper in `lib/copyStrip.ts`:
  ```ts
  export function stripImagesForCopy(
    records: RecordItem[], imageKeys: Set<string>,
  ): RecordItem[]
  ```
  Immutable: returns new record objects; only image-typed field values that are
  `data:` URLs are rewritten to `"[image]"`.
- `SchemaRecordList.copyJson` computes `imageKeys` from the schema
  (`fields.filter(f => f.type === 'image')`) and calls the helper before
  `JSON.stringify`.

### Tests (`tests/`)

- `data:` image value → `"[image]"`.
- `http(s)` image value → unchanged.
- empty image value → unchanged (`""`).
- non-image string / multilingual object field → unchanged.
- input records not mutated (immutability).

## Part B — Image auto-fill

### Decisions (locked)

| Aspect | Decision |
|---|---|
| Scope | Fill records whose target image field is **empty**. Records that already have an image are only touched if the user ticks **"Overwrite existing images"** (default off). |
| Pick mode | Auto-take the **top-1** Wikimedia hit. User refines later via existing Search/Crop. |
| Query source | User picks a **text field** each run (dropdown; default = first non-image field, i.e. the title field). |
| Trigger | **Both**: batch button in `SchemaRecordList` schema header, and a per-record button in `RecordDetail`. Same modal; single-record passes a one-element record list. |
| Storage | Remote Wikimedia URL (`hit.full`) — **not** base64. Consistent with the existing Search action. |

### Components

**1. `lib/imageAutofill.ts` (pure, network injected)**

```ts
export interface AutofillOptions {
  queryKey: string;      // schema field key used to build the search query
  imageKey: string;      // target image field key to write
  overwrite: boolean;    // also fill records that already have an image
  locale: string;        // active locale, for resolving the query text
}
export interface AutofillResult {
  updates: { recordId: string; url: string }[];
  filled: number;
  skippedEmptyQuery: number;   // query text was blank
  skippedHasImage: number;     // had image and overwrite=false
  noResult: number;            // search returned [] or errored
}
export function resolveQuery(
  rec: RecordItem, fieldKey: string, locale: string,
): string;   // localized text at locale, fallback to first non-empty; trimmed
export async function autofill(
  records: RecordItem[],
  opts: AutofillOptions,
  search: (q: string) => Promise<ImageHit[]>,
  onProgress?: (done: number, total: number) => void,
): Promise<AutofillResult>;
```

- Iterates **sequentially** (polite to Wikimedia), calling `onProgress` after
  each record.
- Per record: if it already has a non-empty image value and `!overwrite` →
  `skippedHasImage++`, continue. Resolve query; if blank → `skippedEmptyQuery++`,
  continue. `search(query)`; on `[]` **or thrown error** → `noResult++`, continue.
  Else push `{ recordId, url: hits[0].full }`, `filled++`.
- `search` defaults to `searchWikimedia` in the store wiring but is injected in
  tests.

**2. `recordOps.setImageFields` (pure, immutable)**

```ts
export function setImageFields(
  p: Project, updates: { recordId: string; key: string; url: string }[],
): Project;
```

Applies all updates in one immutable pass over `records`. Only the named field
key on each listed record changes.

**3. Store action (`stores.ts`)**

```ts
export function applyImageAutofill(
  updates: { recordId: string; key: string; url: string }[],
): void;   // commit(ops.setImageFields(get(project), updates)) — single undo step
```

No-op (no commit) when `updates` is empty.

**4. `components/AutofillImagesModal.svelte`**

Props: `records: RecordItem[]`, `schema: Schema`, `onClose`, and an injectable
`search = searchWikimedia`.

UI:
- Query-field dropdown: schema's non-image fields (default = first).
- Target image-field dropdown: shown only if the schema has >1 image field;
  otherwise the single image field is used implicitly.
- Checkbox "Overwrite existing images" (default off).
- Summary line: `N records · M without an image`.
- Run button → progress `k / total`; on completion, close and show a toast
  summarizing counts (e.g. `Filled 8 · skipped 2 · no result 1`), then
  `applyImageAutofill(result.updates)`.

**5. Triggers**

- `SchemaRecordList` schema header: new icon button (`wand-sparkles`) next to
  Copy/Paste/AI → opens the modal with `records` = that schema's records.
- `RecordDetail`: new button → opens the modal with `records` = `[currentRecord]`.
- In both places the trigger is **hidden/disabled** when the schema has no image
  field, or no non-image (text) field to build a query from.

### Tests (`tests/`)

- `resolveQuery`: picks the active-locale string; falls back to first non-empty
  when the active locale is blank; returns `""` when all blank; trims.
- `autofill` (with a fake `search`):
  - fills only empty image fields when `overwrite=false`;
  - fills all when `overwrite=true`;
  - `skippedEmptyQuery` when the query field is blank;
  - `noResult` when `search` returns `[]` **and** when `search` throws;
  - `onProgress` called `records.length` times;
  - `updates[i].url === hits[0].full`.
- `setImageFields`: only the target key on listed records changes; other records
  and other fields untouched; input not mutated.

### Edge cases

- Empty `updates` → store action does nothing (no dirty, no undo entry).
- Network error on a single record does not abort the batch.
- Schema with no image field → triggers hidden.
- Schema with no text field → triggers hidden (cannot build a query).

## Non-goals

- Changing the base64-vs-URL storage model.
- Image providers other than Wikimedia.
- Attribution/licensing capture (the `CardImage.attribution`/`search_query`
  fields stay unused here).
- Concurrency/rate-limit tuning beyond sequential requests.
