# Image auto-fill + Copy-JSON image strip — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add batch image auto-fill (Wikimedia top-1 per record) to the flashcards module, and make the per-schema "Copy records JSON" strip base64 images so it stays compact for AI.

**Architecture:** Pure, injectable core (`lib/copyStrip.ts`, `lib/imageAutofill.ts`) tested in isolation; an immutable record op (`recordOps.setImageFields`) committed as a single undo step via a store action (`applyImageAutofill`); one reusable modal (`AutofillImagesModal.svelte`) wired to two triggers (schema header + record detail). Network is `searchWikimedia`, injected everywhere for tests.

**Tech Stack:** Svelte 5 (runes), TypeScript, Vitest + @testing-library/svelte, Tauri v2. Icons via `lucide-svelte/icons/<name>` subpath only.

## Global Constraints

- Design system "Calm Paper": style with tokens (`var(--accent)`, `var(--border)`, `var(--surface)`, `var(--text)`, `var(--text-muted)`, `var(--accent-weak)`), never hardcoded hex.
- lucide icons: subpath imports only (`lucide-svelte/icons/wand-sparkles`), never the barrel.
- `npm run check` must be 0 errors; `npm test` must be green.
- Image auto-fill stores the **remote** Wikimedia URL (`hit.full`), never base64.
- Base64-vs-URL storage model is out of scope — do not change it.
- Commit after each task.

---

### Task 1: Copy-JSON image strip

**Files:**
- Create: `src/lib/modules/flashcards/lib/copyStrip.ts`
- Test: `tests/copyStrip.test.ts`
- Modify: `src/lib/modules/flashcards/components/SchemaRecordList.svelte` (`copyJson`, ~line 30-36)

**Interfaces:**
- Consumes: `RecordItem` from `../model`.
- Produces: `stripImagesForCopy(records: RecordItem[], imageKeys: Set<string>): RecordItem[]`.

- [ ] **Step 1: Write the failing test**

Create `tests/copyStrip.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { stripImagesForCopy } from '../src/lib/modules/flashcards/lib/copyStrip';
import type { RecordItem } from '../src/lib/modules/flashcards/model';

function rec(fields: RecordItem['fields']): RecordItem {
  return { id: 'r1', schemaId: 's1', fieldsHash: '', fields };
}

describe('stripImagesForCopy', () => {
  const imageKeys = new Set(['pic']);

  it('replaces a base64 data URL in an image field with "[image]"', () => {
    const out = stripImagesForCopy([rec({ pic: 'data:image/png;base64,AAAA' })], imageKeys);
    expect(out[0].fields.pic).toBe('[image]');
  });

  it('keeps a remote http(s) URL in an image field unchanged', () => {
    const out = stripImagesForCopy([rec({ pic: 'https://x/a.jpg' })], imageKeys);
    expect(out[0].fields.pic).toBe('https://x/a.jpg');
  });

  it('keeps an empty image field unchanged', () => {
    const out = stripImagesForCopy([rec({ pic: '' })], imageKeys);
    expect(out[0].fields.pic).toBe('');
  });

  it('leaves non-image string and multilingual fields untouched', () => {
    const out = stripImagesForCopy(
      [rec({ title: { en: 'Owl', vi: 'Cú' }, note: 'data:image/png;base64,ZZ' })],
      imageKeys,
    );
    expect(out[0].fields.title).toEqual({ en: 'Owl', vi: 'Cú' });
    expect(out[0].fields.note).toBe('data:image/png;base64,ZZ'); // 'note' is not an image key
  });

  it('does not mutate the input records', () => {
    const input = [rec({ pic: 'data:image/png;base64,AAAA' })];
    stripImagesForCopy(input, imageKeys);
    expect(input[0].fields.pic).toBe('data:image/png;base64,AAAA');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- copyStrip`
Expected: FAIL — cannot resolve `stripImagesForCopy` / module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/modules/flashcards/lib/copyStrip.ts`:

```ts
import type { RecordItem } from '../model';

/** Return copies of `records` with base64 image-field values replaced by the
 *  literal "[image]". Only fields whose key is in `imageKeys` are considered,
 *  and only `data:` URLs are rewritten — remote URLs and empty values are kept
 *  (short + useful as context). Non-image fields are never touched. Immutable. */
export function stripImagesForCopy(records: RecordItem[], imageKeys: Set<string>): RecordItem[] {
  return records.map((r) => {
    const fields: RecordItem['fields'] = {};
    for (const [k, v] of Object.entries(r.fields)) {
      fields[k] = imageKeys.has(k) && typeof v === 'string' && v.startsWith('data:') ? '[image]' : v;
    }
    return { ...r, fields };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- copyStrip`
Expected: PASS (5 tests).

- [ ] **Step 5: Wire into `SchemaRecordList.copyJson`**

In `src/lib/modules/flashcards/components/SchemaRecordList.svelte`, add the import near the other imports:

```ts
  import { stripImagesForCopy } from '../lib/copyStrip';
```

Replace the `copyJson` function (currently lines ~30-36):

```ts
  async function copyJson(schemaId: string) {
    const schema = $project.schemas.find((s) => s.id === schemaId);
    const imageKeys = new Set((schema?.fields ?? []).filter((f) => f.type === 'image').map((f) => f.key));
    const recs = stripImagesForCopy($project.records.filter((r) => r.schemaId === schemaId), imageKeys);
    try {
      await navigator.clipboard.writeText(JSON.stringify(recs, null, 2));
      showToast('Records copied as JSON');
    } catch { showToast('Could not access clipboard', 'error'); }
  }
```

- [ ] **Step 6: Run check + full tests**

Run: `npm run check` → Expected: 0 errors.
Run: `npm test -- copyStrip SchemaRecordList` → Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/modules/flashcards/lib/copyStrip.ts tests/copyStrip.test.ts src/lib/modules/flashcards/components/SchemaRecordList.svelte
git commit -m "feat: strip base64 images from Copy-JSON output"
```

---

### Task 2: Auto-fill core (`lib/imageAutofill.ts`)

**Files:**
- Create: `src/lib/modules/flashcards/lib/imageAutofill.ts`
- Test: `tests/imageAutofill.test.ts`

**Interfaces:**
- Consumes: `RecordItem` from `../model`; `ImageHit` from `./imageSearch`.
- Produces:
  - `resolveQuery(rec: RecordItem, fieldKey: string, locale: string): string`
  - `AutofillOptions = { queryKey: string; imageKey: string; overwrite: boolean; locale: string }`
  - `AutofillResult = { updates: { recordId: string; url: string }[]; filled: number; skippedEmptyQuery: number; skippedHasImage: number; noResult: number }`
  - `autofill(records, opts, search, onProgress?): Promise<AutofillResult>` where `search: (q: string) => Promise<ImageHit[]>` and `onProgress?: (done: number, total: number) => void`.

- [ ] **Step 1: Write the failing test**

Create `tests/imageAutofill.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { resolveQuery, autofill } from '../src/lib/modules/flashcards/lib/imageAutofill';
import type { RecordItem } from '../src/lib/modules/flashcards/model';
import type { ImageHit } from '../src/lib/modules/flashcards/lib/imageSearch';

const hit = (u: string): ImageHit => ({ thumb: u + '_t', full: u, title: 't' });
function rec(id: string, fields: RecordItem['fields']): RecordItem {
  return { id, schemaId: 's1', fieldsHash: '', fields };
}

describe('resolveQuery', () => {
  it('returns the active-locale string of a multilingual field, trimmed', () => {
    expect(resolveQuery(rec('r', { title: { en: '  Owl ', vi: 'Cú' } }), 'title', 'en')).toBe('Owl');
  });
  it('falls back to the first non-empty locale when active is blank', () => {
    expect(resolveQuery(rec('r', { title: { en: '', vi: 'Cú' } }), 'title', 'en')).toBe('Cú');
  });
  it('handles a plain string field', () => {
    expect(resolveQuery(rec('r', { title: 'Owl' }), 'title', 'en')).toBe('Owl');
  });
  it('returns "" when all values are blank or missing', () => {
    expect(resolveQuery(rec('r', { title: { en: '', vi: '' } }), 'title', 'en')).toBe('');
    expect(resolveQuery(rec('r', {}), 'title', 'en')).toBe('');
  });
});

describe('autofill', () => {
  const opts = { queryKey: 'title', imageKey: 'pic', overwrite: false, locale: 'en' };

  it('fills only records whose image field is empty when overwrite=false', async () => {
    const records = [
      rec('a', { title: { en: 'Owl' }, pic: '' }),
      rec('b', { title: { en: 'Cat' }, pic: 'https://old/x.jpg' }),
    ];
    const search = vi.fn(async (q: string) => [hit('https://img/' + q + '.jpg')]);
    const res = await autofill(records, opts, search);
    expect(res.updates).toEqual([{ recordId: 'a', url: 'https://img/Owl.jpg' }]);
    expect(res.filled).toBe(1);
    expect(res.skippedHasImage).toBe(1);
    expect(search).toHaveBeenCalledTimes(1);
  });

  it('fills records that already have an image when overwrite=true', async () => {
    const records = [rec('b', { title: { en: 'Cat' }, pic: 'https://old/x.jpg' })];
    const search = vi.fn(async () => [hit('https://img/cat.jpg')]);
    const res = await autofill(records, { ...opts, overwrite: true }, search);
    expect(res.updates).toEqual([{ recordId: 'b', url: 'https://img/cat.jpg' }]);
    expect(res.filled).toBe(1);
  });

  it('counts skippedEmptyQuery when the query field is blank', async () => {
    const records = [rec('a', { title: { en: '' }, pic: '' })];
    const search = vi.fn(async () => [hit('https://img/x.jpg')]);
    const res = await autofill(records, opts, search);
    expect(res.skippedEmptyQuery).toBe(1);
    expect(res.filled).toBe(0);
    expect(search).not.toHaveBeenCalled();
  });

  it('counts noResult when search returns [] or throws', async () => {
    const records = [rec('a', { title: { en: 'Owl' }, pic: '' }), rec('b', { title: { en: 'Cat' }, pic: '' })];
    const search = vi.fn()
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('network'));
    const res = await autofill(records, opts, search);
    expect(res.noResult).toBe(2);
    expect(res.filled).toBe(0);
    expect(res.updates).toEqual([]);
  });

  it('reports progress once per record', async () => {
    const records = [rec('a', { title: { en: 'Owl' }, pic: '' }), rec('b', { title: { en: 'Cat' }, pic: '' })];
    const onProgress = vi.fn();
    await autofill(records, opts, vi.fn(async () => [hit('https://img/x.jpg')]), onProgress);
    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenLastCalledWith(2, 2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- imageAutofill`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/modules/flashcards/lib/imageAutofill.ts`:

```ts
import type { RecordItem } from '../model';
import type { ImageHit } from './imageSearch';

export interface AutofillOptions {
  queryKey: string;   // schema field key used to build the search query
  imageKey: string;   // target image field key to write
  overwrite: boolean; // also fill records that already have an image
  locale: string;     // active locale, for resolving the query text
}
export interface AutofillResult {
  updates: { recordId: string; url: string }[];
  filled: number;
  skippedEmptyQuery: number;
  skippedHasImage: number;
  noResult: number;
}

/** Resolve a record field to a plain query string: the active-locale value of a
 *  multilingual field, falling back to the first non-empty locale, then "". */
export function resolveQuery(rec: RecordItem, fieldKey: string, locale: string): string {
  const v = rec.fields[fieldKey];
  if (typeof v === 'string') return v.trim();
  if (v && typeof v === 'object') {
    const at = (v[locale] ?? '').trim();
    if (at) return at;
    for (const val of Object.values(v)) { const s = String(val ?? '').trim(); if (s) return s; }
  }
  return '';
}

/** Sequentially search an image for each record and collect top-1 hits. Never
 *  throws: a per-record search error counts as noResult and the batch continues. */
export async function autofill(
  records: RecordItem[],
  opts: AutofillOptions,
  search: (q: string) => Promise<ImageHit[]>,
  onProgress?: (done: number, total: number) => void,
): Promise<AutofillResult> {
  const res: AutofillResult = { updates: [], filled: 0, skippedEmptyQuery: 0, skippedHasImage: 0, noResult: 0 };
  const total = records.length;
  let done = 0;
  for (const rec of records) {
    const existing = rec.fields[opts.imageKey];
    const hasImage = typeof existing === 'string' && existing.trim() !== '';
    if (hasImage && !opts.overwrite) {
      res.skippedHasImage += 1;
    } else {
      const query = resolveQuery(rec, opts.queryKey, opts.locale);
      if (!query) {
        res.skippedEmptyQuery += 1;
      } else {
        try {
          const hits = await search(query);
          if (hits.length > 0) { res.updates.push({ recordId: rec.id, url: hits[0].full }); res.filled += 1; }
          else res.noResult += 1;
        } catch { res.noResult += 1; }
      }
    }
    done += 1;
    onProgress?.(done, total);
  }
  return res;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- imageAutofill`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/modules/flashcards/lib/imageAutofill.ts tests/imageAutofill.test.ts
git commit -m "feat: image auto-fill core (resolveQuery + autofill)"
```

---

### Task 3: `setImageFields` op + `applyImageAutofill` store action

**Files:**
- Modify: `src/lib/modules/flashcards/recordOps.ts` (append)
- Modify: `src/lib/modules/flashcards/stores.ts` (append a Record action)
- Test: `tests/recordOps.test.ts` (append), `tests/flashcards-stores.test.ts` (append)

**Interfaces:**
- Consumes: `Project`, `RecordItem` from `./model`; `commit`, `project` from `stores.ts`.
- Produces:
  - `recordOps.setImageFields(p: Project, updates: { recordId: string; key: string; url: string }[]): Project`
  - `stores.applyImageAutofill(updates: { recordId: string; key: string; url: string }[]): void`

- [ ] **Step 1: Write the failing op test**

Append to `tests/recordOps.test.ts`:

```ts
describe('recordOps.setImageFields', () => {
  it('sets only the target key on listed records, leaves others untouched, immutably', () => {
    const { p } = withSchema();
    const a = ops.addRecord(p, 's1');
    const b = ops.addRecord(a.project, 's1');
    const p2 = ops.setImageFields(b.project, [{ recordId: a.id, key: 'pic', url: 'https://x/a.jpg' }]);
    expect(p2.records[0].fields.pic).toBe('https://x/a.jpg');
    expect(p2.records[0].fields.title).toEqual({ en: '', vi: '' }); // other field untouched
    expect(p2.records[1].fields.pic).toBe(''); // other record untouched
    expect(b.project.records[0].fields.pic).toBe(''); // input not mutated
  });

  it('ignores updates whose recordId is unknown', () => {
    const { p } = withSchema();
    const a = ops.addRecord(p, 's1');
    const p2 = ops.setImageFields(a.project, [{ recordId: 'nope', key: 'pic', url: 'https://x/a.jpg' }]);
    expect(p2.records[0].fields.pic).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- recordOps`
Expected: FAIL — `ops.setImageFields is not a function`.

- [ ] **Step 3: Implement the op**

Append to `src/lib/modules/flashcards/recordOps.ts`:

```ts
/** Set image-field values on records in one immutable pass. Each update writes
 *  `url` to `key` on the record with `recordId`; unknown recordIds are ignored. */
export function setImageFields(
  p: Project, updates: { recordId: string; key: string; url: string }[],
): Project {
  if (updates.length === 0) return p;
  const byId = new Map<string, { key: string; url: string }[]>();
  for (const u of updates) {
    const list = byId.get(u.recordId) ?? [];
    list.push({ key: u.key, url: u.url });
    byId.set(u.recordId, list);
  }
  const records = p.records.map((r) => {
    const ups = byId.get(r.id);
    if (!ups) return r;
    const fields = { ...r.fields };
    for (const { key, url } of ups) fields[key] = url;
    return { ...r, fields };
  });
  return { ...p, records };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- recordOps`
Expected: PASS.

- [ ] **Step 5: Write the failing store test**

Append to `tests/flashcards-stores.test.ts` (follow the file's existing import/setup style — it already imports from `../src/lib/modules/flashcards/stores`; add `applyImageAutofill` to that import and `get` from `svelte/store` if not present):

```ts
describe('applyImageAutofill', () => {
  it('commits image updates as one undo step, and no-ops on empty', () => {
    const p = newProject();
    const schema: Schema = { id: 's1', name: 'W', cardTemplates: [], fields: [
      { id: 'f1', key: 'title', label: 'T', type: 'text', multilingual: true },
      { id: 'f2', key: 'pic', label: 'P', type: 'image' },
    ] };
    p.schemas.push(schema);
    p.records.push({ id: 'r1', schemaId: 's1', fieldsHash: '', fields: { title: { en: 'Owl', vi: '' }, pic: '' } });
    stores.loadProject(p, null);

    stores.applyImageAutofill([]); // empty → no commit, stays clean
    expect(get(stores.dirty)).toBe(false);

    stores.applyImageAutofill([{ recordId: 'r1', key: 'pic', url: 'https://x/a.jpg' }]);
    expect(get(stores.project).records[0].fields.pic).toBe('https://x/a.jpg');
    expect(get(stores.dirty)).toBe(true);

    stores.undo();
    expect(get(stores.project).records[0].fields.pic).toBe('');
  });
});
```

> If `tests/flashcards-stores.test.ts` imports the store as `import * as stores`, use `stores.` as above; if it imports named functions, mirror that style and drop the `stores.` prefix. Match the file — do not add a second import block.

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- flashcards-stores`
Expected: FAIL — `applyImageAutofill` not exported.

- [ ] **Step 7: Implement the store action**

In `src/lib/modules/flashcards/stores.ts`, in the "Record actions" section (after `setField`, ~line 209), add:

```ts
export function applyImageAutofill(updates: { recordId: string; key: string; url: string }[]): void {
  if (updates.length === 0) return;
  commit(ops.setImageFields(get(project), updates));
}
```

(`ops`, `commit`, `project`, and `get` are already imported in this file.)

- [ ] **Step 8: Run tests + check**

Run: `npm test -- recordOps flashcards-stores` → Expected: PASS.
Run: `npm run check` → Expected: 0 errors.

- [ ] **Step 9: Commit**

```bash
git add src/lib/modules/flashcards/recordOps.ts src/lib/modules/flashcards/stores.ts tests/recordOps.test.ts tests/flashcards-stores.test.ts
git commit -m "feat: setImageFields op + applyImageAutofill store action"
```

---

### Task 4: `AutofillImagesModal.svelte`

**Files:**
- Create: `src/lib/modules/flashcards/components/AutofillImagesModal.svelte`
- Test: `tests/AutofillImagesModal.test.ts`

**Interfaces:**
- Consumes: `autofill` from `../lib/imageAutofill`; `searchWikimedia` from `../lib/imageSearch`; `project`, `applyImageAutofill` from `../stores`; `showToast` from `../../../shell`; `Schema`, `RecordItem` from `../model`.
- Props: `{ records: RecordItem[]; schema: Schema; onClose: () => void; search?: typeof searchWikimedia }`.
- Produces: a modal UI; on Run, writes URLs via `applyImageAutofill` and calls `onClose`.

- [ ] **Step 1: Write the failing test**

Create `tests/AutofillImagesModal.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/svelte';
import { get } from 'svelte/store';
import AutofillImagesModal from '../src/lib/modules/flashcards/components/AutofillImagesModal.svelte';
import * as stores from '../src/lib/modules/flashcards/stores';
import { newProject, type Project, type Schema } from '../src/lib/modules/flashcards/model';

function setup(): { project: Project; schema: Schema } {
  const project = newProject();
  const schema: Schema = { id: 's1', name: 'W', cardTemplates: [], fields: [
    { id: 'f1', key: 'title', label: 'Title', type: 'text', multilingual: true },
    { id: 'f2', key: 'pic', label: 'Pic', type: 'image' },
  ] };
  project.schemas.push(schema);
  project.records.push(
    { id: 'a', schemaId: 's1', fieldsHash: '', fields: { title: { en: 'Owl', vi: '' }, pic: '' } },
    { id: 'b', schemaId: 's1', fieldsHash: '', fields: { title: { en: 'Cat', vi: '' }, pic: '' } },
  );
  stores.loadProject(project, null);
  return { project, schema };
}

describe('AutofillImagesModal', () => {
  beforeEach(() => setup());

  it('runs auto-fill, writes top-1 urls to the store, and closes', async () => {
    const schema = get(stores.project).schemas[0];
    const records = get(stores.project).records;
    const search = vi.fn(async (q: string) => [{ thumb: q + '_t', full: 'https://img/' + q + '.jpg', title: q }]);
    const onClose = vi.fn();
    render(AutofillImagesModal, { records, schema, onClose, search });

    await fireEvent.click(screen.getByRole('button', { name: /fill|run/i }));
    // let the sequential async run settle
    await new Promise((r) => setTimeout(r, 0));

    expect(search).toHaveBeenCalledTimes(2);
    expect(get(stores.project).records[0].fields.pic).toBe('https://img/Owl.jpg');
    expect(get(stores.project).records[1].fields.pic).toBe('https://img/Cat.jpg');
    expect(onClose).toHaveBeenCalled();
  });

  it('lets the user pick the query field', async () => {
    const schema = get(stores.project).schemas[0];
    const records = get(stores.project).records;
    render(AutofillImagesModal, { records, schema, onClose: vi.fn(), search: vi.fn(async () => []) });
    // only non-image fields are options
    const opts = Array.from(screen.getByLabelText(/query field/i).querySelectorAll('option')).map((o) => o.textContent);
    expect(opts).toContain('Title');
    expect(opts).not.toContain('Pic');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- AutofillImagesModal`
Expected: FAIL — component module not found.

- [ ] **Step 3: Write the component**

Create `src/lib/modules/flashcards/components/AutofillImagesModal.svelte`:

```svelte
<script lang="ts">
  import X from 'lucide-svelte/icons/x';
  import WandSparkles from 'lucide-svelte/icons/wand-sparkles';
  import { autofill } from '../lib/imageAutofill';
  import { searchWikimedia } from '../lib/imageSearch';
  import { project, applyImageAutofill } from '../stores';
  import { showToast } from '../../../shell';
  import type { Schema, RecordItem } from '../model';

  let { records, schema, onClose, search = searchWikimedia }: {
    records: RecordItem[]; schema: Schema; onClose: () => void; search?: typeof searchWikimedia;
  } = $props();

  const textFields = $derived(schema.fields.filter((f) => f.type !== 'image'));
  const imageFields = $derived(schema.fields.filter((f) => f.type === 'image'));

  let queryKey = $state(schema.fields.find((f) => f.type !== 'image')?.key ?? '');
  let imageKey = $state(schema.fields.find((f) => f.type === 'image')?.key ?? '');
  let overwrite = $state(false);
  let running = $state(false);
  let done = $state(0);
  let total = $state(0);

  const withoutImage = $derived(records.filter((r) => {
    const v = r.fields[imageKey];
    return !(typeof v === 'string' && v.trim() !== '');
  }).length);

  async function run() {
    if (running || !queryKey || !imageKey) return;
    running = true; done = 0; total = records.length;
    const res = await autofill(
      records,
      { queryKey, imageKey, overwrite, locale: $project.activeLocale },
      search,
      (d, t) => { done = d; total = t; },
    );
    applyImageAutofill(res.updates.map((u) => ({ recordId: u.recordId, key: imageKey, url: u.url })));
    const skipped = res.skippedHasImage + res.skippedEmptyQuery;
    showToast(`Filled ${res.filled} · skipped ${skipped} · no result ${res.noResult}`);
    running = false;
    onClose();
  }
</script>

<div class="overlay" role="dialog" aria-modal="true">
  <div class="modal">
    <header class="head">
      <span class="title"><WandSparkles size={15} /> Auto-fill images</span>
      <button type="button" class="close" aria-label="close" onclick={onClose}><X size={16} /></button>
    </header>
    <div class="body">
      <label class="row">
        <span>Query field</span>
        <select aria-label="query field" bind:value={queryKey} disabled={running}>
          {#each textFields as f (f.id)}<option value={f.key}>{f.label}</option>{/each}
        </select>
      </label>
      {#if imageFields.length > 1}
        <label class="row">
          <span>Target image field</span>
          <select aria-label="target image field" bind:value={imageKey} disabled={running}>
            {#each imageFields as f (f.id)}<option value={f.key}>{f.label}</option>{/each}
          </select>
        </label>
      {/if}
      <label class="check">
        <input type="checkbox" bind:checked={overwrite} disabled={running} />
        Overwrite existing images
      </label>
      <p class="summary">{records.length} record(s) · {withoutImage} without an image</p>
      {#if running}<p class="progress">{done} / {total}…</p>{/if}
    </div>
    <footer class="foot">
      <button type="button" class="ghost" onclick={onClose} disabled={running}>Cancel</button>
      <button type="button" class="primary" onclick={run} disabled={running || !queryKey || !imageKey}>
        {running ? 'Filling…' : 'Fill images'}
      </button>
    </footer>
  </div>
</div>

<style>
  .overlay { position:fixed; inset:0; background:rgba(0,0,0,.4); display:flex; align-items:center; justify-content:center; z-index:60; }
  .modal { background:var(--surface); color:var(--text); border:1px solid var(--border); border-radius:12px;
    width:min(440px,94vw); display:flex; flex-direction:column; }
  .head { display:flex; align-items:center; justify-content:space-between; padding:12px 14px; border-bottom:1px solid var(--border); }
  .title { display:inline-flex; align-items:center; gap:8px; font-weight:600; }
  .close { border:none; background:transparent; color:var(--text-muted); }
  .body { padding:14px; display:flex; flex-direction:column; gap:12px; }
  .row { display:flex; align-items:center; justify-content:space-between; gap:12px; }
  .row span { color:var(--text-muted); font-size:13px; }
  .row select { flex:1; max-width:60%; padding:6px 8px; border:1px solid var(--border); border-radius:6px; background:var(--bg); color:var(--text); font:inherit; }
  .check { display:flex; align-items:center; gap:8px; font-size:13px; }
  .summary { color:var(--text-muted); font-size:12px; margin:0; }
  .progress { color:var(--accent); font-size:13px; margin:0; }
  .foot { display:flex; justify-content:flex-end; gap:8px; padding:12px 14px; border-top:1px solid var(--border); }
  .foot button { border:1px solid var(--border); border-radius:6px; padding:6px 14px; font:inherit; }
  .ghost { background:transparent; color:var(--text); }
  .primary { background:var(--accent); border-color:var(--accent); color:#fff; }
  .foot button:disabled { opacity:.5; }
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- AutofillImagesModal`
Expected: PASS (2 tests).

- [ ] **Step 5: Run check**

Run: `npm run check`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/modules/flashcards/components/AutofillImagesModal.svelte tests/AutofillImagesModal.test.ts
git commit -m "feat: AutofillImagesModal component"
```

---

### Task 5: Wire triggers (SchemaRecordList header + RecordDetail)

**Files:**
- Modify: `src/lib/modules/flashcards/components/SchemaRecordList.svelte`
- Modify: `src/lib/modules/flashcards/components/RecordDetail.svelte`
- Test: `tests/SchemaRecordList.test.ts` (append), `tests/RecordDetail.test.ts` (append)

**Interfaces:**
- Consumes: `AutofillImagesModal` (Task 4); `project` store; `Schema`/`RecordItem` types.
- Produces: a `wand-sparkles` trigger in each component, shown only when the schema has both an image field and a text field.

- [ ] **Step 1: Write the failing SchemaRecordList test**

Append to `tests/SchemaRecordList.test.ts` (match the file's existing store-setup helper; a schema with an image + text field must render the auto-fill trigger, one without an image field must not):

```ts
it('shows the auto-fill trigger for a schema with an image field, and opens the modal', async () => {
  const p = newProject();
  p.schemas.push({ id: 's1', name: 'W', cardTemplates: [], fields: [
    { id: 'f1', key: 'title', label: 'Title', type: 'text', multilingual: true },
    { id: 'f2', key: 'pic', label: 'Pic', type: 'image' },
  ] });
  p.records.push({ id: 'r1', schemaId: 's1', fieldsHash: '', fields: { title: { en: 'Owl', vi: '' }, pic: '' } });
  stores.loadProject(p, null);
  render(SchemaRecordList);
  const btn = screen.getByRole('button', { name: /auto-fill images/i });
  await fireEvent.click(btn);
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});

it('hides the auto-fill trigger for a schema with no image field', () => {
  const p = newProject();
  p.schemas.push({ id: 's1', name: 'W', cardTemplates: [], fields: [
    { id: 'f1', key: 'title', label: 'Title', type: 'text', multilingual: true },
  ] });
  stores.loadProject(p, null);
  render(SchemaRecordList);
  expect(screen.queryByRole('button', { name: /auto-fill images/i })).toBeNull();
});
```

> Use the same imports the existing `tests/SchemaRecordList.test.ts` already has (`render`, `screen`, `fireEvent`, `stores`/named actions, `newProject`). Do not duplicate an import block — add missing named symbols to the existing ones.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- SchemaRecordList`
Expected: FAIL — no button named "auto-fill images".

- [ ] **Step 3: Wire SchemaRecordList**

In `src/lib/modules/flashcards/components/SchemaRecordList.svelte`:

Add imports:

```ts
  import WandSparkles from 'lucide-svelte/icons/wand-sparkles';
  import AutofillImagesModal from './AutofillImagesModal.svelte';
```

Add state near `aiSchemaId`:

```ts
  let autofillSchemaId = $state<string | null>(null);
```

Add a helper (after `recordsBySchema`):

```ts
  const canAutofill = $derived((schema: Schema) =>
    schema.fields.some((f) => f.type === 'image') && schema.fields.some((f) => f.type !== 'image'));
```

In the `.schema-actions` block, add the trigger before the AI button:

```svelte
            {#if canAutofill(schema)}
              <button type="button" aria-label="auto-fill images" title="Auto-fill images"
                onclick={() => autofillSchemaId = schema.id}><WandSparkles size={13} /></button>
            {/if}
```

At the end of the markup (after the `{#each}` schemas loop / alongside the AiGenerateModal mount), add:

```svelte
{#if autofillSchemaId}
  {@const s = $project.schemas.find((x) => x.id === autofillSchemaId)}
  {#if s}
    <AutofillImagesModal
      schema={s}
      records={$project.records.filter((r) => r.schemaId === autofillSchemaId)}
      onClose={() => (autofillSchemaId = null)} />
  {/if}
{/if}
```

> `Schema` is already imported in this file (`import type { RecordItem, Schema } from '../model'`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- SchemaRecordList`
Expected: PASS.

- [ ] **Step 5: Write the failing RecordDetail test**

Append to `tests/RecordDetail.test.ts` (match its existing setup — it selects a record via `selectRecord`/`selectedRecordId`):

```ts
it('shows an auto-fill button when the schema has an image field, and opens the modal', async () => {
  const p = newProject();
  p.schemas.push({ id: 's1', name: 'W', cardTemplates: [], fields: [
    { id: 'f1', key: 'title', label: 'Title', type: 'text', multilingual: true },
    { id: 'f2', key: 'pic', label: 'Pic', type: 'image' },
  ] });
  p.records.push({ id: 'r1', schemaId: 's1', fieldsHash: '', fields: { title: { en: 'Owl', vi: '' }, pic: '' } });
  stores.loadProject(p, null);
  stores.selectRecord('r1');
  render(RecordDetail);
  await fireEvent.click(screen.getByRole('button', { name: /auto-fill image/i }));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});
```

> Reuse the file's existing imports (`render`, `screen`, `fireEvent`, `RecordDetail`, `stores`/named actions, `newProject`).

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -- RecordDetail`
Expected: FAIL — no auto-fill button.

- [ ] **Step 7: Wire RecordDetail**

In `src/lib/modules/flashcards/components/RecordDetail.svelte`:

Add imports:

```ts
  import WandSparkles from 'lucide-svelte/icons/wand-sparkles';
  import AutofillImagesModal from './AutofillImagesModal.svelte';
```

Add state (after the `lastId` declaration, near the other locals in `<script>`):

```ts
  let showAutofill = $state(false);
  const canAutofill = $derived(!!schema
    && schema.fields.some((f) => f.type === 'image')
    && schema.fields.some((f) => f.type !== 'image'));
```

In the header `.actions` div, add before the Duplicate button:

```svelte
        {#if canAutofill}
          <button type="button" aria-label="auto-fill image" title="Auto-fill image"
            onclick={() => (showAutofill = true)}><WandSparkles size={15} /></button>
        {/if}
```

After the closing `</div>` of `.detail` (still inside the `{#if record && schema}` block), add:

```svelte
    {#if showAutofill && schema}
      <AutofillImagesModal schema={schema} records={[record]} onClose={() => (showAutofill = false)} />
    {/if}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- RecordDetail`
Expected: PASS.

- [ ] **Step 9: Full check + test + build gate**

Run: `npm run check` → Expected: 0 errors.
Run: `npm test` → Expected: all green.
Run: `npm run build` → Expected: builds clean.

- [ ] **Step 10: Commit**

```bash
git add src/lib/modules/flashcards/components/SchemaRecordList.svelte src/lib/modules/flashcards/components/RecordDetail.svelte tests/SchemaRecordList.test.ts tests/RecordDetail.test.ts
git commit -m "feat: wire auto-fill image triggers into schema list + record detail"
```

---

## Manual verification (after all tasks)

Run `npm run tauri dev`, then:

1. **Copy-JSON strip:** create a schema with an image field, add a record, pick a local file as its image (→ base64), click "Copy records JSON", paste into a text editor — the image field shows `"[image]"`, not a giant base64 blob. A Wikimedia-searched (remote URL) image stays as its URL.
2. **Batch auto-fill:** add several records with titles but no images → schema header wand button → pick query field "Title", leave overwrite off → Fill → toast summary; empty image fields get Wikimedia top-1 images; existing images untouched. Undo reverts all in one step.
3. **Single auto-fill:** open a record with a title but no image → wand button in the detail header → Fill → that record's image populates.
4. **Guards:** a schema with no image field shows no wand button; a schema with an image field but no text field shows none either.

## Self-Review notes

- **Spec coverage:** Part A → Task 1. Part B core (`resolveQuery`/`autofill`) → Task 2. `setImageFields` + `applyImageAutofill` → Task 3. Modal → Task 4. Both triggers + guards → Task 5. Manual verification mirrors the spec's edge cases.
- **Type consistency:** `AutofillOptions`/`AutofillResult` field names identical across Task 2 def, Task 4 usage. `setImageFields`/`applyImageAutofill` signatures `{ recordId, key, url }[]` identical across Tasks 3-4. Modal maps `autofill`'s `{ recordId, url }` → `{ recordId, key: imageKey, url }` before `applyImageAutofill`.
- **Placeholders:** none — all steps carry real code/commands.
