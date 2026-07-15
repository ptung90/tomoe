# Schema Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a flashcards schema (its fields + views/`cardTemplates` + per-view style — no records,
no packed cards) be saved once to an app-level Schema Library and reused across any `.tomoe.json`
project on the machine, and shared as a portable `.schema.json` file that "just opens" in Tomoe
(imported into the library, non-destructively, on open).

**Architecture:** A pure I/O layer (`io/schemaIO.ts`) defines the portable `.schema.json` format
(`serializeSchemaExport`/`parseSchemaExport`/`looksLikeSchemaFile`). A `localStorage`-backed store
in `stores.ts` (mirroring the existing `aiConfig` pattern) holds `SchemaLibraryEntry[]` — app-level
state that is never part of the `Project` document and is never touched by `initProject`/
`loadProject`. A pure `insertSchema(project, entry): Project` in `cardMapping.ts` copies a library
entry into a project with fresh ids. A new `SchemaLibraryModal.svelte` exposes list/insert/export/
delete/import-from-file/add-current-schema. The shell's `fileService.openPath` gets a small,
documented hook that gates `.schema.json` files into the library instead of normal module routing.

**Tech Stack:** Svelte 5 (runes), TypeScript, vitest + @testing-library/svelte, `@tauri-apps/plugin-fs`
(`readTextFile`/`writeTextFile`), `@tauri-apps/plugin-dialog` (`open`/`save`/`confirm`), `localStorage`.

## Global Constraints

- Svelte 5 runes only (no `$:`).
- lucide-svelte subpath imports only (e.g. `lucide-svelte/icons/library`), never the barrel.
- Card interior = fixed print colors, chrome = Calm Paper tokens (`var(--accent)` etc.) — no
  hardcoded hex in chrome.
- Pure logic is immutable + TDD (failing test first).
- The localStorage-backed Schema Library is app-level: it is NOT part of the project document, and
  it is NOT cleared by `initProject`/`loadProject`.
- Gates: `npm run check` must be 0 errors; `npm test` must be green (Windows transient EBUSY on the
  vitest cache → re-run once); `npm run build` must succeed; the `tauri.conf.json` change is gated
  by `cd src-tauri && cargo check`.
- Commit only the files changed for that task. NEVER stage `.gitignore`, `package.json`,
  `src-tauri/SIGNING.md`, `src-tauri/signing/`, `src-tauri/tauri.signing.conf.json.example`.

---

## Context for the implementer

Current state (read these before starting):
- `src/lib/modules/flashcards/model.ts` — `Schema { id, name, fields, cardTemplates }`,
  `CardTemplate`, `SchemaField`, `Settings`, `DEFAULT_SETTINGS`, `uid(prefix)`, `serializeProject`,
  `parseProject` (settings merged field-group-by-field-group over `DEFAULT_SETTINGS`).
- `src/lib/modules/flashcards/stores.ts` — `project: Readable<Project>`, `commit(next)`,
  `activeSchemaId: Writable<string|null>`, the `aiConfig` localStorage pattern (load-at-import +
  persist-on-write), `initProject()`/`loadProject()` (must NOT touch the schema library).
- `src/lib/modules/flashcards/cardMapping.ts` — pure project-transform functions
  (`applySettings`, `applyTemplatePatch`, `addView`, …), all `{ ...p, ... }` immutable style, `uid`
  already imported.
- `src/lib/fileService.ts` — `openPath(path)` currently: `confirmDiscardIfDirty()` → `readTextFile`
  → `pickModuleForOpen` → `mod.open` → `recordRecent`. This plan reorders it: read text first,
  gate schema files out BEFORE the dirty-guard/module routing.
- `src/lib/modules/registry.ts` `pickModuleForOpen` — unchanged by this plan (the schema-file
  branch in `fileService.ts` returns before ever calling it).
- `src-tauri/tauri.conf.json` — `bundle.fileAssociations[0].ext` currently
  `["tomoe.json", "json"]`; this plan adds `"schema.json"`.
- A modal to model structure/tokens after: `src/lib/modules/flashcards/components/SchemaEditorModal.svelte`
  (`.overlay`/`.modal`/`.modal-head`/`.modal-body` classes, Calm Paper tokens, a `Writable` open-state
  store, `tauri-apps/plugin-dialog confirm` for destructive actions). Modals are mounted at the
  bottom of `src/lib/modules/flashcards/Workspace.svelte` (`<SchemaEditorModal /><CardEditorModal /><PrintView />`).

---

### Task 1: File I/O + format (`io/schemaIO.ts`)

**Files:**
- Create: `src/lib/modules/flashcards/io/schemaIO.ts`
- Test: `tests/schemaIO.test.ts`

**Interfaces:**
- Consumes: `DEFAULT_SETTINGS`, `type SchemaField`, `type CardTemplate`, `type Settings` from
  `../model` (relative to `io/`, i.e. `src/lib/modules/flashcards/model.ts`).
- Produces (consumed by Tasks 2–4):
  - `interface SchemaExportPayload { name: string; fields: SchemaField[]; cardTemplates: CardTemplate[] }`
    — the portable, id-less shape of a schema. Deliberately narrower than `Schema` (which requires
    an `id`): a fresh id is always assigned on insert (Task 2's `insertSchema`), and a full `Schema`
    object is structurally assignable to this type (the extra `id` is simply ignored), so the same
    function serializes either a live project schema or a stored library entry.
  - `interface SchemaLibraryEntry { id: string; name: string; addedAt: number; schema: SchemaExportPayload; settings: Settings }`
  - `function mergeSettingsOverDefaults(s: Partial<Settings> | undefined | null): Settings`
  - `function serializeSchemaExport(schema: SchemaExportPayload, settings: Settings): string`
  - `function parseSchemaExport(text: string): { schema: SchemaExportPayload; settings: Settings }` — throws `Error('Not a valid Tomoe schema file')`
  - `function looksLikeSchemaFile(text: string): boolean` — pure, never throws

- [ ] **Step 1: Write the failing test file**

Create `tests/schemaIO.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { serializeSchemaExport, parseSchemaExport, looksLikeSchemaFile } from '../src/lib/modules/flashcards/io/schemaIO';
import { DEFAULT_SETTINGS, type Schema, type Settings } from '../src/lib/modules/flashcards/model';

function sampleSchema(): Schema {
  return {
    id: 'sch_1', name: 'Words',
    fields: [{ id: 'f1', key: 'w', label: 'Word', type: 'text', multilingual: true }],
    cardTemplates: [{
      id: 'tpl_1', templateType: 'single', layout: 'fulltext', size: null, mapping: {},
      fields: ['w'], gridCols: 2, gridRows: 3,
      style: { border: { width: 6 } },
    }],
  };
}
function sampleSettings(): Settings {
  return { ...DEFAULT_SETTINGS, paperSize: 'A6', border: { ...DEFAULT_SETTINGS.border, color: '#111111' } };
}

describe('serializeSchemaExport', () => {
  it('emits the tomoeSchema marker + name/fields/cardTemplates + settings, ending with a newline', () => {
    const text = serializeSchemaExport(sampleSchema(), sampleSettings());
    expect(text.endsWith('\n')).toBe(true);
    const parsed = JSON.parse(text);
    expect(parsed.tomoeSchema).toBe(1);
    expect(parsed.schema.name).toBe('Words');
    expect(parsed.schema.fields).toEqual(sampleSchema().fields);
    expect(parsed.schema.cardTemplates).toEqual(sampleSchema().cardTemplates);
    expect(parsed.settings.paperSize).toBe('A6');
    expect(parsed.schema.id).toBeUndefined(); // no id — a fresh one is assigned on insert
  });
  it('never includes records or cards even if present on the input object', () => {
    const withExtra = { ...sampleSchema(), records: [{ id: 'r1' }], cards: [{ id: 'c1' }] } as any;
    const text = serializeSchemaExport(withExtra, sampleSettings());
    const parsed = JSON.parse(text);
    expect(parsed.records).toBeUndefined();
    expect(parsed.cards).toBeUndefined();
    expect(parsed.schema.records).toBeUndefined();
  });
  it('deep-clones — mutating the source after serializing does not change the emitted text', () => {
    const schema = sampleSchema();
    const settings = sampleSettings();
    const text = serializeSchemaExport(schema, settings);
    schema.fields[0].label = 'MUTATED';
    settings.paperSize = 'Letter';
    expect(text).not.toContain('MUTATED');
    expect(JSON.parse(text).settings.paperSize).toBe('A6');
  });
});

describe('parseSchemaExport', () => {
  it('round-trips a serialized schema (fields + cardTemplates incl. style/fields/gridCols) + settings', () => {
    const schema = sampleSchema();
    const settings = sampleSettings();
    const text = serializeSchemaExport(schema, settings);
    const { schema: outSchema, settings: outSettings } = parseSchemaExport(text);
    expect(outSchema.name).toBe('Words');
    expect(outSchema.fields).toEqual(schema.fields);
    expect(outSchema.cardTemplates).toEqual(schema.cardTemplates);
    expect(outSettings.paperSize).toBe('A6');
    expect(outSettings.border.color).toBe('#111111');
  });
  it('merges settings over DEFAULT_SETTINGS for forward-safety (missing keys backfilled)', () => {
    const text = JSON.stringify({ tomoeSchema: 1, schema: { name: 'X', fields: [], cardTemplates: [] }, settings: { paperSize: 'A6' } }) + '\n';
    const { settings } = parseSchemaExport(text);
    expect(settings.paperSize).toBe('A6');
    expect(settings.titleFont.family).toBe(DEFAULT_SETTINGS.titleFont.family); // backfilled
    expect(settings.border).toEqual(DEFAULT_SETTINGS.border); // backfilled
  });
  it('throws "Not a valid Tomoe schema file" when the tomoeSchema marker is missing', () => {
    const text = JSON.stringify({ schema: { name: 'X', fields: [], cardTemplates: [] }, settings: {} });
    expect(() => parseSchemaExport(text)).toThrow('Not a valid Tomoe schema file');
  });
  it('throws when schema.fields or schema.cardTemplates is not an array', () => {
    const text = JSON.stringify({ tomoeSchema: 1, schema: { name: 'X' }, settings: {} });
    expect(() => parseSchemaExport(text)).toThrow('Not a valid Tomoe schema file');
  });
  it('throws on unparseable JSON', () => {
    expect(() => parseSchemaExport('not json')).toThrow('Not a valid Tomoe schema file');
  });
});

describe('looksLikeSchemaFile', () => {
  it('true for a marked schema export', () => {
    expect(looksLikeSchemaFile(serializeSchemaExport(sampleSchema(), sampleSettings()))).toBe(true);
  });
  it('false for a normal .tomoe.json project (no marker)', () => {
    expect(looksLikeSchemaFile(JSON.stringify({ projectName: 'P', schemas: [], records: [], cards: [] }))).toBe(false);
  });
  it('false for junk text, never throws', () => {
    expect(looksLikeSchemaFile('not json')).toBe(false);
    expect(looksLikeSchemaFile('')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/schemaIO.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/modules/flashcards/io/schemaIO'`

- [ ] **Step 3: Write the implementation**

Create `src/lib/modules/flashcards/io/schemaIO.ts`:

```ts
import { DEFAULT_SETTINGS, type SchemaField, type CardTemplate, type Settings } from '../model';

/** The portable, id-less shape of a schema: everything needed to recreate it in another
 *  project, minus the schema's own `id` (a fresh one is always assigned on insert — see
 *  `cardMapping.insertSchema`) and minus records/cards (never shared). A live `Schema` (which
 *  has an `id`) is structurally assignable here since the extra `id` field is simply ignored. */
export interface SchemaExportPayload {
  name: string;
  fields: SchemaField[];
  cardTemplates: CardTemplate[];
}

/** An app-level Schema Library entry (localStorage, NOT part of any project document). */
export interface SchemaLibraryEntry {
  id: string;
  name: string;
  addedAt: number;
  schema: SchemaExportPayload;
  settings: Settings;
}

interface SchemaExportFile {
  tomoeSchema: 1;
  schema: SchemaExportPayload;
  settings: Settings;
}

/** Merge a (possibly partial/legacy) settings object over DEFAULT_SETTINGS, field-group by
 *  field-group — mirrors `parseProject`'s settings merge in model.ts so a schema exported from
 *  an old Tomoe build still fills in newly-added Settings keys. */
export function mergeSettingsOverDefaults(s: Partial<Settings> | undefined | null): Settings {
  const src = s ?? {};
  return {
    ...DEFAULT_SETTINGS, ...src,
    border: { ...DEFAULT_SETTINGS.border, ...(src.border ?? {}) },
    image: { ...DEFAULT_SETTINGS.image, ...(src.image ?? {}) },
    titleFont: { ...DEFAULT_SETTINGS.titleFont, ...(src.titleFont ?? {}) },
    contentFont: { ...DEFAULT_SETTINGS.contentFont, ...(src.contentFont ?? {}) },
  };
}

/** Emit a portable `.schema.json` payload for `schema` — fields + cardTemplates only, no
 *  records/cards ever. Deep-cloned so later mutation of the source can't retroactively change
 *  already-serialized text. Pretty JSON + trailing newline (matches `serializeProject`). */
export function serializeSchemaExport(schema: SchemaExportPayload, settings: Settings): string {
  const out: SchemaExportFile = {
    tomoeSchema: 1,
    schema: structuredClone({ name: schema.name, fields: schema.fields, cardTemplates: schema.cardTemplates }),
    settings: structuredClone(settings),
  };
  return JSON.stringify(out, null, 2) + '\n';
}

/** Parse a portable schema file. Throws `Error('Not a valid Tomoe schema file')` when the
 *  `tomoeSchema` marker is missing or `schema.fields`/`schema.cardTemplates` aren't arrays.
 *  Settings are merged over DEFAULT_SETTINGS for forward-safety, like `parseProject`. */
export function parseSchemaExport(text: string): { schema: SchemaExportPayload; settings: Settings } {
  let raw: any;
  try { raw = JSON.parse(text); } catch { throw new Error('Not a valid Tomoe schema file'); }
  if (
    !raw || typeof raw !== 'object' || raw.tomoeSchema !== 1 ||
    !raw.schema || typeof raw.schema !== 'object' ||
    !Array.isArray(raw.schema.fields) || !Array.isArray(raw.schema.cardTemplates)
  ) {
    throw new Error('Not a valid Tomoe schema file');
  }
  return {
    schema: { name: raw.schema.name || 'Records', fields: raw.schema.fields, cardTemplates: raw.schema.cardTemplates },
    settings: mergeSettingsOverDefaults(raw.settings),
  };
}

/** True only for text that parses as JSON AND carries the `tomoeSchema` marker + well-formed
 *  schema shape — used by the shell's open-router to gate `.schema.json` files away from normal
 *  module routing. Pure; never throws (mirrors `looksLikeFlashcards` in model.ts). */
export function looksLikeSchemaFile(text: string): boolean {
  try {
    const raw = JSON.parse(text);
    return !!raw && typeof raw === 'object' && raw.tomoeSchema === 1 &&
      !!raw.schema && typeof raw.schema === 'object' &&
      Array.isArray(raw.schema.fields) && Array.isArray(raw.schema.cardTemplates);
  } catch { return false; }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/schemaIO.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/modules/flashcards/io/schemaIO.ts tests/schemaIO.test.ts
git commit -m "feat: add schema export/import format (io/schemaIO.ts)"
```

---

### Task 2: Library store + insert

**Files:**
- Modify: `src/lib/modules/flashcards/stores.ts`
- Modify: `src/lib/modules/flashcards/cardMapping.ts`
- Test: `tests/schema-library.test.ts`

**Interfaces:**
- Consumes: `SchemaExportPayload`, `SchemaLibraryEntry`, `parseSchemaExport`,
  `mergeSettingsOverDefaults` from `./io/schemaIO` (Task 1); `uid`, `type Project`, `type Schema`,
  `type Settings`, `DEFAULT_SETTINGS` from `./model`; `project: Readable<Project>`, `commit(next)`,
  `activeSchemaId: Writable<string|null>` (already in `stores.ts`).
- Produces (consumed by Task 3):
  - `stores.ts`: `schemaLibrary: Readable<SchemaLibraryEntry[]>`
  - `stores.ts`: `function addToLibrary(entry: { name: string; schema: SchemaExportPayload; settings: Settings }): string`
  - `stores.ts`: `function removeFromLibrary(id: string): void`
  - `stores.ts`: `function addSchemaToLibrary(schemaId: string): void`
  - `stores.ts`: `function importSchemaFileText(text: string): { ok: boolean; name?: string; error?: string }`
  - `stores.ts`: `function insertLibrarySchema(id: string): void`
  - `cardMapping.ts`: `function insertSchema(p: Project, entry: SchemaLibraryEntry): Project`

- [ ] **Step 1: Write the failing test file**

Create `tests/schema-library.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import * as S from '../src/lib/modules/flashcards/stores';
import { insertSchema } from '../src/lib/modules/flashcards/cardMapping';
import { serializeSchemaExport } from '../src/lib/modules/flashcards/io/schemaIO';
import { DEFAULT_SETTINGS, newProject } from '../src/lib/modules/flashcards/model';
import type { SchemaLibraryEntry } from '../src/lib/modules/flashcards/io/schemaIO';

beforeEach(() => {
  localStorage.clear();
  S.initProject();
});

describe('schema library store', () => {
  it('addToLibrary prepends a new entry, stamps addedAt, and persists to localStorage', () => {
    const id = S.addToLibrary({ name: 'Words', schema: { name: 'Words', fields: [], cardTemplates: [] }, settings: DEFAULT_SETTINGS });
    const list = get(S.schemaLibrary);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(id);
    expect(list[0].name).toBe('Words');
    expect(typeof list[0].addedAt).toBe('number');
    const stored = JSON.parse(localStorage.getItem('tomoe.flashcards.schemaLibrary')!);
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe(id);
  });

  it('a second addToLibrary call prepends before the first (newest first)', () => {
    const id1 = S.addToLibrary({ name: 'A', schema: { name: 'A', fields: [], cardTemplates: [] }, settings: DEFAULT_SETTINGS });
    const id2 = S.addToLibrary({ name: 'B', schema: { name: 'B', fields: [], cardTemplates: [] }, settings: DEFAULT_SETTINGS });
    expect(get(S.schemaLibrary).map((e) => e.id)).toEqual([id2, id1]);
  });

  it('removeFromLibrary drops the entry and persists', () => {
    const id = S.addToLibrary({ name: 'Words', schema: { name: 'Words', fields: [], cardTemplates: [] }, settings: DEFAULT_SETTINGS });
    S.removeFromLibrary(id);
    expect(get(S.schemaLibrary)).toHaveLength(0);
    expect(JSON.parse(localStorage.getItem('tomoe.flashcards.schemaLibrary')!)).toHaveLength(0);
  });

  it('addSchemaToLibrary snapshots the current schema + the project global settings', () => {
    const sid = S.addSchema('Verbs');
    S.updateSchema(sid, { fields: [{ id: 'f1', key: 'w', label: 'Word', type: 'text', multilingual: true }] });
    S.setTemplateStyle(sid, { border: { width: 9 } });
    S.setSettings({ paperSize: 'A6' });
    S.addSchemaToLibrary(sid);
    const entry = get(S.schemaLibrary)[0];
    expect(entry.name).toBe('Verbs');
    expect(entry.schema.fields[0].key).toBe('w');
    expect(entry.schema.cardTemplates[0].style?.border?.width).toBe(9);
    expect(entry.settings.paperSize).toBe('A6');
  });

  it('addSchemaToLibrary is a no-op for an unknown schema id', () => {
    S.addSchemaToLibrary('does-not-exist');
    expect(get(S.schemaLibrary)).toHaveLength(0);
  });

  it('importSchemaFileText adds a valid export to the library and returns {ok:true, name}', () => {
    const text = serializeSchemaExport({ name: 'Imported', fields: [], cardTemplates: [] }, DEFAULT_SETTINGS);
    const res = S.importSchemaFileText(text);
    expect(res).toEqual({ ok: true, name: 'Imported' });
    expect(get(S.schemaLibrary)).toHaveLength(1);
  });

  it('importSchemaFileText never throws — returns {ok:false, error} on bad text', () => {
    const res = S.importSchemaFileText('not json');
    expect(res.ok).toBe(false);
    expect(res.error).toBe('Not a valid Tomoe schema file');
    expect(get(S.schemaLibrary)).toHaveLength(0);
  });

  it('insertLibrarySchema commits a fresh-id copy into the project and selects it', () => {
    const id = S.addToLibrary({
      name: 'Words',
      schema: { name: 'Words', fields: [{ id: 'f1', key: 'w', label: 'Word', type: 'text', multilingual: true }], cardTemplates: [] },
      settings: DEFAULT_SETTINGS,
    });
    S.insertLibrarySchema(id);
    const schemas = get(S.project).schemas;
    expect(schemas).toHaveLength(1);
    expect(schemas[0].name).toBe('Words');
    expect(get(S.activeSchemaId)).toBe(schemas[0].id);
  });

  it('insertLibrarySchema is a no-op for an unknown id', () => {
    S.insertLibrarySchema('missing');
    expect(get(S.project).schemas).toHaveLength(0);
  });
});

describe('insertSchema (pure)', () => {
  function entry(overrides: Partial<SchemaLibraryEntry> = {}): SchemaLibraryEntry {
    return {
      id: 'lib_1', name: 'Words', addedAt: 0,
      schema: {
        name: 'Words',
        fields: [{ id: 'f1', key: 'w', label: 'Word', type: 'text', multilingual: true }],
        cardTemplates: [{ id: 'tpl_src', templateType: 'single', layout: 'fulltext', size: null, mapping: {} }],
      },
      settings: { ...DEFAULT_SETTINGS, paperSize: 'A6' },
      ...overrides,
    };
  }

  it('appends a fresh-id copy: new schema.id, new cardTemplate id(s), source entry untouched', () => {
    const p = newProject();
    const e = entry();
    const before = JSON.parse(JSON.stringify(e));
    const next = insertSchema(p, e);
    expect(next.schemas).toHaveLength(1);
    expect(next.schemas[0].id).not.toBe('lib_1');
    expect(next.schemas[0].id).toMatch(/^sch_/);
    expect(next.schemas[0].cardTemplates[0].id).not.toBe('tpl_src');
    expect(next.schemas[0].cardTemplates[0].id).toMatch(/^tpl_/);
    expect(e).toEqual(before); // original entry untouched
  });

  it('adopts the entry settings (merged over DEFAULT_SETTINGS) only when the project had NO schemas', () => {
    const p = newProject(); // schemas: []
    const next = insertSchema(p, entry());
    expect(next.settings.paperSize).toBe('A6');
    expect(next.settings.titleFont.family).toBe(DEFAULT_SETTINGS.titleFont.family); // backfilled
  });

  it('leaves the project global settings untouched when it already has a schema', () => {
    let p = newProject();
    p = { ...p, schemas: [{ id: 'sch_existing', name: 'Existing', fields: [], cardTemplates: [] }] };
    const next = insertSchema(p, entry());
    expect(next.settings.paperSize).toBe(DEFAULT_SETTINGS.paperSize); // untouched
    expect(next.schemas).toHaveLength(2);
  });

  it('is immutable — does not mutate the input project', () => {
    const p = newProject();
    const before = JSON.parse(JSON.stringify(p));
    insertSchema(p, entry());
    expect(p).toEqual(before);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/schema-library.test.ts`
Expected: FAIL — `S.addToLibrary is not a function` / `insertSchema` not exported

- [ ] **Step 3: Implement `insertSchema` in `cardMapping.ts`**

Modify `src/lib/modules/flashcards/cardMapping.ts` — add the import and the function.

Before:
```ts
import { uid, type Project, type Schema, type CardTemplate, type RecordItem, type Card, type CardSection, type CardImage, type Settings, type StyleOverrides, type SchemaField } from './model';
import { resolveLocale } from './lib/card-render';
import { LAYOUT_SLOTS } from './lib/layouts';
import { mergeStyle } from './lib/style';
```

After:
```ts
import { uid, type Project, type Schema, type CardTemplate, type RecordItem, type Card, type CardSection, type CardImage, type Settings, type StyleOverrides, type SchemaField } from './model';
import { resolveLocale } from './lib/card-render';
import { LAYOUT_SLOTS } from './lib/layouts';
import { mergeStyle } from './lib/style';
import { mergeSettingsOverDefaults, type SchemaLibraryEntry } from './io/schemaIO';
```

Append at the end of the file (after `setViewFields`):

```ts

// ── Schema Library: insert a library entry into this project ────────────────────────────
/** Insert a fresh-id copy of a library entry's schema into `project.schemas` (fresh `schema.id`
 *  via `uid('sch')`; each `cardTemplate.id` regenerated via `uid('tpl')` so packed-card lookups
 *  by templateId can never collide with the schema this was copied from). If the project had NO
 *  schemas yet, also adopt the entry's `settings` (merged over DEFAULT_SETTINGS) so a fresh
 *  project matches the source project's look; a project that already has schemas keeps its own
 *  global settings untouched. Immutable — the library entry is never mutated. */
export function insertSchema(p: Project, entry: SchemaLibraryEntry): Project {
  const schema: Schema = {
    id: uid('sch'),
    name: entry.schema.name,
    fields: structuredClone(entry.schema.fields),
    cardTemplates: entry.schema.cardTemplates.map((t) => ({ ...structuredClone(t), id: uid('tpl') })),
  };
  const wasEmpty = p.schemas.length === 0;
  return {
    ...p,
    schemas: [...p.schemas, schema],
    settings: wasEmpty ? mergeSettingsOverDefaults(entry.settings) : p.settings,
  };
}
```

- [ ] **Step 4: Implement the library store + insert action in `stores.ts`**

Modify `src/lib/modules/flashcards/stores.ts` — imports:

Before:
```ts
import { writable, derived, get, type Readable, type Writable } from 'svelte/store';
import * as H from '../../history';
import { newProject, type Project, type Schema, type SchemaField, type RecordItem, type Settings, type CardTemplate, type StyleOverrides } from './model';
import * as ops from './recordOps';
import * as cardMapping from './cardMapping';
import * as cardOps from './cardOps';
import * as ai from './lib/ai';
import { mergeStyle } from './lib/style';
```

After:
```ts
import { writable, derived, get, type Readable, type Writable } from 'svelte/store';
import * as H from '../../history';
import { newProject, uid, type Project, type Schema, type SchemaField, type RecordItem, type Settings, type CardTemplate, type StyleOverrides } from './model';
import * as ops from './recordOps';
import * as cardMapping from './cardMapping';
import * as cardOps from './cardOps';
import * as ai from './lib/ai';
import { mergeStyle } from './lib/style';
import { parseSchemaExport, type SchemaExportPayload, type SchemaLibraryEntry } from './io/schemaIO';
```

Insert the library section between `aiGenerateRecords` and `initProject`.

Before:
```ts
export async function aiGenerateRecords(schemaId: string, instruction: string, count: number): Promise<number> {
  const p = get(project);
  const schema = p.schemas.find((s) => s.id === schemaId);
  if (!schema) return 0;
  const recs = await ai.generateRecords(get(_aiConfig), schema, instruction, count, p.locales);
  if (recs.length) importRecords(schemaId, recs, 'append');
  return recs.length;
}

export function initProject(): void {
```

After:
```ts
export async function aiGenerateRecords(schemaId: string, instruction: string, count: number): Promise<number> {
  const p = get(project);
  const schema = p.schemas.find((s) => s.id === schemaId);
  if (!schema) return 0;
  const recs = await ai.generateRecords(get(_aiConfig), schema, instruction, count, p.locales);
  if (recs.length) importRecords(schemaId, recs, 'append');
  return recs.length;
}

// ── Schema Library (localStorage, app-level — NOT part of the project document; NOT cleared
// by initProject/loadProject) ────────────────────────────────────────────────────────────
const SCHEMA_LIBRARY_KEY = 'tomoe.flashcards.schemaLibrary';
function loadSchemaLibrary(): SchemaLibraryEntry[] {
  try {
    const raw = localStorage.getItem(SCHEMA_LIBRARY_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
function persistSchemaLibrary(list: SchemaLibraryEntry[]): void {
  try { localStorage.setItem(SCHEMA_LIBRARY_KEY, JSON.stringify(list)); } catch { /* ignore storage errors */ }
}
const _schemaLibrary = writable<SchemaLibraryEntry[]>(loadSchemaLibrary());
export const schemaLibrary: Readable<SchemaLibraryEntry[]> = derived(_schemaLibrary, (l) => l);

export function addToLibrary(entry: { name: string; schema: SchemaExportPayload; settings: Settings }): string {
  const id = uid('lib');
  const full: SchemaLibraryEntry = {
    id, name: entry.name, addedAt: Date.now(),
    schema: structuredClone(entry.schema), settings: structuredClone(entry.settings),
  };
  _schemaLibrary.update((list) => { const next = [full, ...list]; persistSchemaLibrary(next); return next; });
  return id;
}
export function removeFromLibrary(id: string): void {
  _schemaLibrary.update((list) => { const next = list.filter((e) => e.id !== id); persistSchemaLibrary(next); return next; });
}
/** Snapshot the CURRENT project's schema (its fields + cardTemplates) + the project's global
 *  settings into the library, as a new entry. */
export function addSchemaToLibrary(schemaId: string): void {
  const p = get(project);
  const schema = p.schemas.find((s) => s.id === schemaId);
  if (!schema) return;
  addToLibrary({ name: schema.name, schema: { name: schema.name, fields: schema.fields, cardTemplates: schema.cardTemplates }, settings: p.settings });
}
/** Parse + add a portable `.schema.json` file's contents to the library. Never throws — used by
 *  both the Schema Library modal's "Import from file…" and the shell open-router (a schema file
 *  double-clicked/opened must toast, not crash). */
export function importSchemaFileText(text: string): { ok: boolean; name?: string; error?: string } {
  try {
    const { schema, settings } = parseSchemaExport(text);
    addToLibrary({ name: schema.name, schema, settings });
    return { ok: true, name: schema.name };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Not a valid Tomoe schema file' };
  }
}
export function insertLibrarySchema(id: string): void {
  const entry = get(schemaLibrary).find((e) => e.id === id);
  if (!entry) return;
  const np = cardMapping.insertSchema(get(project), entry);
  commit(np);
  activeSchemaId.set(np.schemas[np.schemas.length - 1].id);
}

export function initProject(): void {
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- tests/schema-library.test.ts`
Expected: PASS (14 tests)

- [ ] **Step 6: Full check + commit**

Run: `npm run check` — expect 0 errors.

```bash
git add src/lib/modules/flashcards/stores.ts src/lib/modules/flashcards/cardMapping.ts tests/schema-library.test.ts
git commit -m "feat: schema library store (addToLibrary/removeFromLibrary/addSchemaToLibrary/importSchemaFileText) + insertSchema"
```

---

### Task 3: Schema Library modal

**Files:**
- Create: `src/lib/modules/flashcards/components/SchemaLibraryModal.svelte`
- Modify: `src/lib/modules/flashcards/stores.ts` (add `schemaLibraryOpen`)
- Modify: `src/lib/modules/flashcards/Workspace.svelte` (mount modal + header trigger button)
- Test: `tests/SchemaLibraryModal.test.ts`

**Interfaces:**
- Consumes (Task 2): `schemaLibrary`, `insertLibrarySchema`, `removeFromLibrary`,
  `importSchemaFileText`, `addSchemaToLibrary`, `project`, `activeSchemaId` from `../stores`;
  `serializeSchemaExport`, `type SchemaLibraryEntry` from `../io/schemaIO` (Task 1); `showToast`
  from `../../../shell`.
- Produces: `schemaLibraryOpen: Writable<boolean>` in `stores.ts`; the mounted
  `<SchemaLibraryModal />` in `Workspace.svelte` (no other task consumes this component directly).

- [ ] **Step 1: Add the `schemaLibraryOpen` UI-only store**

Modify `src/lib/modules/flashcards/stores.ts`:

Before:
```ts
export const activeViewId: Writable<string | null> = writable(null);
```

After:
```ts
export const activeViewId: Writable<string | null> = writable(null);
export const schemaLibraryOpen: Writable<boolean> = writable(false);
```

- [ ] **Step 2: Write the failing component test file**

Create `tests/SchemaLibraryModal.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { render, fireEvent, screen } from '@testing-library/svelte';
import SchemaLibraryModal from '../src/lib/modules/flashcards/components/SchemaLibraryModal.svelte';
import * as S from '../src/lib/modules/flashcards/stores';
import { serializeSchemaExport } from '../src/lib/modules/flashcards/io/schemaIO';
import { DEFAULT_SETTINGS } from '../src/lib/modules/flashcards/model';

const { openDialog, saveDialog, confirmDialog, readTextFile, writeTextFile, showToast } = vi.hoisted(() => ({
  openDialog: vi.fn(),
  saveDialog: vi.fn(),
  confirmDialog: vi.fn(async () => true),
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(async () => {}),
  showToast: vi.fn(),
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: openDialog, save: saveDialog, confirm: confirmDialog }));
vi.mock('@tauri-apps/plugin-fs', () => ({ readTextFile, writeTextFile }));
vi.mock('../src/lib/shell', () => ({ showToast }));

beforeEach(() => {
  localStorage.clear();
  S.initProject();
  S.schemaLibraryOpen.set(false);
  vi.clearAllMocks();
});

describe('SchemaLibraryModal', () => {
  it('renders nothing when closed', () => {
    render(SchemaLibraryModal);
    expect(screen.queryByText('Schema library')).not.toBeInTheDocument();
  });

  it('shows the empty state when open with no entries', () => {
    S.schemaLibraryOpen.set(true);
    render(SchemaLibraryModal);
    expect(screen.getByText(/no schemas saved yet/i)).toBeInTheDocument();
  });

  it('lists an entry with name · fields · views · added-date', () => {
    S.addToLibrary({
      name: 'Verbs',
      schema: { name: 'Verbs', fields: [{ id: 'f1', key: 'w', label: 'Word', type: 'text' }], cardTemplates: [] },
      settings: DEFAULT_SETTINGS,
    });
    S.schemaLibraryOpen.set(true);
    render(SchemaLibraryModal);
    expect(screen.getByText('Verbs')).toBeInTheDocument();
    expect(screen.getByText(/1 field · 1 view ·/)).toBeInTheDocument();
  });

  it('Add current schema adds the active project schema to the library', async () => {
    const sid = S.addSchema('Words');
    S.updateSchema(sid, { fields: [{ id: 'f1', key: 'w', label: 'Word', type: 'text' }] });
    S.schemaLibraryOpen.set(true);
    render(SchemaLibraryModal);
    await fireEvent.click(screen.getByRole('button', { name: /add current schema/i }));
    expect(get(S.schemaLibrary)).toHaveLength(1);
    expect(get(S.schemaLibrary)[0].name).toBe('Words');
    expect(showToast).toHaveBeenCalledWith("Added 'Words' to the schema library");
  });

  it('Add current schema is disabled when there is no active schema', () => {
    S.schemaLibraryOpen.set(true);
    render(SchemaLibraryModal);
    expect(screen.getByRole('button', { name: /add current schema/i })).toBeDisabled();
  });

  it('Insert commits a fresh-id copy of the entry into the project', async () => {
    S.addToLibrary({
      name: 'Verbs',
      schema: { name: 'Verbs', fields: [{ id: 'f1', key: 'w', label: 'Word', type: 'text' }], cardTemplates: [] },
      settings: DEFAULT_SETTINGS,
    });
    S.schemaLibraryOpen.set(true);
    render(SchemaLibraryModal);
    await fireEvent.click(screen.getByRole('button', { name: /insert/i }));
    expect(get(S.project).schemas).toHaveLength(1);
    expect(get(S.project).schemas[0].name).toBe('Verbs');
    expect(showToast).toHaveBeenCalledWith("Inserted 'Verbs' into the project");
  });

  it('Export writes the serialized schema to the chosen path', async () => {
    S.addToLibrary({ name: 'Verbs', schema: { name: 'Verbs', fields: [], cardTemplates: [] }, settings: DEFAULT_SETTINGS });
    saveDialog.mockResolvedValue('/out/Verbs.schema.json');
    S.schemaLibraryOpen.set(true);
    render(SchemaLibraryModal);
    await fireEvent.click(screen.getByRole('button', { name: /export/i }));
    expect(writeTextFile).toHaveBeenCalledTimes(1);
    const [path, text] = writeTextFile.mock.calls[0];
    expect(path).toBe('/out/Verbs.schema.json');
    expect(JSON.parse(text).tomoeSchema).toBe(1);
  });

  it('Export does nothing when the save dialog is cancelled', async () => {
    S.addToLibrary({ name: 'Verbs', schema: { name: 'Verbs', fields: [], cardTemplates: [] }, settings: DEFAULT_SETTINGS });
    saveDialog.mockResolvedValue(null);
    S.schemaLibraryOpen.set(true);
    render(SchemaLibraryModal);
    await fireEvent.click(screen.getByRole('button', { name: /export/i }));
    expect(writeTextFile).not.toHaveBeenCalled();
  });

  it('Delete removes the entry after confirming', async () => {
    S.addToLibrary({ name: 'Verbs', schema: { name: 'Verbs', fields: [], cardTemplates: [] }, settings: DEFAULT_SETTINGS });
    confirmDialog.mockResolvedValue(true);
    S.schemaLibraryOpen.set(true);
    render(SchemaLibraryModal);
    await fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(get(S.schemaLibrary)).toHaveLength(0);
  });

  it('Delete keeps the entry when the confirm dialog is declined', async () => {
    S.addToLibrary({ name: 'Verbs', schema: { name: 'Verbs', fields: [], cardTemplates: [] }, settings: DEFAULT_SETTINGS });
    confirmDialog.mockResolvedValue(false);
    S.schemaLibraryOpen.set(true);
    render(SchemaLibraryModal);
    await fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(get(S.schemaLibrary)).toHaveLength(1);
  });

  it('Import from file adds a valid schema export to the library and toasts', async () => {
    openDialog.mockResolvedValue('/in/verbs.schema.json');
    const text = serializeSchemaExport({ name: 'FromFile', fields: [], cardTemplates: [] }, DEFAULT_SETTINGS);
    readTextFile.mockResolvedValue(text);
    S.schemaLibraryOpen.set(true);
    render(SchemaLibraryModal);
    await fireEvent.click(screen.getByRole('button', { name: /import from file/i }));
    expect(get(S.schemaLibrary)).toHaveLength(1);
    expect(get(S.schemaLibrary)[0].name).toBe('FromFile');
    expect(showToast).toHaveBeenCalledWith("Added 'FromFile' to the schema library");
  });

  it('Import from file shows an error toast for a malformed file, without adding an entry', async () => {
    openDialog.mockResolvedValue('/in/bad.schema.json');
    readTextFile.mockResolvedValue('not json');
    S.schemaLibraryOpen.set(true);
    render(SchemaLibraryModal);
    await fireEvent.click(screen.getByRole('button', { name: /import from file/i }));
    expect(get(S.schemaLibrary)).toHaveLength(0);
    expect(showToast).toHaveBeenCalledWith('Not a valid Tomoe schema file', 'error');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- tests/SchemaLibraryModal.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/modules/flashcards/components/SchemaLibraryModal.svelte'`

- [ ] **Step 4: Write the component**

Create `src/lib/modules/flashcards/components/SchemaLibraryModal.svelte`:

```svelte
<script lang="ts">
  import X from 'lucide-svelte/icons/x';
  import Plus from 'lucide-svelte/icons/plus';
  import Download from 'lucide-svelte/icons/download';
  import Upload from 'lucide-svelte/icons/upload';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import { open as openDialog, save as saveDialog, confirm } from '@tauri-apps/plugin-dialog';
  import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
  import {
    schemaLibrary, schemaLibraryOpen, insertLibrarySchema, removeFromLibrary,
    importSchemaFileText, addSchemaToLibrary, project, activeSchemaId,
  } from '../stores';
  import { serializeSchemaExport, type SchemaLibraryEntry } from '../io/schemaIO';
  import { showToast } from '../../../shell';

  function close() { schemaLibraryOpen.set(false); }

  const activeSchema = $derived($project.schemas.find((s) => s.id === $activeSchemaId) ?? null);

  function formatDate(ms: number): string {
    return new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }
  function meta(entry: SchemaLibraryEntry): string {
    const f = entry.schema.fields.length;
    const v = entry.schema.cardTemplates.length || 1;
    return `${f} field${f === 1 ? '' : 's'} · ${v} view${v === 1 ? '' : 's'} · Added ${formatDate(entry.addedAt)}`;
  }

  function onAddCurrent() {
    if (!activeSchema) return;
    addSchemaToLibrary(activeSchema.id);
    showToast(`Added '${activeSchema.name}' to the schema library`);
  }

  async function onImport() {
    const path = await openDialog({ multiple: false, filters: [{ name: 'Tomoe Schema', extensions: ['schema.json'] }] });
    if (typeof path !== 'string') return;
    const text = await readTextFile(path);
    const res = importSchemaFileText(text);
    if (res.ok) showToast(`Added '${res.name}' to the schema library`);
    else showToast(res.error ?? 'Not a valid Tomoe schema file', 'error');
  }

  function onInsert(entry: SchemaLibraryEntry) {
    insertLibrarySchema(entry.id);
    showToast(`Inserted '${entry.name}' into the project`);
  }

  async function onExport(entry: SchemaLibraryEntry) {
    const path = await saveDialog({ defaultPath: `${entry.name}.schema.json`, filters: [{ name: 'Tomoe Schema', extensions: ['schema.json'] }] });
    if (!path) return;
    try {
      await writeTextFile(path, serializeSchemaExport(entry.schema, entry.settings));
      showToast('Exported');
    } catch (e) {
      showToast(`Could not export: ${(e as Error).message}`, 'error');
    }
  }

  async function onDelete(entry: SchemaLibraryEntry) {
    if (await confirm(`Delete '${entry.name}' from the schema library?`, { title: 'Delete schema', kind: 'warning' })) {
      removeFromLibrary(entry.id);
    }
  }
</script>

{#if $schemaLibraryOpen}
  <div class="overlay" role="dialog" aria-modal="true">
    <div class="modal">
      <header class="modal-head">
        <span>Schema library</span>
        <button type="button" aria-label="close" onclick={close}><X size={16} /></button>
      </header>

      <div class="modal-toolbar">
        <button type="button" onclick={onImport}><Upload size={13} /> Import from file…</button>
        <button type="button" disabled={!activeSchema} onclick={onAddCurrent}><Plus size={13} /> Add current schema</button>
      </div>

      <div class="modal-body">
        {#if $schemaLibrary.length === 0}
          <p class="empty">No schemas saved yet. Use "Add current schema" or "Import from file…" above.</p>
        {:else}
          {#each $schemaLibrary as entry (entry.id)}
            <div class="entry">
              <div class="entry-info">
                <span class="entry-name">{entry.name}</span>
                <span class="entry-meta">{meta(entry)}</span>
              </div>
              <div class="entry-actions">
                <button type="button" onclick={() => onInsert(entry)}><Plus size={13} /> Insert</button>
                <button type="button" aria-label="export" title="Export…" onclick={() => onExport(entry)}><Download size={13} /></button>
                <button type="button" class="danger" aria-label="delete" title="Delete" onclick={() => onDelete(entry)}><Trash2 size={13} /></button>
              </div>
            </div>
          {/each}
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay { position:fixed; inset:0; background:rgba(0,0,0,.4); display:flex; align-items:center;
    justify-content:center; z-index:50; }
  .modal { background:var(--surface); color:var(--text); border:1px solid var(--border);
    border-radius:12px; width:min(560px,92vw); max-height:88vh; display:flex; flex-direction:column; }
  .modal-head { display:flex; align-items:center; justify-content:space-between; padding:12px 16px;
    border-bottom:1px solid var(--border); font-weight:600; }
  .modal-head button { border:none; background:transparent; color:var(--text-muted); }
  .modal-toolbar { display:flex; gap:8px; padding:12px 16px; border-bottom:1px solid var(--border); }
  .modal-toolbar button { display:inline-flex; align-items:center; gap:6px; border:1px solid var(--border);
    background:transparent; color:var(--text); border-radius:6px; padding:5px 10px; font:inherit; font-size:12px; }
  .modal-toolbar button:hover:not(:disabled) { background:var(--accent-weak); color:var(--accent); }
  .modal-toolbar button:disabled { opacity:.5; cursor:default; }
  .modal-body { padding:8px 16px 16px; overflow:auto; display:flex; flex-direction:column; gap:8px; }
  .empty { color:var(--text-muted); font-size:13px; padding:16px 0; }
  .entry { display:flex; align-items:center; justify-content:space-between; gap:10px;
    border:1px solid var(--border); border-radius:8px; padding:9px 12px; }
  .entry-info { display:flex; flex-direction:column; gap:2px; min-width:0; }
  .entry-name { font-weight:600; }
  .entry-meta { font-size:11px; color:var(--text-muted); }
  .entry-actions { display:flex; align-items:center; gap:6px; flex-shrink:0; }
  .entry-actions button { display:inline-flex; align-items:center; gap:5px; border:1px solid var(--border);
    background:transparent; color:var(--text); border-radius:6px; padding:5px 9px; font:inherit; font-size:12px; }
  .entry-actions button:hover { background:var(--accent-weak); color:var(--accent); }
  .entry-actions button.danger:hover { color:#b91c1c; border-color:#f3c2c2; background:transparent; }
</style>
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- tests/SchemaLibraryModal.test.ts`
Expected: PASS (12 tests)

- [ ] **Step 6: Mount the modal + add the header trigger button in `Workspace.svelte`**

Modify `src/lib/modules/flashcards/Workspace.svelte` — four small edits.

Edit 1 (stores import):

Before:
```ts
  import { project, setProjectName, selectRecord } from './stores';
  import { dragX } from '../../actions/resize';
  import SchemaRecordList from './components/SchemaRecordList.svelte';
  import RecordDetail from './components/RecordDetail.svelte';
  import SchemaEditorModal from './components/SchemaEditorModal.svelte';
  import CardEditorModal from './components/CardEditorModal.svelte';
```

After:
```ts
  import { project, setProjectName, selectRecord, schemaLibraryOpen } from './stores';
  import { dragX } from '../../actions/resize';
  import SchemaRecordList from './components/SchemaRecordList.svelte';
  import RecordDetail from './components/RecordDetail.svelte';
  import SchemaEditorModal from './components/SchemaEditorModal.svelte';
  import SchemaLibraryModal from './components/SchemaLibraryModal.svelte';
  import CardEditorModal from './components/CardEditorModal.svelte';
```

Edit 2 (icon import):

Before:
```ts
  import Printer from 'lucide-svelte/icons/printer';
  import FileDown from 'lucide-svelte/icons/file-down';
  import PanelLeft from 'lucide-svelte/icons/panel-left';
  import PanelRight from 'lucide-svelte/icons/panel-right';
```

After:
```ts
  import Printer from 'lucide-svelte/icons/printer';
  import FileDown from 'lucide-svelte/icons/file-down';
  import PanelLeft from 'lucide-svelte/icons/panel-left';
  import PanelRight from 'lucide-svelte/icons/panel-right';
  import Library from 'lucide-svelte/icons/library';
```

Edit 3 (header trigger button, before the Print button):

Before:
```svelte
    <button type="button" class="print-btn" disabled={printCount === 0}
      onclick={() => window.print()} title="Print (system dialog)">
      <Printer size={14} /> Print
    </button>
```

After:
```svelte
    <button type="button" class="print-btn" onclick={() => schemaLibraryOpen.set(true)} title="Schema library">
      <Library size={14} /> Library
    </button>
    <button type="button" class="print-btn" disabled={printCount === 0}
      onclick={() => window.print()} title="Print (system dialog)">
      <Printer size={14} /> Print
    </button>
```

Edit 4 (mount the modal):

Before:
```svelte
  <SchemaEditorModal />
  <CardEditorModal />
  <PrintView />
</div>
```

After:
```svelte
  <SchemaEditorModal />
  <SchemaLibraryModal />
  <CardEditorModal />
  <PrintView />
</div>
```

- [ ] **Step 7: Run the full flashcards test suite + check**

Run: `npm test` — expect all green (Windows: if you see a transient `EBUSY` on the vitest cache, re-run once).
Run: `npm run check` — expect 0 errors.

- [ ] **Step 8: Commit**

```bash
git add src/lib/modules/flashcards/components/SchemaLibraryModal.svelte src/lib/modules/flashcards/stores.ts src/lib/modules/flashcards/Workspace.svelte tests/SchemaLibraryModal.test.ts
git commit -m "feat: Schema Library modal (list/insert/export/delete/import/add-current)"
```

---

### Task 4: Open-with routing + file association

**Files:**
- Modify: `src/lib/fileService.ts`
- Modify: `src-tauri/tauri.conf.json`
- Test: `tests/fileService-schema-routing.test.ts`

**Interfaces:**
- Consumes: `looksLikeSchemaFile` from `./modules/flashcards/io/schemaIO` (Task 1);
  `importSchemaFileText` from `./modules/flashcards/stores` (Task 2); existing `showToast`,
  `confirmDiscardIfDirty`, `pickModuleForOpen`, `recordRecent`.
- Produces: `openPath(path)` gains a non-destructive schema-file branch that runs BEFORE the
  dirty-guard/module routing; `pickOpen()`'s file-open dialog accepts `schema.json`.
- Coupling note (deliberate, per spec): `fileService.ts` (shell) now imports directly from the
  flashcards module (`io/schemaIO`, `stores`) — a minimal, documented shell→module hook that exists
  only for this one file type.

- [ ] **Step 1: Write the failing test file**

Create `tests/fileService-schema-routing.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(() => Promise.resolve(() => {})) }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(() => Promise.resolve(null)) }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn(), confirm: vi.fn(() => Promise.resolve(true)) }));
const readTextFile = vi.fn();
vi.mock('@tauri-apps/plugin-fs', () => ({ readTextFile: (...a: unknown[]) => readTextFile(...a) }));
const importSchemaFileText = vi.fn();
vi.mock('../src/lib/modules/flashcards/stores', () => ({ importSchemaFileText: (...a: unknown[]) => importSchemaFileText(...a) }));
const openMock = vi.fn();
const pickModuleForOpen = vi.fn(() => ({ id: 'json-table', open: openMock }));
vi.mock('../src/lib/modules/registry', () => ({
  pickModuleForOpen: (...a: unknown[]) => pickModuleForOpen(...a),
  getModule: vi.fn(),
}));
const showToast = vi.fn();
vi.mock('../src/lib/shell', async (orig) => {
  const actual = await orig<typeof import('../src/lib/shell')>();
  return { ...actual, showToast: (...a: unknown[]) => showToast(...a) };
});

import { openPath } from '../src/lib/fileService';
import { recentFiles } from '../src/lib/recentFiles';
import { setActiveModule } from '../src/lib/shell';

beforeEach(() => {
  localStorage.clear();
  recentFiles.set([]);
  setActiveModule(null);
  readTextFile.mockReset();
  openMock.mockReset();
  importSchemaFileText.mockReset();
  pickModuleForOpen.mockClear();
  showToast.mockReset();
});

describe('openPath — schema-file routing', () => {
  it('a .schema.json path is imported into the library and never reaches module routing', async () => {
    readTextFile.mockResolvedValue('{"tomoeSchema":1,"schema":{"name":"Words","fields":[],"cardTemplates":[]},"settings":{}}');
    importSchemaFileText.mockReturnValue({ ok: true, name: 'Words' });
    await openPath('/shared/words.schema.json');
    expect(importSchemaFileText).toHaveBeenCalled();
    expect(pickModuleForOpen).not.toHaveBeenCalled();
    expect(openMock).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith("Added 'Words' to the schema library");
    expect(get(recentFiles)).toEqual([]); // not recorded as a recent project file
  });

  it('content with the tomoeSchema marker is gated even without a .schema.json extension', async () => {
    readTextFile.mockResolvedValue('{"tomoeSchema":1,"schema":{"name":"X","fields":[],"cardTemplates":[]},"settings":{}}');
    importSchemaFileText.mockReturnValue({ ok: true, name: 'X' });
    await openPath('/downloads/emailed-file.json');
    expect(importSchemaFileText).toHaveBeenCalled();
    expect(pickModuleForOpen).not.toHaveBeenCalled();
  });

  it('shows an error toast and still skips module routing when the schema file is malformed', async () => {
    readTextFile.mockResolvedValue('not json');
    importSchemaFileText.mockReturnValue({ ok: false, error: 'Not a valid Tomoe schema file' });
    await openPath('/shared/broken.schema.json');
    expect(showToast).toHaveBeenCalledWith('Not a valid Tomoe schema file', 'error');
    expect(pickModuleForOpen).not.toHaveBeenCalled();
  });

  it('regression: a normal .tomoe.json still routes to a module', async () => {
    readTextFile.mockResolvedValue('{"projectName":"P"}');
    await openPath('/data/thing.tomoe.json');
    expect(pickModuleForOpen).toHaveBeenCalled();
    expect(openMock).toHaveBeenCalled();
    expect(importSchemaFileText).not.toHaveBeenCalled();
  });

  it('regression: a generic .json project file still routes to a module', async () => {
    readTextFile.mockResolvedValue('{"foo":1}');
    await openPath('/data/thing.json');
    expect(pickModuleForOpen).toHaveBeenCalled();
    expect(openMock).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/fileService-schema-routing.test.ts`
Expected: FAIL — the schema-file tests fail because `openPath` still routes every file to
`pickModuleForOpen` (no schema-file branch exists yet).

- [ ] **Step 3: Implement the routing change**

Modify `src/lib/fileService.ts` — full before/after.

Before:
```ts
import { readTextFile } from '@tauri-apps/plugin-fs';
import { open, confirm } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { get } from 'svelte/store';
import { activeModuleId, setActiveModule, showToast } from './shell';
import { pickModuleForOpen, getModule } from './modules/registry';
import { recordRecent } from './recentFiles';

/**
 * Guard against silently discarding unsaved edits in the active module.
 * Returns true if it is safe to proceed (nothing dirty, or the user confirmed).
 */
export async function confirmDiscardIfDirty(): Promise<boolean> {
  const id = get(activeModuleId);
  if (!id) return true;
  const mod = getModule(id);
  if (!get(mod.dirty)) return true;
  return confirm(
    'You have unsaved changes. Discard them and open the new file?',
    { title: 'Unsaved changes', kind: 'warning' },
  );
}

export async function openPath(path: string): Promise<void> {
  if (!(await confirmDiscardIfDirty())) return;
  try {
    const text = await readTextFile(path);
    const mod = pickModuleForOpen(path, text);
    setActiveModule(mod.id);
    mod.open(text, path);
    recordRecent(path);
  } catch (e) {
    showToast(`Cannot open file: ${(e as Error).message}`, 'error');
  }
}

export async function pickOpen(): Promise<void> {
  const sel = await open({ multiple: false, filters: [{ name: 'Tomoe / JSON', extensions: ['tomoe.json', 'json'] }] });
  if (typeof sel === 'string') await openPath(sel);
}
```

After:
```ts
import { readTextFile } from '@tauri-apps/plugin-fs';
import { open, confirm } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { get } from 'svelte/store';
import { activeModuleId, setActiveModule, showToast } from './shell';
import { pickModuleForOpen, getModule } from './modules/registry';
import { recordRecent } from './recentFiles';
import { looksLikeSchemaFile } from './modules/flashcards/io/schemaIO';
import { importSchemaFileText } from './modules/flashcards/stores';

/**
 * Guard against silently discarding unsaved edits in the active module.
 * Returns true if it is safe to proceed (nothing dirty, or the user confirmed).
 */
export async function confirmDiscardIfDirty(): Promise<boolean> {
  const id = get(activeModuleId);
  if (!id) return true;
  const mod = getModule(id);
  if (!get(mod.dirty)) return true;
  return confirm(
    'You have unsaved changes. Discard them and open the new file?',
    { title: 'Unsaved changes', kind: 'warning' },
  );
}

/**
 * A deliberate, minimal shell→flashcards coupling: a `.schema.json` file (by extension or by
 * content sniff) is a portable Schema Library share, not a project. Handling it is
 * non-destructive — it never touches the active document and never switches modules — so this
 * check runs BEFORE the dirty-guard/module routing in `openPath`: there is nothing to discard
 * and nothing to route. Returns true when the file was handled as a schema import (caller should
 * stop), false otherwise (caller proceeds with normal module routing).
 */
function tryImportSchemaFile(path: string, text: string): boolean {
  if (!path.endsWith('.schema.json') && !looksLikeSchemaFile(text)) return false;
  const res = importSchemaFileText(text);
  if (res.ok) showToast(`Added '${res.name}' to the schema library`);
  else showToast(res.error ?? 'Not a valid Tomoe schema file', 'error');
  return true;
}

export async function openPath(path: string): Promise<void> {
  let text: string;
  try {
    text = await readTextFile(path);
  } catch (e) {
    showToast(`Cannot open file: ${(e as Error).message}`, 'error');
    return;
  }
  if (tryImportSchemaFile(path, text)) return;
  if (!(await confirmDiscardIfDirty())) return;
  try {
    const mod = pickModuleForOpen(path, text);
    setActiveModule(mod.id);
    mod.open(text, path);
    recordRecent(path);
  } catch (e) {
    showToast(`Cannot open file: ${(e as Error).message}`, 'error');
  }
}

export async function pickOpen(): Promise<void> {
  const sel = await open({ multiple: false, filters: [{ name: 'Tomoe / JSON', extensions: ['tomoe.json', 'schema.json', 'json'] }] });
  if (typeof sel === 'string') await openPath(sel);
}
```

(`loadStartupFile` and `listenForOpenFile`, further down in the same file, are unchanged — they
already just call `openPath`, so the schema-file branch applies to double-click/cold-start opens
automatically.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/fileService-schema-routing.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Run the existing recent-files test to confirm no regression**

Run: `npm test -- tests/fileService-recent.test.ts`
Expected: PASS (unchanged — a plain `.json`/`.tomoe.json` open with no schema marker still records
the recent file exactly as before).

- [ ] **Step 6: Add the file association for schema files**

Modify `src-tauri/tauri.conf.json`:

Before:
```json
    "fileAssociations": [
      {
        "ext": ["tomoe.json", "json"],
        "name": "Tomoe Project",
        "description": "Tomoe project file",
        "role": "Editor"
      }
    ],
```

After:
```json
    "fileAssociations": [
      {
        "ext": ["tomoe.json", "schema.json", "json"],
        "name": "Tomoe Project",
        "description": "Tomoe project file",
        "role": "Editor"
      }
    ],
```

- [ ] **Step 7: Gate the Rust/config change**

Run: `cd src-tauri && cargo check`
Expected: succeeds (config parses; this does not build the installer — the double-click
association itself only takes effect after a fresh `tauri build` + reinstall, which is
human-verified, not part of this automated gate).

- [ ] **Step 8: Full suite + build gate**

Run: `npm test` — expect all green (Windows: re-run once on transient `EBUSY`).
Run: `npm run check` — expect 0 errors.
Run: `npm run build` — expect success.

- [ ] **Step 9: Commit**

```bash
git add src/lib/fileService.ts src-tauri/tauri.conf.json tests/fileService-schema-routing.test.ts
git commit -m "feat: open-router gates .schema.json into the schema library (non-destructive) + file association"
```

---

### Task 5: Whole-branch review + build/visual pass

This task has no fixed steps — it is a review pass over everything Tasks 1–4 produced, plus a
manual/visual confirmation that the feature actually works end-to-end. At minimum:

- Re-run the full gate suite from a clean state: `npm run check` (0 errors), `npm test` (green;
  re-run once if Windows reports a transient vitest-cache `EBUSY`), `npm run build` (succeeds),
  `cd src-tauri && cargo check` (succeeds).
- Read the whole diff (`git diff main...HEAD` or equivalent) end to end and check for consistency:
  type/field names match across files (`SchemaExportPayload`, `SchemaLibraryEntry`,
  `schemaLibrary`, `insertLibrarySchema`, `insertSchema` should be spelled identically everywhere
  they're used); no leftover placeholder/TODO text; no accidental hardcoded hex colors in modal
  chrome; `initProject`/`loadProject` still do not touch the schema library.
  If a `code-review` skill/tool is available in this environment, run it over the diff.
- Launch the app (`npm run tauri dev`) and manually verify the user-facing flow:
  1. Create a schema with a couple of fields + a custom view style, open the Schema Library
     (header "Library" button), click "Add current schema" — confirm it appears in the list with
     the right field/view counts.
  2. Export it to a `.schema.json` file, start a new/blank project, use "Import from file…" on
     that same file, then "Insert into project" — confirm the fields + view style show up
     correctly in the new project.
  3. Open that `.schema.json` file directly via the in-app Open dialog (or drag it in, if
     supported) — confirm it's added to the library with a toast and the current project/document
     is untouched (no module switch, no data loss).
  4. Delete a library entry and confirm the confirm-dialog/delete flow works.
  5. Note explicitly in the review notes that the OS-level double-click file association
     (`bundle.fileAssociations`) can only be verified after a real `tauri build` + install — this
     is human-verified outside the automated gates, not something this pass can confirm from `tauri dev`.
- Fix anything found during review, re-run the affected gates, and commit the fix(es) with a
  descriptive message (do not amend prior commits).

---

## Self-review notes (from writing this plan)

- **Spec coverage:** every "Plan shape" item (1–5) has a task; the Data section's `SchemaLibraryEntry`
  and portable-file shapes are both covered (Task 1/2); the Library store's five functions
  (`addToLibrary`/`removeFromLibrary`/`addSchemaToLibrary`/`importSchemaFileText`/
  `insertLibrarySchema`) are all in Task 2; the modal's every listed action (Insert/Export/Delete/
  Import/Add-current) is in Task 3; the open-router + file-association + `pickOpen` extension are
  all in Task 4; the "Out of scope" list (cloud sync, in-library editing, merge, record migration,
  per-locale) has no task and is correctly left alone.
- **Type consistency:** `SchemaExportPayload` (Task 1) is used as-is by `SchemaLibraryEntry.schema`
  (Task 1), `addToLibrary`'s `entry.schema` param (Task 2), and `serializeSchemaExport`'s first
  param (Task 1, called from Task 3's Export button) — one name throughout, never redefined.
  `insertSchema`/`insertLibrarySchema` naming matches the spec exactly and is not renamed between
  Task 2 (definition) and Task 3 (usage).
- **Deviation from the spec's literal signature, called out explicitly:** the spec sketches
  `serializeSchemaExport(schema: Schema, settings: Settings)`. This plan instead types the first
  parameter as `SchemaExportPayload` (`{name, fields, cardTemplates}`, no `id`) because the Schema
  Library modal's Export button only ever has `entry.schema` — an id-less payload — on hand (a
  library entry does not carry a live schema id; a fresh one is only minted on Insert). A full
  `Schema` object (which does carry an `id`) is still perfectly valid at call sites, since it
  structurally satisfies `SchemaExportPayload`. Flagging this so the implementer doesn't "fix" the
  type back to `Schema` and then hit a compile error in Task 3.
- **Risk flagged:** the `tauri.conf.json` file-association change is intentionally NOT
  installer-tested by this plan (`cargo check` only parses the config); the OS actually
  recognizing double-clicked `.schema.json` files requires a fresh NSIS build + reinstall, called
  out as human-verified in Task 6.
- **Risk flagged:** `fileService.ts` (a shell file) now imports directly from
  `modules/flashcards/{io/schemaIO,stores}` — a deliberate, narrow coupling documented inline (see
  Task 4's `tryImportSchemaFile` doc-comment) and in this plan, per the spec's explicit call-out
  that this is acceptable for this one file type only; it should not be treated as precedent for
  other shell↔module coupling.
