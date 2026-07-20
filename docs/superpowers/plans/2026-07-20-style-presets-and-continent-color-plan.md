# Style Presets + Continent Colour — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user (A) save/apply a reusable "style set" across all cards, and (B) tag a project's continent to auto-set its border colour.

**Architecture:** Both features are thin specialisations of one primitive — *merge a partial `StyleOverrides` into Global settings* (`cardMapping.applySettings`). A adds an app-level localStorage preset library (mirrors the Schema Library) + a project-wide apply that optionally strips overrides at view/card scope. B adds a `Project.category` field that, on change, merges a continent colour into Global `border`. A excludes border; B only touches border — orthogonal.

**Tech Stack:** Svelte 5 runes, TypeScript, vitest (+ jsdom/@testing-library/svelte), Tauri. Style cascade in `lib/style.ts`; existing patterns: Schema Library (`io/schemaIO.ts` + `stores.ts`), continent palette (`lib/palette.ts`).

## Global Constraints

- `npm run check` = 0 errors, `npm test` green, `npm run build` passes before each commit.
- Design system "Calm Paper": style with tokens (`var(--accent)`, `var(--border)`, …), never hardcoded hex, in components.
- lucide-svelte icons: subpath imports only (`lucide-svelte/icons/save`).
- TDD for all pure logic (model, style, io) — failing test first.
- Commit format matches repo: `feat:`/`test:`/`docs:` conventional prefix, no version bump for these (feature commits may bump patch version if the user asks; default: no bump).
- `StylePreset` = these keys ONLY: `titleFont`, `contentFont`, `image`, `margin`, `padding`, `imgPadding`, `paraGap`, `textVAlign`. Never `border`, `paperSize`, `orientation`.
- Continent keys come from `lib/palette.ts` `CONTINENT_COLORS` (`northAmerica`, `southAmerica`, `europe`, `africa`, `asia`, `oceania`, `antarctica`).

---

## File Structure

**Feature A**
- Create `src/lib/modules/flashcards/lib/stylePreset.ts` — pure: `StylePreset` type, `PRESET_KEYS`, `settingsToPreset`, `applyPresetToSettings`, `stripPresetKeys`.
- Create `src/lib/modules/flashcards/io/stylePresetIO.ts` — `StylePresetEntry`, `mergePresetOverDefaults`, `serializeStylePreset`, `parseStylePreset`, `looksLikeStylePresetFile`.
- Modify `src/lib/modules/flashcards/stores.ts` — preset library store + `applyStylePreset` + `stylePresetOpen`.
- Create `src/lib/modules/flashcards/components/StylePresetModal.svelte` — library UI (mirror `SchemaLibraryModal.svelte`).
- Modify `src/lib/modules/flashcards/components/StyleControls.svelte` — "Presets" button opening the modal.
- Modify `src/lib/modules/flashcards/components/CardPreview.svelte` (or `Workspace.svelte`) — mount `StylePresetModal` on `stylePresetOpen`.
- Tests: `tests/stylePreset.test.ts`, `tests/stylePresetIO.test.ts`, extend `tests/flashcards-stores.test.ts` (or new `tests/stylePreset-store.test.ts`), `tests/StylePresetModal.test.ts`.

**Feature B**
- Modify `src/lib/modules/flashcards/model.ts` — `Project.category?`, parse/serialize.
- Modify `src/lib/modules/flashcards/stores.ts` — `setProjectCategory`.
- Modify `src/lib/modules/flashcards/Workspace.svelte` — continent dropdown in header.
- Tests: extend `tests/flashcards-model.test.ts`, new `tests/continent-category.test.ts`, extend a Workspace/component test.

---

# PHASE A — Style Presets

### Task A1: Pure core — `stylePreset.ts`

**Files:**
- Create: `src/lib/modules/flashcards/lib/stylePreset.ts`
- Test: `tests/stylePreset.test.ts`

**Interfaces:**
- Consumes: `Settings`, `StyleOverrides` from `../model`; `resolveStyle` from `./style`.
- Produces:
  - `type StylePreset = Pick<StyleOverrides,'titleFont'|'contentFont'|'image'|'margin'|'padding'|'imgPadding'|'paraGap'|'textVAlign'>`
  - `const PRESET_KEYS: (keyof StylePreset)[]`
  - `settingsToPreset(s: Settings): StylePreset`
  - `applyPresetToSettings(s: Settings, preset: StylePreset): Settings`
  - `stripPresetKeys(o: StyleOverrides | undefined): StyleOverrides | undefined`

- [ ] **Step 1: Write the failing test**

```ts
// tests/stylePreset.test.ts
import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/lib/modules/flashcards/model';
import { PRESET_KEYS, settingsToPreset, applyPresetToSettings, stripPresetKeys } from '../src/lib/modules/flashcards/lib/stylePreset';

describe('stylePreset core', () => {
  it('PRESET_KEYS excludes border/paperSize/orientation', () => {
    expect(PRESET_KEYS).not.toContain('border');
    expect(PRESET_KEYS).not.toContain('paperSize');
    expect(PRESET_KEYS).not.toContain('orientation');
    expect(PRESET_KEYS).toEqual(
      expect.arrayContaining(['titleFont','contentFont','image','margin','padding','imgPadding','paraGap','textVAlign']),
    );
  });
  it('settingsToPreset captures exactly the preset keys', () => {
    const p = settingsToPreset(DEFAULT_SETTINGS);
    expect(Object.keys(p).sort()).toEqual([...PRESET_KEYS].sort());
    expect(p.titleFont.family).toBe(DEFAULT_SETTINGS.titleFont.family);
    expect((p as any).border).toBeUndefined();
  });
  it('applyPresetToSettings sets preset keys, leaves border/paper untouched, base unmutated', () => {
    const preset = { ...settingsToPreset(DEFAULT_SETTINGS), margin: 25, titleFont: { ...DEFAULT_SETTINGS.titleFont, color: '#123456' } };
    const out = applyPresetToSettings(DEFAULT_SETTINGS, preset);
    expect(out.margin).toBe(25);
    expect(out.titleFont.color).toBe('#123456');
    expect(out.border).toEqual(DEFAULT_SETTINGS.border);
    expect(out.paperSize).toBe(DEFAULT_SETTINGS.paperSize);
    expect(DEFAULT_SETTINGS.margin).not.toBe(25); // base untouched
  });
  it('stripPresetKeys removes preset keys, keeps border, undefined when empty', () => {
    expect(stripPresetKeys({ border: { width: 8 }, margin: 5, titleFont: { size: 20 } })).toEqual({ border: { width: 8 } });
    expect(stripPresetKeys({ margin: 5 })).toBeUndefined();
    expect(stripPresetKeys(undefined)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/stylePreset.test.ts`
Expected: FAIL — module `lib/stylePreset` not found / exports undefined.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/modules/flashcards/lib/stylePreset.ts
import type { Settings, StyleOverrides } from '../model';
import { resolveStyle } from './style';

/** A reusable style bundle: colours/fonts/spacing/image, EXCLUDING border + page geometry. */
export type StylePreset = Pick<StyleOverrides,
  'titleFont' | 'contentFont' | 'image' | 'margin' | 'padding' | 'imgPadding' | 'paraGap' | 'textVAlign'>;

export const PRESET_KEYS: (keyof StylePreset)[] = [
  'titleFont', 'contentFont', 'image', 'margin', 'padding', 'imgPadding', 'paraGap', 'textVAlign',
];

/** Capture the preset-relevant slice of a full Settings object (deep-copied groups). Pure. */
export function settingsToPreset(s: Settings): StylePreset {
  return {
    titleFont: { ...s.titleFont }, contentFont: { ...s.contentFont }, image: { ...s.image },
    margin: s.margin, padding: s.padding, imgPadding: s.imgPadding, paraGap: s.paraGap, textVAlign: s.textVAlign,
  };
}

/** Merge a preset onto settings → new Settings. border/paperSize/orientation untouched (a preset
 *  never carries them). Reuses the cascade merge; base is not mutated. Pure. */
export function applyPresetToSettings(s: Settings, preset: StylePreset): Settings {
  return resolveStyle(s, preset);
}

/** Remove every PRESET_KEY from an override; undefined if nothing remains (border/page kept). Pure. */
export function stripPresetKeys(o: StyleOverrides | undefined): StyleOverrides | undefined {
  if (!o) return undefined;
  const rest: StyleOverrides = { ...o };
  for (const k of PRESET_KEYS) delete (rest as Record<string, unknown>)[k];
  return Object.keys(rest).length ? rest : undefined;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/stylePreset.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/modules/flashcards/lib/stylePreset.ts tests/stylePreset.test.ts
git commit -m "feat: style preset pure core (capture/apply/strip, excludes border+page)"
```

---

### Task A2: Preset file IO — `stylePresetIO.ts`

**Files:**
- Create: `src/lib/modules/flashcards/io/stylePresetIO.ts`
- Test: `tests/stylePresetIO.test.ts`

**Interfaces:**
- Consumes: `StylePreset`, `settingsToPreset` from `../lib/stylePreset`; `DEFAULT_SETTINGS` from `../model`.
- Produces:
  - `interface StylePresetEntry { id: string; name: string; addedAt: number; preset: StylePreset }`
  - `mergePresetOverDefaults(p: Partial<StylePreset> | null | undefined): StylePreset`
  - `serializeStylePreset(name: string, preset: StylePreset): string`
  - `parseStylePreset(text: string): { name: string; preset: StylePreset }` (throws `Error('Not a valid Tomoe style preset file')`)
  - `looksLikeStylePresetFile(text: string): boolean`

- [ ] **Step 1: Write the failing test**

```ts
// tests/stylePresetIO.test.ts
import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/lib/modules/flashcards/model';
import { settingsToPreset } from '../src/lib/modules/flashcards/lib/stylePreset';
import { serializeStylePreset, parseStylePreset, looksLikeStylePresetFile, mergePresetOverDefaults } from '../src/lib/modules/flashcards/io/stylePresetIO';

describe('stylePresetIO', () => {
  const preset = settingsToPreset(DEFAULT_SETTINGS);
  it('serialize → parse round-trips (name + preset), ends with newline', () => {
    const text = serializeStylePreset('Warm', preset);
    expect(text.endsWith('\n')).toBe(true);
    const back = parseStylePreset(text);
    expect(back.name).toBe('Warm');
    expect(back.preset).toEqual(preset);
  });
  it('parse rejects a file without the marker', () => {
    expect(() => parseStylePreset('{"foo":1}')).toThrow('Not a valid Tomoe style preset file');
    expect(() => parseStylePreset('not json')).toThrow();
  });
  it('looksLikeStylePresetFile gates on the marker', () => {
    expect(looksLikeStylePresetFile(serializeStylePreset('X', preset))).toBe(true);
    expect(looksLikeStylePresetFile('{"tomoeSchema":1}')).toBe(false);
  });
  it('mergePresetOverDefaults fills newly-added keys for an old partial preset', () => {
    const partial = { margin: 30 } as any;
    const merged = mergePresetOverDefaults(partial);
    expect(merged.margin).toBe(30);
    expect(merged.titleFont.family).toBe(DEFAULT_SETTINGS.titleFont.family);
    expect(merged.image.borderRadius).toBe(DEFAULT_SETTINGS.image.borderRadius);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/stylePresetIO.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/modules/flashcards/io/stylePresetIO.ts
import { DEFAULT_SETTINGS } from '../model';
import { settingsToPreset, type StylePreset } from '../lib/stylePreset';

/** An app-level Style Preset Library entry (localStorage, NOT part of any project document). */
export interface StylePresetEntry { id: string; name: string; addedAt: number; preset: StylePreset }

interface StylePresetFile { tomoeStylePreset: 1; name: string; preset: StylePreset }

/** Merge a (possibly partial/old-build) preset over the default preset so newly-added keys fill in.
 *  Nested image/titleFont/contentFont merge field-by-field (mirrors parseProject's settings merge). */
export function mergePresetOverDefaults(p: Partial<StylePreset> | null | undefined): StylePreset {
  const base = settingsToPreset(DEFAULT_SETTINGS);
  const src = p ?? {};
  return {
    ...base, ...src,
    image: { ...base.image, ...(src.image ?? {}) },
    titleFont: { ...base.titleFont, ...(src.titleFont ?? {}) },
    contentFont: { ...base.contentFont, ...(src.contentFont ?? {}) },
  };
}

/** Emit a portable `.tomoestyle.json` payload. Deep-cloned; pretty JSON + trailing newline. */
export function serializeStylePreset(name: string, preset: StylePreset): string {
  const out: StylePresetFile = { tomoeStylePreset: 1, name, preset: structuredClone(preset) };
  return JSON.stringify(out, null, 2) + '\n';
}

/** Parse a portable preset file. Throws `Error('Not a valid Tomoe style preset file')` on bad shape. */
export function parseStylePreset(text: string): { name: string; preset: StylePreset } {
  let raw: any;
  try { raw = JSON.parse(text); } catch { throw new Error('Not a valid Tomoe style preset file'); }
  if (!raw || typeof raw !== 'object' || raw.tomoeStylePreset !== 1 || !raw.preset || typeof raw.preset !== 'object') {
    throw new Error('Not a valid Tomoe style preset file');
  }
  return { name: typeof raw.name === 'string' && raw.name ? raw.name : 'Preset', preset: mergePresetOverDefaults(raw.preset) };
}

/** True only for text that parses as JSON AND carries the `tomoeStylePreset` marker. Never throws. */
export function looksLikeStylePresetFile(text: string): boolean {
  try {
    const raw = JSON.parse(text);
    return !!raw && typeof raw === 'object' && raw.tomoeStylePreset === 1 && !!raw.preset && typeof raw.preset === 'object';
  } catch { return false; }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/stylePresetIO.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/modules/flashcards/io/stylePresetIO.ts tests/stylePresetIO.test.ts
git commit -m "feat: style preset file IO (serialize/parse/.tomoestyle.json)"
```

---

### Task A3: Store — library CRUD + `applyStylePreset` + modal open state

**Files:**
- Modify: `src/lib/modules/flashcards/stores.ts` (add a Style Preset Library section mirroring the Schema Library at lines ~88-157; add `applyStylePreset`; add `stylePresetOpen` writable near other UI-open writables e.g. `schemaLibraryOpen`)
- Test: `tests/stylePreset-store.test.ts`

**Interfaces:**
- Consumes: `applyPresetToSettings`, `stripPresetKeys`, `settingsToPreset`, `PRESET_KEYS`, `type StylePreset` from `./lib/stylePreset`; `StylePresetEntry`, `parseStylePreset` from `./io/stylePresetIO`; existing `project`, `commit`, `get`, `cardMapping`, `uid`.
- Produces:
  - `stylePresetLibrary: Readable<StylePresetEntry[]>`
  - `saveStylePreset(name: string): string`
  - `deleteStylePreset(id: string): void`
  - `renameStylePreset(id: string, name: string): void`
  - `importStylePresetText(text: string): { ok: boolean; name?: string; error?: string }`
  - `applyStylePreset(preset: StylePreset, opts: { syncViews: boolean; clearCards: boolean }): void`
  - `stylePresetOpen: Writable<boolean>`

- [ ] **Step 1: Write the failing test**

```ts
// tests/stylePreset-store.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import * as S from '../src/lib/modules/flashcards/stores';
import { settingsToPreset } from '../src/lib/modules/flashcards/lib/stylePreset';

beforeEach(() => { localStorage.clear(); S.initProject(); });

describe('style preset library store', () => {
  it('save/rename/delete round-trips through localStorage', () => {
    const id = S.saveStylePreset('Warm');
    expect(get(S.stylePresetLibrary).map((e) => e.name)).toEqual(['Warm']);
    S.renameStylePreset(id, 'Cool');
    expect(get(S.stylePresetLibrary)[0].name).toBe('Cool');
    S.deleteStylePreset(id);
    expect(get(S.stylePresetLibrary)).toEqual([]);
  });
});

describe('applyStylePreset', () => {
  it('writes Global; syncViews strips view overrides (keeps border); clearCards strips card overrides', () => {
    const sid = S.addSchema('Cards');
    S.updateSchema(sid, { fields: [{ id: 'f1', key: 'title', label: 'Title', type: 'text', multilingual: true }] });
    const rid = S.addRecord(sid);
    // give the view a font override + a border override; and a card style override
    S.setTemplateStyle(sid, { titleFont: { size: 99 }, border: { width: 7 } });
    // pack a card so it has an id + style
    const tid = get(S.project).schemas[0].cardTemplates[0]?.id;
    const preset = { ...settingsToPreset(get(S.project).settings), margin: 40 };

    S.applyStylePreset(preset, { syncViews: true, clearCards: true });

    const p = get(S.project);
    expect(p.settings.margin).toBe(40);                    // Global written
    const vstyle = p.schemas[0].cardTemplates[0].style;
    expect(vstyle?.titleFont).toBeUndefined();             // preset key stripped from view
    expect(vstyle?.border).toEqual({ width: 7 });          // border override kept
  });

  it('with both flags off, only Global changes (view/card overrides intact)', () => {
    const sid = S.addSchema('Cards');
    S.updateSchema(sid, { fields: [{ id: 'f1', key: 'title', label: 'Title', type: 'text', multilingual: true }] });
    S.setTemplateStyle(sid, { titleFont: { size: 99 } });
    const preset = { ...settingsToPreset(get(S.project).settings), margin: 40 };
    S.applyStylePreset(preset, { syncViews: false, clearCards: false });
    const p = get(S.project);
    expect(p.settings.margin).toBe(40);
    expect(p.schemas[0].cardTemplates[0].style?.titleFont).toEqual({ size: 99 });
  });
});
```

> Note: adjust the setup calls (`addSchema`/`updateSchema`/`addRecord`/`setTemplateStyle`) to the real store API names if they differ — verify against `stores.ts` when implementing; the assertions are the contract.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/stylePreset-store.test.ts`
Expected: FAIL — `saveStylePreset`/`applyStylePreset` undefined.

- [ ] **Step 3: Write minimal implementation** (append to `stores.ts`)

```ts
// ── Style Preset Library (localStorage, app-level — mirrors the Schema Library) ──────────────
import { settingsToPreset, applyPresetToSettings, stripPresetKeys, type StylePreset } from './lib/stylePreset';
import { type StylePresetEntry, parseStylePreset } from './io/stylePresetIO';

const STYLE_PRESET_KEY = 'tomoe.flashcards.stylePresetLibrary';
function loadStylePresets(): StylePresetEntry[] {
  try { const raw = localStorage.getItem(STYLE_PRESET_KEY); const a = raw ? JSON.parse(raw) : []; return Array.isArray(a) ? a : []; }
  catch { return []; }
}
function persistStylePresets(list: StylePresetEntry[]): void {
  try { localStorage.setItem(STYLE_PRESET_KEY, JSON.stringify(list)); } catch { /* ignore */ }
}
const _stylePresetVersion = writable(0);
export const stylePresetLibrary: Readable<StylePresetEntry[]> = derived(_stylePresetVersion, () => loadStylePresets());
export const stylePresetOpen = writable(false);

export function saveStylePreset(name: string): string {
  const id = uid('sp');
  const entry: StylePresetEntry = { id, name, addedAt: Date.now(), preset: settingsToPreset(get(project).settings) };
  persistStylePresets([entry, ...loadStylePresets()]);
  _stylePresetVersion.update((n) => n + 1);
  return id;
}
export function deleteStylePreset(id: string): void {
  persistStylePresets(loadStylePresets().filter((e) => e.id !== id));
  _stylePresetVersion.update((n) => n + 1);
}
export function renameStylePreset(id: string, name: string): void {
  persistStylePresets(loadStylePresets().map((e) => (e.id === id ? { ...e, name } : e)));
  _stylePresetVersion.update((n) => n + 1);
}
export function importStylePresetText(text: string): { ok: boolean; name?: string; error?: string } {
  try {
    const { name, preset } = parseStylePreset(text);
    const entry: StylePresetEntry = { id: uid('sp'), name, addedAt: Date.now(), preset };
    persistStylePresets([entry, ...loadStylePresets()]);
    _stylePresetVersion.update((n) => n + 1);
    return { ok: true, name };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Not a valid Tomoe style preset file' }; }
}

/** Apply a preset project-wide in one undo step: always write Global; optionally strip preset keys
 *  from every view (template.style) and/or card (card.style) so they inherit the new Global. */
export function applyStylePreset(preset: StylePreset, opts: { syncViews: boolean; clearCards: boolean }): void {
  let np = cardMapping.applySettings(get(project), preset);
  if (opts.syncViews) {
    np = { ...np, schemas: np.schemas.map((s) => ({
      ...s, cardTemplates: s.cardTemplates.map((t) => (t.style ? { ...t, style: stripPresetKeys(t.style) } : t)),
    })) };
  }
  if (opts.clearCards) {
    np = { ...np, cards: np.cards.map((c) => (c.style ? { ...c, style: stripPresetKeys(c.style) } : c)) };
  }
  commit(np);
}
```

> Place the `import` lines with the other imports at the top of `stores.ts` (not mid-file). Move them up when implementing.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/stylePreset-store.test.ts`
Expected: PASS. Also run `npx vitest run tests/flashcards-stores.test.ts` — still green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/modules/flashcards/stores.ts tests/stylePreset-store.test.ts
git commit -m "feat: style preset library store + applyStylePreset (Global/view/card)"
```

---

### Task A4: `StylePresetModal.svelte` (library UI)

**Files:**
- Create: `src/lib/modules/flashcards/components/StylePresetModal.svelte`
- Test: `tests/StylePresetModal.test.ts`

**Interfaces:**
- Consumes: `stylePresetLibrary`, `saveStylePreset`, `deleteStylePreset`, `renameStylePreset`, `importStylePresetText`, `applyStylePreset`, `showToast` (from `../../../shell`), `serializeStylePreset` (export).
- Props: `{ onClose: () => void }`.

**Structure** (mirror `SchemaLibraryModal.svelte` layout + the modal shell/overlay CSS used across the module, e.g. `AutofillImagesModal.svelte`):
- Header: title "Style presets" + close (X).
- Row: text input for a name + **"Save current"** button → `saveStylePreset(name)` then toast; also **"Import…"** (hidden `<input type=file accept=".json,.tomoestyle.json">` → read text → `importStylePresetText`).
- List of `$stylePresetLibrary`: each row shows name, **Apply**, **Export**, **Rename**, **Delete**.
- **Apply** opens an inline confirm block with two checkboxes bound to local `$state` `syncViews = true`, `clearCards = true`, then a confirm button → `applyStylePreset(entry.preset, { syncViews, clearCards })`, toast summary, `onClose()`.
- **Export** → build `serializeStylePreset(entry.name, entry.preset)`, save via `@tauri-apps/plugin-dialog` `save` + `@tauri-apps/plugin-fs` `writeTextFile` (follow the existing export pattern in `ExportModal.svelte`/schema export).

- [ ] **Step 1: Write the failing test**

```ts
// tests/StylePresetModal.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { render, fireEvent, screen } from '@testing-library/svelte';
import StylePresetModal from '../src/lib/modules/flashcards/components/StylePresetModal.svelte';
import * as S from '../src/lib/modules/flashcards/stores';

beforeEach(() => { localStorage.clear(); S.initProject(); });

describe('StylePresetModal', () => {
  it('saves the current style as a named preset', async () => {
    render(StylePresetModal, { props: { onClose: () => {} } });
    await fireEvent.input(screen.getByLabelText('Preset name'), { target: { value: 'Warm' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Save current' }));
    expect(get(S.stylePresetLibrary).map((e) => e.name)).toEqual(['Warm']);
  });

  it('applies a preset with the chosen options (writes Global)', async () => {
    S.saveStylePreset('Base');                     // seed one
    render(StylePresetModal, { props: { onClose: () => {} } });
    await fireEvent.click(screen.getByRole('button', { name: /Apply/ }));      // open confirm
    await fireEvent.click(screen.getByRole('button', { name: /^Apply preset$/ })); // confirm
    // no throw + preset library intact
    expect(get(S.stylePresetLibrary).length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/StylePresetModal.test.ts`
Expected: FAIL — component missing.

- [ ] **Step 3: Write the component** (mirror `SchemaLibraryModal.svelte`; use module modal CSS). Implement to satisfy the aria labels/roles above: `aria-label="Preset name"`, buttons "Save current", "Apply", "Apply preset", "Export", "Rename", "Delete"; checkboxes "Đồng bộ cả View"/"Xoá override từng thẻ" default checked.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/StylePresetModal.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/modules/flashcards/components/StylePresetModal.svelte tests/StylePresetModal.test.ts
git commit -m "feat: StylePresetModal — save/apply/import/export style presets"
```

---

### Task A5: Wire the modal — "Presets" button + mount

**Files:**
- Modify: `src/lib/modules/flashcards/components/StyleControls.svelte` (add a "Presets" button in the `.scope-row`, opening `stylePresetOpen.set(true)`)
- Modify: whichever component mounts the other modals (check `Workspace.svelte` / `CardPreview.svelte` for where `SchemaLibraryModal` is mounted) — mount `{#if $stylePresetOpen}<StylePresetModal onClose={() => stylePresetOpen.set(false)} />{/if}`.
- Test: extend `tests/StyleControls.test.ts` — clicking "Presets" sets `stylePresetOpen`.

- [ ] **Step 1: Write the failing test**

```ts
// add to tests/StyleControls.test.ts
it('Presets button opens the style-preset modal', async () => {
  const { get } = await import('svelte/store');
  render(StyleControls);
  await fireEvent.click(screen.getByRole('button', { name: /Presets/ }));
  expect(get(S.stylePresetOpen)).toBe(true);
});
```

- [ ] **Step 2: Run** `npx vitest run tests/StyleControls.test.ts` — Expected: FAIL (no Presets button).
- [ ] **Step 3:** Add the button to `.scope-row` in `StyleControls.svelte`:

```svelte
<button type="button" class="preset-btn" title="Style presets" onclick={() => stylePresetOpen.set(true)}>
  <Layers size={13} /> Presets
</button>
```
(import `stylePresetOpen` from `../stores`; reuse an existing lucide icon already imported). Mount the modal where `SchemaLibraryModal` is mounted.

- [ ] **Step 4: Run** `npx vitest run tests/StyleControls.test.ts` + `npm run check` — Expected: PASS, 0 type errors.
- [ ] **Step 5: Commit**

```bash
git add src/lib/modules/flashcards/components/StyleControls.svelte tests/StyleControls.test.ts <mount-file>
git commit -m "feat: Presets button + mount StylePresetModal"
```

---

### Task A6: Phase-A verification gate

- [ ] Run `npm run check` (0 errors), `npm test` (green), `npm run build` (passes).
- [ ] Manual smoke (optional): `npm run tauri dev` → style a card → Presets → Save current → tweak Global → Apply with both options → all cards follow it; border unchanged.
- [ ] Commit any fixups. Phase A ships here.

---

# PHASE B — Continent colour

### Task B1: `Project.category` in the model

**Files:**
- Modify: `src/lib/modules/flashcards/model.ts` (add `category?: string` to `Project`; set it in `parseProject`; it serialises automatically via `serializeProject`/`deflateAssets` spread — verify it survives)
- Test: extend `tests/flashcards-model.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// add to tests/flashcards-model.test.ts
it('round-trips Project.category and omits it when undefined', () => {
  const p = newProject(); p.category = 'europe';
  expect(parseProject(serializeProject(p)).category).toBe('europe');
  const p2 = newProject();
  expect('category' in JSON.parse(serializeProject(p2))).toBe(false);
  expect(parseProject(serializeProject(p2)).category).toBeUndefined();
});
```

- [ ] **Step 2: Run** `npx vitest run tests/flashcards-model.test.ts` — Expected: FAIL (category not preserved).
- [ ] **Step 3: Implement**
  - In `interface Project` add `category?: string`.
  - In `parseProject`'s returned object add: `category: typeof raw.category === 'string' ? raw.category : undefined,`.
  - `serializeProject` spreads the project into JSON; an `undefined` category is dropped by `JSON.stringify` automatically — confirm `newProject()` does not set `category`.
- [ ] **Step 4: Run** `npx vitest run tests/flashcards-model.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add src/lib/modules/flashcards/model.ts tests/flashcards-model.test.ts
git commit -m "feat: Project.category metadata (continent) round-trips"
```

---

### Task B2: Store — `setProjectCategory`

**Files:**
- Modify: `src/lib/modules/flashcards/stores.ts` (add `setProjectCategory`; import `continentColors` is already in this file)
- Test: `tests/continent-category.test.ts`

**Interfaces:**
- Produces: `setProjectCategory(key: string | null): void`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/continent-category.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import * as S from '../src/lib/modules/flashcards/stores';
import { CONTINENT_COLORS } from '../src/lib/modules/flashcards/lib/palette';

beforeEach(() => { localStorage.clear(); S.initProject(); });

describe('setProjectCategory', () => {
  it('sets category and applies the continent border colour to Global', () => {
    S.setProjectCategory('europe');
    const p = get(S.project);
    expect(p.category).toBe('europe');
    expect(p.settings.border.color.toLowerCase()).toBe(CONTINENT_COLORS.find((c) => c.key === 'europe')!.hex.toLowerCase());
  });
  it('None clears category and leaves border colour unchanged', () => {
    const before = get(S.project).settings.border.color;
    S.setProjectCategory(null);
    const p = get(S.project);
    expect(p.category).toBeUndefined();
    expect(p.settings.border.color).toBe(before);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/continent-category.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** (append to `stores.ts`):

```ts
/** Set the project's continent (or null = none) in one undo step. A continent also auto-applies its
 *  signature colour to Global border (from the remappable `continentColors` store); None leaves
 *  the border colour untouched. The "what a continent contributes" is isolated for future growth. */
function continentPatch(key: string): StyleOverrides {
  return { border: { color: get(continentColors)[key] } };
}
export function setProjectCategory(key: string | null): void {
  const p = get(project);
  if (!key) { commit({ ...p, category: undefined }); return; }
  const np = cardMapping.applySettings(p, continentPatch(key));
  commit({ ...np, category: key });
}
```
(ensure `StyleOverrides` is imported in `stores.ts`.)

- [ ] **Step 4: Run** `npx vitest run tests/continent-category.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add src/lib/modules/flashcards/stores.ts tests/continent-category.test.ts
git commit -m "feat: setProjectCategory — continent auto-applies border colour"
```

---

### Task B3: Header continent dropdown

**Files:**
- Modify: `src/lib/modules/flashcards/Workspace.svelte` (add a `<select>` next to `.project-name`, options None + `CONTINENT_COLORS` localised by `$project.activeLocale`, bound to `$project.category`, `onchange` → `setProjectCategory(value || null)`; import `CONTINENT_COLORS` from `./lib/palette`, `setProjectCategory` from `./stores`)
- Test: extend a Workspace component test (or add `tests/continent-dropdown.test.ts`)

- [ ] **Step 1: Write the failing test**

```ts
// tests/continent-dropdown.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { render, fireEvent, screen } from '@testing-library/svelte';
import Workspace from '../src/lib/modules/flashcards/Workspace.svelte';
import * as S from '../src/lib/modules/flashcards/stores';

beforeEach(() => { S.initProject(); });

describe('continent dropdown', () => {
  it('selecting a continent sets category + border colour', async () => {
    render(Workspace);
    await fireEvent.change(screen.getByLabelText('Continent'), { target: { value: 'europe' } });
    expect(get(S.project).category).toBe('europe');
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/continent-dropdown.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** in the header (after the `.project-name` input):

```svelte
<select class="continent-select" aria-label="Continent"
  value={$project.category ?? ''}
  onchange={(e) => setProjectCategory((e.target as HTMLSelectElement).value || null)}>
  <option value="">— No continent —</option>
  {#each CONTINENT_COLORS as c (c.key)}
    <option value={c.key}>{$project.activeLocale === 'vi' ? c.vi : c.en}</option>
  {/each}
</select>
```

- [ ] **Step 4: Run** `npx vitest run tests/continent-dropdown.test.ts` + `npm run check` — Expected: PASS, 0 errors.
- [ ] **Step 5: Commit**

```bash
git add src/lib/modules/flashcards/Workspace.svelte tests/continent-dropdown.test.ts
git commit -m "feat: continent dropdown in project header"
```

---

### Task B4: Full verification gate

- [ ] `npm run check` (0 errors), `npm test` (green), `npm run build` (passes).
- [ ] Manual smoke (optional): pick Europe → border turns red; pick None → border stays; Style preset Apply still leaves border (continent colour) intact.
- [ ] Commit fixups. Done.

---

## Notes for the implementer

- **Verify store API names before Task A3's test** — `addSchema`/`updateSchema`/`addRecord`/`setTemplateStyle`/`initProject` are assumed from existing tests (`tests/StyleControls.test.ts`, `tests/flashcards-stores.test.ts`); confirm exact names and adapt setup (not assertions).
- **Where modals mount** — grep for `SchemaLibraryModal` to find the mount site and mirror it for `StylePresetModal`.
- **Toasts** — `import { showToast } from '../../../shell'` (see `ImageField.svelte`).
- **Tauri file save/read** — mirror the existing export/import in `ExportModal.svelte` + schema import; guard for non-Tauri (tests) so component tests don't hit `@tauri-apps`.
