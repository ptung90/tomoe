# Flashcards Images (search + crop) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add Wikimedia image search + cropperjs cropping to the `ImageField` (records form + card editor), alongside the existing URL / paste / pick actions.

**Architecture:** A pure-ish `imageSearch.ts` (`searchWikimedia`, keyless, `fetch` with `origin=*`, injectable `fetchFn`); an `ImageSearchModal` (query → results grid → pick) with an injectable `search` prop; a `CropModal` (cropperjs → data-URL); `ImageField` opens both.

**Tech Stack:** Svelte 5, TS, Vite, vitest, `cropperjs`.

## Global Constraints

- Everything under `src/lib/modules/flashcards/`. Module isolation.
- Wikimedia only, **keyless**, plain `fetch` (`origin=*` gives CORS) — no Tauri http plugin, no API key. `searchWikimedia` takes an injectable `fetchFn` (defaults to global `fetch`) so tests never hit the network.
- Chrome uses Calm Paper tokens; `#fff` on accent accepted; lucide subpath imports only.
- `CropModal` mounts cropperjs (canvas/DOM) → **no jsdom test** (verified in the human morning preview); its network/parse-free siblings ARE tested.
- New dep: `cropperjs` (+ its CSS). If TS lacks types, add `@types/cropperjs` devDep.
- Gates: `npm run check` 0 errors · `npm test` green, 0 unhandled · `npm run build` OK. TDD for pure logic. Commit per task.

## File map

```
src/lib/modules/flashcards/
  lib/imageSearch.ts        # NEW: ImageHit, searchWikimedia
  components/
    ImageSearchModal.svelte # NEW
    CropModal.svelte        # NEW (no jsdom test)
    ImageField.svelte       # MODIFY: Search + Crop actions
package.json                # MODIFY: + cropperjs
tests/ imageSearch.test.ts (NEW), ImageSearchModal.test.ts (NEW), ImageField.test.ts (extend)
```

---

## Task 1: imageSearch.ts — searchWikimedia

**Files:** Create `src/lib/modules/flashcards/lib/imageSearch.ts`; Test `tests/imageSearch.test.ts`.

**Interfaces:** `ImageHit = { thumb: string; full: string; title: string }`; `searchWikimedia(query: string, fetchFn?: typeof fetch): Promise<ImageHit[]>`.

- [ ] **Step 1: Write the failing test**

Create `tests/imageSearch.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { searchWikimedia } from '../src/lib/modules/flashcards/lib/imageSearch';

const sample = {
  query: { pages: {
    '1': { title: 'File:Owl.jpg', imageinfo: [{ url: 'https://x/Owl.jpg', thumburl: 'https://x/Owl_300.jpg' }] },
    '2': { title: 'File:Cat.jpg', imageinfo: [{ url: 'https://x/Cat.jpg', thumburl: 'https://x/Cat_300.jpg' }] },
    '3': { title: 'File:NoInfo.jpg' }, // no imageinfo → skipped
  } },
};
const fetchOk = (body: unknown) => vi.fn(async () => ({ json: async () => body })) as unknown as typeof fetch;

describe('searchWikimedia', () => {
  it('parses Commons pages into ImageHit[] (thumb/full/title), skipping entries without imageinfo', async () => {
    const hits = await searchWikimedia('owl', fetchOk(sample));
    expect(hits).toHaveLength(2);
    expect(hits[0]).toMatchObject({ thumb: 'https://x/Owl_300.jpg', full: 'https://x/Owl.jpg', title: 'File:Owl.jpg' });
  });
  it('returns [] for a blank query without calling fetch', async () => {
    const fetchFn = vi.fn();
    expect(await searchWikimedia('   ', fetchFn as unknown as typeof fetch)).toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it('returns [] for a response with no query.pages (no throw)', async () => {
    expect(await searchWikimedia('owl', fetchOk({}))).toEqual([]);
  });
  it('encodes the query in the request url', async () => {
    const fetchFn = vi.fn(async () => ({ json: async () => sample })) as unknown as typeof fetch;
    await searchWikimedia('a b', fetchFn);
    expect((fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain('gsrsearch=a%20b');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- imageSearch` → FAIL (cannot resolve).

- [ ] **Step 3: Implement**

Create `src/lib/modules/flashcards/lib/imageSearch.ts`:
```ts
export interface ImageHit { thumb: string; full: string; title: string }

/** Search Wikimedia Commons images (keyless; origin=* → CORS-safe plain fetch).
 *  Ported from flashcard-creator api.js searchWikimedia. Network errors propagate
 *  (the caller shows an error state); a valid-but-empty response returns []. */
export async function searchWikimedia(query: string, fetchFn: typeof fetch = fetch): Promise<ImageHit[]> {
  const q = query.trim();
  if (!q) return [];
  const url = 'https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrnamespace=6'
    + `&gsrsearch=${encodeURIComponent(q)}&gsrlimit=20&prop=imageinfo&iiprop=url%7Cthumburl`
    + '&iiurlwidth=300&format=json&origin=*';
  const res = await fetchFn(url);
  const data = (await res.json()) as { query?: { pages?: Record<string, {
    title?: string; imageinfo?: { url?: string; thumburl?: string }[];
  }> } };
  const pages = data?.query?.pages;
  if (!pages) return [];
  const hits: ImageHit[] = [];
  for (const key of Object.keys(pages)) {
    const info = pages[key]?.imageinfo?.[0];
    if (info?.thumburl && info?.url) hits.push({ thumb: info.thumburl, full: info.url, title: pages[key].title ?? '' });
  }
  return hits;
}
```

- [ ] **Step 4: GREEN** — `npm test -- imageSearch` passes (4). `npm run check` 0 errors.
- [ ] **Step 5: Commit** — `git add src/lib/modules/flashcards/lib/imageSearch.ts tests/imageSearch.test.ts && git commit -m "feat(flashcards): Wikimedia image search (keyless)"`

---

## Task 2: ImageSearchModal component

**Files:** Create `src/lib/modules/flashcards/components/ImageSearchModal.svelte`; Test `tests/ImageSearchModal.test.ts`.

**Interfaces:** `<ImageSearchModal onPick={(url: string) => void} onClose={() => void} search?={typeof searchWikimedia} />` (search defaults to `searchWikimedia`; injectable in tests).

- [ ] **Step 1: Write the failing test**

Create `tests/ImageSearchModal.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/svelte';
import ImageSearchModal from '../src/lib/modules/flashcards/components/ImageSearchModal.svelte';

const hits = [
  { thumb: 'https://x/a_300.jpg', full: 'https://x/a.jpg', title: 'A' },
  { thumb: 'https://x/b_300.jpg', full: 'https://x/b.jpg', title: 'B' },
];

describe('ImageSearchModal', () => {
  it('searches and renders result thumbnails; clicking one picks its full url', async () => {
    const search = vi.fn(async () => hits);
    const onPick = vi.fn();
    const { container } = render(ImageSearchModal, { onPick, onClose: vi.fn(), search });
    await fireEvent.input(screen.getByPlaceholderText(/search/i), { target: { value: 'owl' } });
    await fireEvent.submit(screen.getByPlaceholderText(/search/i).closest('form')!);
    expect(search).toHaveBeenCalledWith('owl');
    const imgs = container.querySelectorAll('.hit');
    expect(imgs.length).toBe(2);
    await fireEvent.click(imgs[0]);
    expect(onPick).toHaveBeenCalledWith('https://x/a.jpg');
  });
  it('shows "no images" when the search returns empty', async () => {
    render(ImageSearchModal, { onPick: vi.fn(), onClose: vi.fn(), search: vi.fn(async () => []) });
    await fireEvent.input(screen.getByPlaceholderText(/search/i), { target: { value: 'zzz' } });
    await fireEvent.submit(screen.getByPlaceholderText(/search/i).closest('form')!);
    expect(await screen.findByText(/no images/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: RED** — `npm test -- ImageSearchModal` fails (cannot resolve).

- [ ] **Step 3: Implement**

Create `src/lib/modules/flashcards/components/ImageSearchModal.svelte`:
```svelte
<script lang="ts">
  import SearchIcon from 'lucide-svelte/icons/search';
  import X from 'lucide-svelte/icons/x';
  import { searchWikimedia, type ImageHit } from '../lib/imageSearch';

  let { onPick, onClose, search = searchWikimedia }: {
    onPick: (url: string) => void; onClose: () => void; search?: typeof searchWikimedia;
  } = $props();

  let query = $state('');
  let hits = $state<ImageHit[]>([]);
  let status = $state<'idle' | 'loading' | 'error' | 'done'>('idle');

  async function run(e: Event) {
    e.preventDefault();
    if (!query.trim()) return;
    status = 'loading';
    try { hits = await search(query.trim()); status = 'done'; }
    catch { hits = []; status = 'error'; }
  }
</script>

<div class="overlay" role="dialog" aria-modal="true">
  <div class="modal">
    <header class="head">
      <form class="searchbar" onsubmit={run}>
        <SearchIcon size={15} />
        <input placeholder="Search Wikimedia images…" bind:value={query} />
        <button type="submit">Search</button>
      </form>
      <button type="button" class="close" aria-label="close" onclick={onClose}><X size={16} /></button>
    </header>
    <div class="results">
      {#if status === 'loading'}
        <p class="msg">Searching…</p>
      {:else if status === 'error'}
        <p class="msg">Couldn't reach Wikimedia. Check your connection and try again.</p>
      {:else if status === 'done' && hits.length === 0}
        <p class="msg">No images found.</p>
      {:else}
        <div class="grid">
          {#each hits as h (h.full)}
            <button type="button" class="hit" title={h.title} onclick={() => onPick(h.full)}>
              <img src={h.thumb} alt={h.title} loading="lazy" />
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .overlay { position:fixed; inset:0; background:rgba(0,0,0,.4); display:flex; align-items:center; justify-content:center; z-index:60; }
  .modal { background:var(--surface); color:var(--text); border:1px solid var(--border); border-radius:12px;
    width:min(680px,94vw); max-height:86vh; display:flex; flex-direction:column; }
  .head { display:flex; align-items:center; gap:10px; padding:12px 14px; border-bottom:1px solid var(--border); }
  .searchbar { flex:1; display:flex; align-items:center; gap:8px; border:1px solid var(--border); border-radius:8px; padding:4px 10px; color:var(--text-muted); }
  .searchbar input { flex:1; border:none; background:transparent; color:var(--text); font:inherit; outline:none; }
  .searchbar button { border:1px solid var(--accent); background:var(--accent); color:#fff; border-radius:6px; padding:4px 12px; font:inherit; font-size:12px; }
  .close { border:none; background:transparent; color:var(--text-muted); }
  .results { padding:14px; overflow:auto; }
  .msg { color:var(--text-muted); font-size:13px; text-align:center; padding:24px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(120px, 1fr)); gap:10px; }
  .hit { border:1px solid var(--border); border-radius:8px; overflow:hidden; padding:0; background:var(--bg); cursor:pointer; aspect-ratio:1; }
  .hit:hover { border-color:var(--accent); }
  .hit img { width:100%; height:100%; object-fit:cover; display:block; }
</style>
```

- [ ] **Step 4: GREEN** — `npm test -- ImageSearchModal` passes (2). `npm run check` 0 errors.
- [ ] **Step 5: Commit** — `git add src/lib/modules/flashcards/components/ImageSearchModal.svelte tests/ImageSearchModal.test.ts && git commit -m "feat(flashcards): ImageSearchModal (Wikimedia results grid)"`

---

## Task 3: cropperjs + CropModal component

**Files:** Modify `package.json` (+ cropperjs); Create `src/lib/modules/flashcards/components/CropModal.svelte`. No test (cropperjs/canvas).

**Interfaces:** `<CropModal src={string} onApply={(dataUrl: string) => void} onClose={() => void} />`.

- [ ] **Step 1: Install cropperjs**

Run: `npm install cropperjs@^1.6`
Expected: added to dependencies. (cropperjs 1.6 ships its own types; if `npm run check` later complains about missing types, `npm install -D @types/cropperjs`.)

- [ ] **Step 2: Implement `CropModal.svelte`**

Create `src/lib/modules/flashcards/components/CropModal.svelte`:
```svelte
<script lang="ts">
  import Cropper from 'cropperjs';
  import 'cropperjs/dist/cropper.css';
  import X from 'lucide-svelte/icons/x';

  let { src, onApply, onClose }: { src: string; onApply: (dataUrl: string) => void; onClose: () => void } = $props();

  let cropper: Cropper | undefined;
  function mount(node: HTMLImageElement) {
    node.crossOrigin = 'anonymous'; // Wikimedia serves CORS; keeps the canvas untainted
    cropper = new Cropper(node, { viewMode: 1, autoCropArea: 1, background: false });
    return { destroy() { cropper?.destroy(); cropper = undefined; } };
  }
  const setAspect = (r: number) => cropper?.setAspectRatio(r);
  function apply() {
    const canvas = cropper?.getCroppedCanvas({ maxWidth: 1600, maxHeight: 1600 });
    if (!canvas) return;
    try { onApply(canvas.toDataURL('image/jpeg', 0.9)); }
    catch { onClose(); } // tainted canvas (non-CORS remote) — bail rather than throw
  }
</script>

<div class="overlay" role="dialog" aria-modal="true">
  <div class="modal">
    <header class="head"><span>Crop image</span><button type="button" aria-label="close" onclick={onClose}><X size={16} /></button></header>
    <div class="crop-area"><img {src} use:mount alt="" /></div>
    <div class="aspects">
      <button type="button" onclick={() => setAspect(NaN)}>Free</button>
      <button type="button" onclick={() => setAspect(1)}>1:1</button>
      <button type="button" onclick={() => setAspect(3 / 4)}>3:4</button>
      <button type="button" onclick={() => setAspect(4 / 3)}>4:3</button>
    </div>
    <footer class="foot"><span class="spacer"></span>
      <button type="button" onclick={onClose}>Cancel</button>
      <button type="button" class="primary" onclick={apply}>Apply</button>
    </footer>
  </div>
</div>

<style>
  .overlay { position:fixed; inset:0; background:rgba(0,0,0,.4); display:flex; align-items:center; justify-content:center; z-index:60; }
  .modal { background:var(--surface); color:var(--text); border:1px solid var(--border); border-radius:12px;
    width:min(680px,94vw); max-height:88vh; display:flex; flex-direction:column; }
  .head { display:flex; align-items:center; justify-content:space-between; padding:12px 14px; border-bottom:1px solid var(--border); font-weight:600; }
  .head button { border:none; background:transparent; color:var(--text-muted); }
  .crop-area { padding:12px 14px; max-height:60vh; overflow:hidden; }
  .crop-area img { max-width:100%; display:block; }
  .aspects { display:flex; gap:6px; padding:0 14px 10px; }
  .aspects button { border:1px solid var(--border); background:transparent; color:var(--text); border-radius:6px; padding:4px 10px; font:inherit; font-size:12px; }
  .aspects button:hover { background:var(--accent-weak); color:var(--accent); }
  .foot { display:flex; align-items:center; gap:8px; padding:12px 14px; border-top:1px solid var(--border); }
  .spacer { flex:1; }
  .foot button { border:1px solid var(--border); background:transparent; color:var(--text); border-radius:6px; padding:6px 14px; font:inherit; }
  .foot .primary { border-color:var(--accent); background:var(--accent); color:#fff; font-weight:600; }
</style>
```

- [ ] **Step 3: Verify compile** — `npm run check` 0 errors (add `@types/cropperjs` if types missing). Do NOT add a test.
- [ ] **Step 4: Commit** — `git add package.json package-lock.json src/lib/modules/flashcards/components/CropModal.svelte && git commit -m "feat(flashcards): CropModal (cropperjs)"`

---

## Task 4: ImageField — Search + Crop actions

**Files:** Modify `src/lib/modules/flashcards/components/ImageField.svelte`; Test `tests/ImageField.test.ts` (extend).

- [ ] **Step 1: Write the failing test**

Append to `tests/ImageField.test.ts`:
```ts
it('shows a Search button and a Crop button (Crop only when a value exists)', () => {
  const { rerender } = render(ImageField, { value: '', onChange: vi.fn() });
  expect(screen.getByRole('button', { name: /search/i })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /crop/i })).not.toBeInTheDocument();
  rerender({ value: 'http://x/a.png', onChange: vi.fn() });
  expect(screen.getByRole('button', { name: /crop/i })).toBeInTheDocument();
});
```
(Ensure `vi` imported.)

- [ ] **Step 2: RED** — `npm test -- ImageField` fails on the new case.

- [ ] **Step 3: Implement**

In `ImageField.svelte`: import the two modals + lucide icons, add `showSearch`/`showCrop` `$state`, add the two buttons in `.btns`, and render the modals conditionally.
```svelte
  import SearchIcon from 'lucide-svelte/icons/search';
  import Crop from 'lucide-svelte/icons/crop';
  import ImageSearchModal from './ImageSearchModal.svelte';
  import CropModal from './CropModal.svelte';
  // …existing props/handlers…
  let showSearch = $state(false);
  let showCrop = $state(false);
```
In `.btns` (before Clear):
```svelte
      <button type="button" onclick={() => (showSearch = true)}><SearchIcon size={13} /> Search</button>
      {#if value}<button type="button" onclick={() => (showCrop = true)}><Crop size={13} /> Crop</button>{/if}
```
After the hidden file input:
```svelte
{#if showSearch}
  <ImageSearchModal onPick={(u) => { onChange(u); showSearch = false; }} onClose={() => (showSearch = false)} />
{/if}
{#if showCrop && value}
  <CropModal src={value} onApply={(d) => { onChange(d); showCrop = false; }} onClose={() => (showCrop = false)} />
{/if}
```
Keep button styling consistent (icons + text). Note: the search button label must contain "Search" and crop "Crop" for the test.

- [ ] **Step 4: GREEN + gates**

Run: `npm test -- ImageField` (passes) then `npm test` (full green, 0 unhandled), `npm run check` (0 errors), `npm run build` (OK).

- [ ] **Step 5: Manual verification (human, morning)** — Search a term → thumbnails → pick sets the image; Crop an image → adjust → Apply sets the cropped data-URL. (Needs network for search.)

- [ ] **Step 6: Commit** — `git add src/lib/modules/flashcards/components/ImageField.svelte tests/ImageField.test.ts && git commit -m "feat(flashcards): ImageField Search + Crop actions"`

---

## Self-review notes (author)
- Coverage: Wikimedia search pure+tested (T1), search modal (T2), crop modal (T3, no jsdom test by design), ImageField wiring (T4). Keyless/fetch-injectable → no network in tests.
- Out of scope: Unsplash/Pixabay, attribution, per-image bg-size. Deferred.
- Consistency: `searchWikimedia(query, fetchFn?)`, `ImageHit`, modal props (`onPick/onClose/search`, `src/onApply/onClose`) used identically across lib + modals + ImageField.
- Testing gap (declared): `CropModal` (cropperjs/canvas) has no jsdom test — human morning verify; live Wikimedia search also needs network.
```
