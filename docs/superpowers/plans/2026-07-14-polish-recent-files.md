# Polish: Recent files Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Reopen a recently used file in one click from the Start screen.

**Architecture:** A shell-level `recentFiles` store (localStorage, newest-first, cap 10) recorded at the `fileService.openPath` chokepoint; StartScreen lists recents → reopen via `openPath` / remove / clear.

**Tech Stack:** Svelte 5, TS, vitest. No new deps.

## Global Constraints

- Shell-level (`src/lib/`), no module dependency, no cross-module reactivity.
- Recents live in `localStorage` (`tomoe.recentFiles`), NEVER in a project document.
- Reopen goes through `openPath` (keeps the existing unsaved-changes guard). `recordRecent` runs only AFTER a successful `mod.open` (failed opens don't pollute the list).
- Pure helpers (`basename`, `pushRecent`) immutable + TDD; `pushRecent` takes `ts` as a param (no clock in the pure path).
- Chrome = Calm Paper tokens (`var(--…)`); lucide subpath imports only. `#fff`-on-accent OK.
- Gates: `npm run check` 0 errors · `npm test` green, 0 unhandled (re-run once if EBUSY) · `npm run build` OK.

## File map

```
src/lib/
  recentFiles.ts            # NEW (T1): store + record/remove/clear + basename/pushRecent
  fileService.ts            # MODIFY (T2): recordRecent after successful open
  components/StartScreen.svelte  # MODIFY (T3): Recent section
tests/ recentFiles.test.ts (T1), fileService-recent.test.ts (T2), StartScreen.test.ts (T3)
```

---

## Task 1: recentFiles.ts

**Files:** Create `src/lib/recentFiles.ts`; Test `tests/recentFiles.test.ts`.

**Interfaces produced:** `RecentFile`, `basename(path)`, `pushRecent(list, path, ts)`, `recentFiles` (Writable), `recordRecent(path)`, `removeRecent(path)`, `clearRecent()`.

- [ ] **Step 1: Write the failing test** — create `tests/recentFiles.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { basename, pushRecent, recentFiles, recordRecent, removeRecent, clearRecent, type RecentFile } from '../src/lib/recentFiles';

describe('basename', () => {
  it('handles posix and windows separators', () => {
    expect(basename('/a/b/c.tomoe.json')).toBe('c.tomoe.json');
    expect(basename('C:\\x\\y\\z.json')).toBe('z.json');
    expect(basename('bare.json')).toBe('bare.json');
  });
});

describe('pushRecent', () => {
  const mk = (p: string, ts: number): RecentFile => ({ path: p, name: basename(p), ts });
  it('adds newest-first with name + ts', () => {
    const out = pushRecent([], '/a/x.json', 100);
    expect(out).toEqual([{ path: '/a/x.json', name: 'x.json', ts: 100 }]);
  });
  it('dedupes by path, moving an existing entry to the top', () => {
    const list = [mk('/a.json', 1), mk('/b.json', 2)];
    const out = pushRecent(list, '/b.json', 3);
    expect(out.map((r) => r.path)).toEqual(['/b.json', '/a.json']);
    expect(out).toHaveLength(2);
  });
  it('caps at 10', () => {
    let list: RecentFile[] = [];
    for (let i = 0; i < 15; i++) list = pushRecent(list, `/f${i}.json`, i);
    expect(list).toHaveLength(10);
    expect(list[0].path).toBe('/f14.json');
  });
});

describe('recentFiles store', () => {
  beforeEach(() => { localStorage.clear(); clearRecent(); });
  it('recordRecent persists + updates the store (newest-first)', () => {
    recordRecent('/a/x.json'); recordRecent('/a/y.json');
    expect(get(recentFiles).map((r) => r.path)).toEqual(['/a/y.json', '/a/x.json']);
    expect(JSON.parse(localStorage.getItem('tomoe.recentFiles')!)).toHaveLength(2);
  });
  it('removeRecent drops one; clearRecent empties', () => {
    recordRecent('/a.json'); recordRecent('/b.json');
    removeRecent('/a.json');
    expect(get(recentFiles).map((r) => r.path)).toEqual(['/b.json']);
    clearRecent();
    expect(get(recentFiles)).toEqual([]);
    expect(JSON.parse(localStorage.getItem('tomoe.recentFiles')!)).toEqual([]);
  });
});
```

- [ ] **Step 2: RED** — `npm test -- recentFiles` fails (cannot resolve).

- [ ] **Step 3: Implement** — create `src/lib/recentFiles.ts`:
```ts
import { writable, type Writable } from 'svelte/store';

export interface RecentFile { path: string; name: string; ts: number }

const KEY = 'tomoe.recentFiles';
const CAP = 10;

/** Last path segment, tolerant of both / and \ separators. */
export function basename(path: string): string {
  const parts = path.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] || path;
}

/** Pure: new list with `path` recorded most-recent-first, deduped by path, capped at 10. */
export function pushRecent(list: RecentFile[], path: string, ts: number): RecentFile[] {
  const entry: RecentFile = { path, name: basename(path), ts };
  return [entry, ...list.filter((r) => r.path !== path)].slice(0, CAP);
}

function load(): RecentFile[] {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
function persist(list: RecentFile[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* ignore storage errors */ }
}

export const recentFiles: Writable<RecentFile[]> = writable(load());

export function recordRecent(path: string): void {
  recentFiles.update((list) => { const next = pushRecent(list, path, Date.now()); persist(next); return next; });
}
export function removeRecent(path: string): void {
  recentFiles.update((list) => { const next = list.filter((r) => r.path !== path); persist(next); return next; });
}
export function clearRecent(): void { recentFiles.set([]); persist([]); }
```

- [ ] **Step 4: GREEN** — `npm test -- recentFiles` passes. `npm run check` 0 errors.
- [ ] **Step 5: Commit** — `git add src/lib/recentFiles.ts tests/recentFiles.test.ts && git commit -m "feat(shell): recentFiles store (localStorage, newest-first, cap 10)"`

---

## Task 2: fileService — record on open

**Files:** Modify `src/lib/fileService.ts`; Test `tests/fileService-recent.test.ts`.

- [ ] **Step 1: Write the failing test** — create `tests/fileService-recent.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(() => Promise.resolve(() => {})) }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(() => Promise.resolve(null)) }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn(), confirm: vi.fn(() => Promise.resolve(true)) }));
const readTextFile = vi.fn();
vi.mock('@tauri-apps/plugin-fs', () => ({ readTextFile: (...a: unknown[]) => readTextFile(...a) }));
const openMock = vi.fn();
vi.mock('../src/lib/modules/registry', () => ({
  pickModuleForOpen: () => ({ id: 'json-table', open: openMock }),
  getModule: vi.fn(),
}));

import { openPath } from '../src/lib/fileService';
import { recentFiles } from '../src/lib/recentFiles';
import { setActiveModule } from '../src/lib/shell';
import { get } from 'svelte/store';

beforeEach(() => { localStorage.clear(); recentFiles.set([]); setActiveModule(null); readTextFile.mockReset(); openMock.mockReset(); });

describe('openPath records recent files', () => {
  it('records the path after a successful open', async () => {
    readTextFile.mockResolvedValue('{"foo":1}');
    await openPath('/data/thing.json');
    expect(openMock).toHaveBeenCalled();
    expect(get(recentFiles).map((r) => r.path)).toEqual(['/data/thing.json']);
  });
  it('does NOT record when the read fails', async () => {
    readTextFile.mockRejectedValue(new Error('nope'));
    await openPath('/data/missing.json');
    expect(get(recentFiles)).toEqual([]);
  });
});
```

- [ ] **Step 2: RED** — `npm test -- fileService-recent` fails (path not recorded).

- [ ] **Step 3: Implement** — in `src/lib/fileService.ts`:
  - add import (after the registry import, line 7): `import { recordRecent } from './recentFiles';`
  - in `openPath`, after `mod.open(text, path);` (line 30), add: `recordRecent(path);`

  The resulting try block:
```ts
    const text = await readTextFile(path);
    const mod = pickModuleForOpen(path, text);
    setActiveModule(mod.id);
    mod.open(text, path);
    recordRecent(path);
```

- [ ] **Step 4: GREEN + gates** — `npm test -- fileService-recent` passes; `npm test` (full green, 0 unhandled — re-run once if EBUSY); `npm run check` (0 errors); `npm run build` (OK).
- [ ] **Step 5: Commit** — `git add src/lib/fileService.ts tests/fileService-recent.test.ts && git commit -m "feat(shell): record recent file after a successful open"`

---

## Task 3: StartScreen — Recent section

**Files:** Modify `src/lib/components/StartScreen.svelte`; Test `tests/StartScreen.test.ts`.

- [ ] **Step 1: Write the failing test** — create `tests/StartScreen.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/svelte';

const openPath = vi.fn();
vi.mock('../src/lib/fileService', () => ({ openPath: (...a: unknown[]) => openPath(...a), pickOpen: vi.fn() }));

import StartScreen from '../src/lib/components/StartScreen.svelte';
import { recentFiles } from '../src/lib/recentFiles';
import { get } from 'svelte/store';

beforeEach(() => { openPath.mockReset(); recentFiles.set([]); });

describe('StartScreen recent files', () => {
  it('shows no Recent section when empty', () => {
    render(StartScreen);
    expect(screen.queryByText(/Recent/i)).not.toBeInTheDocument();
  });
  it('lists recents and reopens on click', async () => {
    recentFiles.set([{ path: '/a/x.tomoe.json', name: 'x.tomoe.json', ts: 2 }]);
    render(StartScreen);
    await fireEvent.click(screen.getByRole('button', { name: /x\.tomoe\.json/i }));
    expect(openPath).toHaveBeenCalledWith('/a/x.tomoe.json');
  });
  it('remove (×) drops an entry', async () => {
    recentFiles.set([{ path: '/a.json', name: 'a.json', ts: 1 }]);
    render(StartScreen);
    await fireEvent.click(screen.getByRole('button', { name: /remove a\.json/i }));
    expect(get(recentFiles)).toEqual([]);
  });
});
```

- [ ] **Step 2: RED** — `npm test -- StartScreen` fails (no Recent UI).

- [ ] **Step 3: Implement** — in `src/lib/components/StartScreen.svelte`:
  - add imports (after the existing lucide/import lines):
```ts
  import X from 'lucide-svelte/icons/x';
  import { recentFiles, removeRecent, clearRecent } from '../recentFiles';
  import { openPath } from '../fileService';
```
  (note: `openPath` joins the existing `pickOpen` import line — keep `import { pickOpen, openPath } from '../fileService';`)
  - inside `.card`, after the `.actions` div (before `</div>` closing `.card`), add:
```svelte
    {#if $recentFiles.length}
      <div class="recent">
        <div class="recent-head"><span>Recent</span>
          <button type="button" class="clear" onclick={clearRecent}>Clear</button></div>
        <ul>
          {#each $recentFiles as r (r.path)}
            <li>
              <button type="button" class="recent-item" title={r.path} onclick={() => openPath(r.path)}>
                <span class="rname">{r.name}</span><span class="rpath">{r.path}</span>
              </button>
              <button type="button" class="rm" aria-label={`remove ${r.name}`} title="Remove"
                onclick={() => removeRecent(r.path)}><X size={13} /></button>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
```
  - add styles (inside `<style>`):
```css
  .recent { width:100%; margin-top:6px; display:flex; flex-direction:column; gap:6px; }
  .recent-head { display:flex; align-items:center; justify-content:space-between; font-size:12px; color:var(--text-muted); }
  .clear { border:none; background:transparent; color:var(--text-muted); font:inherit; font-size:12px; cursor:pointer; padding:2px 4px; border-radius:5px; }
  .clear:hover { background:var(--accent-weak); color:var(--accent); }
  .recent ul { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:2px; }
  .recent li { display:flex; align-items:center; gap:4px; }
  .recent-item { flex:1 1 auto; min-width:0; display:flex; flex-direction:column; align-items:flex-start; gap:1px;
    border:none; background:transparent; color:var(--text); border-radius:6px; padding:5px 8px; font:inherit; cursor:pointer; text-align:left; }
  .recent-item:hover { background:var(--accent-weak); }
  .rname { font-size:13px; }
  .rpath { font-size:11px; color:var(--text-muted); max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .rm { border:none; background:transparent; color:var(--text-muted); padding:4px; border-radius:5px; cursor:pointer; flex:0 0 auto; }
  .rm:hover { background:var(--accent-weak); color:var(--accent); }
  .recent-item:focus-visible, .rm:focus-visible, .clear:focus-visible { outline:2px solid var(--accent); outline-offset:1px; }
```

- [ ] **Step 4: GREEN + gates** — `npm test -- StartScreen` passes; `npm test` (full green, 0 unhandled — re-run once if EBUSY); `npm run check` (0 errors); `npm run build` (OK).
- [ ] **Step 5: Manual verification (human, morning)** — open a couple files, return to Start → they appear under Recent → click reopens; × removes; Clear empties.
- [ ] **Step 6: Commit** — `git add src/lib/components/StartScreen.svelte tests/StartScreen.test.ts && git commit -m "feat(shell): Recent files on the Start screen (reopen / remove / clear)"`

---

## Self-review notes (author)
- Coverage: pure basename/pushRecent + store persistence (T1), record-on-open + no-record-on-failure (T2), StartScreen list/reopen/remove/empty (T3). Live relaunch persistence = human morning.
- Chokepoint: recording lives only in `openPath`, after `mod.open` — covers picker/launch/warm-start/recent-click, and failed opens never record.
- Isolation: shell-level store, localStorage-only, never in a document; no module import.
- Out of scope (declared follow-ups): backup-on-save + save-time recording (need a save chokepoint that doesn't exist yet), multi-language niceties.
