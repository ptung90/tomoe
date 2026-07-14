# Flashcards Records Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the flashcards Records workspace — a two-pane UI to pick a schema, list/CRUD its records, and edit a selected record in a multi-locale detail form with rich-text (`text-long`) and image fields.

**Architecture:** Pure `(project) => project` operations in `recordOps.ts` (the TDD surface) drive an immutable `History<Project>` via the existing flashcards store; thin Svelte 5 components read `$project` + UI stores and call store action wrappers that `commit(recordOps.x(...))`. Rich text is TipTap (`@tiptap/core`) wrapped in a Svelte component, stored as Markdown via `marked` (load) + `turndown` (save).

**Tech Stack:** Svelte 5 (runes), TypeScript, Vite 5, vitest + @testing-library/svelte, `@tiptap/core` + starter-kit + text-align + underline, `marked`, `turndown`, Tauri plugin-dialog (confirm).

## Global Constraints

- Design system **Calm Paper**: style with CSS tokens (`var(--accent)`, `var(--bg)`, `var(--surface)`, `var(--border)`, `var(--text)`, `var(--text-muted)`, `var(--accent-weak)`, `var(--sidebar)`), never hardcoded hex. Accent = teal-600.
- lucide-svelte icons: **subpath imports only** (`lucide-svelte/icons/<name>`), never the barrel.
- Data model lives in `src/lib/modules/flashcards/model.ts`; `text-long` field content is stored as **Markdown strings**. Multilingual value = `Record<Locale,string>`; non-multilingual / image value = `string`.
- Uphold module isolation: everything here lives under `src/lib/modules/flashcards/`; do not add shared/global state. Use the existing per-module store + `History`.
- `npm run check` → 0 errors. `npm test` → green, 0 unhandled errors. `npm run build` → ok. Run all three before the final commit.
- TDD: write the failing test first for every pure-logic and util task. Commit after each task.
- Out of scope (do NOT build): card preview, `cardTemplates`/slot mapping, status badges, linked-card chips, pack, image search/crop, AI, record sort/search.

---

## File map

```
src/lib/
  debounce.ts                              # NEW: keyedDebounce util
  modules/flashcards/
    lib/richtext.ts                        # NEW: mdToHtml / htmlToMd / createEditor
    recordOps.ts                           # NEW: pure record/schema/locale/import ops
    stores.ts                              # MODIFY: UI stores + action wrappers + reset on load
    Workspace.svelte                       # MODIFY: replace placeholder with 2-pane
    components/
      SchemaRecordList.svelte              # NEW: left pane
      RecordDetail.svelte                  # NEW: right pane form
      RecordField.svelte                   # NEW: one field (type router + multilingual)
      RichText.svelte                      # NEW: TipTap wrapper + toolbar
      ImageField.svelte                    # NEW: url/paste/pick + thumbnail + clear
      LocaleBar.svelte                     # NEW: add/remove/set locale
      SchemaEditorModal.svelte             # NEW: schema + fields editor
tests/
  richtext.test.ts, recordOps.test.ts, debounce.test.ts,
  flashcards-stores.test.ts, ImageField.test.ts, RecordField.test.ts,
  RecordDetail.test.ts, SchemaRecordList.test.ts, LocaleBar.test.ts,
  SchemaEditorModal.test.ts, flashcards-workspace.test.ts
```

---

## Task 1: Dependencies + rich-text Markdown helpers

**Files:**
- Modify: `package.json` (dependencies)
- Create: `src/lib/modules/flashcards/lib/richtext.ts`
- Test: `tests/richtext.test.ts`

**Interfaces:**
- Produces: `mdToHtml(md: string): string`, `htmlToMd(html: string): string`, `createEditor(element: HTMLElement, markdown: string, onUpdate: () => void): Editor`.

- [ ] **Step 1: Install dependencies**

Run:
```bash
npm install @tiptap/core@^3 @tiptap/starter-kit@^3 @tiptap/extension-text-align@^3 @tiptap/extension-underline@^3 marked@^18 turndown@^7
npm install -D @types/turndown
```
Expected: packages added to `package.json`, no peer-dep errors that abort install.

- [ ] **Step 2: Write the failing test**

Create `tests/richtext.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { mdToHtml, htmlToMd } from '../src/lib/modules/flashcards/lib/richtext';

describe('richtext md<->html', () => {
  it('mdToHtml wraps bold', () => {
    expect(mdToHtml('**hi**').replace(/\n/g, '')).toBe('<p><strong>hi</strong></p>');
  });
  it('bold round-trips', () => { expect(htmlToMd(mdToHtml('**hi**'))).toBe('**hi**'); });
  it('bullet list round-trips', () => {
    expect(htmlToMd(mdToHtml('- a\n- b'))).toBe('- a\n- b');
  });
  it('heading round-trips', () => { expect(htmlToMd(mdToHtml('# Title'))).toBe('# Title'); });
  it('empty string is empty', () => { expect(htmlToMd(mdToHtml(''))).toBe(''); });
  it('preserves aligned paragraph html', () => {
    const md = htmlToMd('<p style="text-align:center">hey</p>');
    expect(md).toContain('text-align:center');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- richtext`
Expected: FAIL — cannot resolve `../src/lib/modules/flashcards/lib/richtext`.

- [ ] **Step 4: Implement `richtext.ts`**

Create `src/lib/modules/flashcards/lib/richtext.ts`:
```ts
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import { marked } from 'marked';
import TurndownService from 'turndown';

/** Markdown -> HTML for loading into the editor. Synchronous. */
export function mdToHtml(md: string): string {
  return marked.parse(md ?? '', { async: false }) as string;
}

let _td: TurndownService | null = null;
function turndown(): TurndownService {
  if (_td) return _td;
  const td = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-' });
  // Tight list items: no blank line between items (ported from flashcard-creator).
  td.addRule('tightListItem', {
    filter: 'li',
    replacement: (content, node, options) => {
      const parent = node.parentNode as HTMLElement;
      let prefix: string;
      if (parent && parent.nodeName === 'OL') {
        const start = parent.getAttribute('start');
        const index = Array.prototype.indexOf.call(parent.children, node);
        prefix = (start ? Number(start) + index : index + 1) + '. ';
      } else {
        prefix = (options.bulletListMarker || '-') + ' ';
      }
      const indent = ' '.repeat(prefix.length);
      const body = content.trim().replace(/\n{3,}/g, '\n\n').replace(/\n/g, '\n' + indent);
      return prefix + body + '\n';
    },
  });
  // Keep explicit paragraph alignment as inline HTML (ported).
  td.addRule('alignedParagraph', {
    filter: (node) => node.nodeName === 'P' && !!(node as HTMLElement).style && !!(node as HTMLElement).style.textAlign,
    replacement: (content, node) =>
      `\n\n<p style="text-align:${(node as HTMLElement).style.textAlign}">${content}</p>\n\n`,
  });
  _td = td;
  return td;
}

/** HTML (from the editor) -> Markdown for storage. Trimmed. */
export function htmlToMd(html: string): string {
  return turndown().turndown(html).trim();
}

/** Build a TipTap editor bound to `element`, seeded from Markdown. */
export function createEditor(element: HTMLElement, markdown: string, onUpdate: () => void): Editor {
  return new Editor({
    element,
    extensions: [StarterKit, Underline, TextAlign.configure({ types: ['heading', 'paragraph'] })],
    content: mdToHtml(markdown),
    onUpdate,
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- richtext`
Expected: PASS (6 tests). If the bullet round-trip differs by a trailing newline, adjust the expected value to match `htmlToMd` output exactly (do not weaken the assertion to a substring).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/modules/flashcards/lib/richtext.ts tests/richtext.test.ts
git commit -m "feat(flashcards): tiptap deps + markdown round-trip helpers"
```

---

## Task 2: recordOps — record CRUD

**Files:**
- Create: `src/lib/modules/flashcards/recordOps.ts`
- Test: `tests/recordOps.test.ts`

**Interfaces:**
- Consumes: `Project`, `RecordItem`, `SchemaField`, `LocalizedText`, `uid` from `./model`.
- Produces:
  - `emptyFieldValue(field: SchemaField, locales: string[]): LocalizedText`
  - `addRecord(p: Project, schemaId: string): { project: Project; id: string }`
  - `deleteRecord(p: Project, id: string): Project`
  - `duplicateRecord(p: Project, id: string): { project: Project; id: string }`
  - `setField(p: Project, recordId: string, key: string, value: string, locale?: string): Project`

- [ ] **Step 1: Write the failing test**

Create `tests/recordOps.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { newProject, type Project, type Schema } from '../src/lib/modules/flashcards/model';
import * as ops from '../src/lib/modules/flashcards/recordOps';

function withSchema(): { p: Project; schema: Schema } {
  const p = newProject(); // locales ['en','vi']
  const schema: Schema = { id: 's1', name: 'Words', cardTemplates: [], fields: [
    { id: 'f1', key: 'title', label: 'Title', type: 'text', multilingual: true },
    { id: 'f2', key: 'note', label: 'Note', type: 'text-long', multilingual: true },
    { id: 'f3', key: 'pic', label: 'Pic', type: 'image' },
  ] };
  p.schemas.push(schema);
  return { p, schema };
}

describe('recordOps record CRUD', () => {
  it('addRecord seeds multilingual objects and a string image', () => {
    const { p } = withSchema();
    const { project, id } = ops.addRecord(p, 's1');
    expect(project.records).toHaveLength(1);
    const r = project.records[0];
    expect(r.id).toBe(id);
    expect(r.schemaId).toBe('s1');
    expect(r.fields.title).toEqual({ en: '', vi: '' });
    expect(r.fields.pic).toBe('');
    expect(p.records).toHaveLength(0); // input not mutated
  });

  it('setField updates one locale of a multilingual field', () => {
    const { p } = withSchema();
    const { project, id } = ops.addRecord(p, 's1');
    const p2 = ops.setField(project, id, 'title', 'Owl', 'en');
    expect(p2.records[0].fields.title).toEqual({ en: 'Owl', vi: '' });
    expect(project.records[0].fields.title).toEqual({ en: '', vi: '' }); // unmutated
  });

  it('setField sets a plain string for an image field (no locale)', () => {
    const { p } = withSchema();
    const { project, id } = ops.addRecord(p, 's1');
    const p2 = ops.setField(project, id, 'pic', 'data:img');
    expect(p2.records[0].fields.pic).toBe('data:img');
  });

  it('duplicateRecord inserts a clone right after the original with a new id', () => {
    const { p } = withSchema();
    const a = ops.addRecord(p, 's1');
    const withVal = ops.setField(a.project, a.id, 'title', 'Owl', 'en');
    const { project, id } = ops.duplicateRecord(withVal, a.id);
    expect(project.records).toHaveLength(2);
    expect(project.records[1].id).toBe(id);
    expect(id).not.toBe(a.id);
    expect(project.records[1].fields.title).toEqual({ en: 'Owl', vi: '' });
  });

  it('deleteRecord removes the record', () => {
    const { p } = withSchema();
    const { project, id } = ops.addRecord(p, 's1');
    const p2 = ops.deleteRecord(project, id);
    expect(p2.records).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- recordOps`
Expected: FAIL — cannot resolve `recordOps`.

- [ ] **Step 3: Implement record ops**

Create `src/lib/modules/flashcards/recordOps.ts`:
```ts
import { uid, type Project, type RecordItem, type SchemaField, type LocalizedText } from './model';

export function emptyFieldValue(field: SchemaField, locales: string[]): LocalizedText {
  if (field.type === 'image' || field.multilingual === false) return '';
  const o: Record<string, string> = {};
  for (const l of locales) o[l] = '';
  return o;
}

export function addRecord(p: Project, schemaId: string): { project: Project; id: string } {
  const schema = p.schemas.find((s) => s.id === schemaId);
  if (!schema) return { project: p, id: '' };
  const id = uid('rec');
  const fields: Record<string, LocalizedText> = {};
  for (const f of schema.fields) fields[f.key] = emptyFieldValue(f, p.locales);
  const rec: RecordItem = { id, schemaId, fieldsHash: '', fields };
  return { project: { ...p, records: [...p.records, rec] }, id };
}

export function deleteRecord(p: Project, id: string): Project {
  return { ...p, records: p.records.filter((r) => r.id !== id) };
}

export function duplicateRecord(p: Project, id: string): { project: Project; id: string } {
  const idx = p.records.findIndex((r) => r.id === id);
  if (idx < 0) return { project: p, id: '' };
  const newId = uid('rec');
  const clone: RecordItem = { ...structuredClone(p.records[idx]), id: newId, fieldsHash: '' };
  const records = [...p.records];
  records.splice(idx + 1, 0, clone);
  return { project: { ...p, records }, id: newId };
}

export function setField(
  p: Project, recordId: string, key: string, value: string, locale?: string,
): Project {
  const records = p.records.map((r) => {
    if (r.id !== recordId) return r;
    const cur = r.fields[key];
    let next: LocalizedText;
    if (locale) {
      const base = cur && typeof cur === 'object' ? cur : {};
      next = { ...base, [locale]: value };
    } else {
      next = value;
    }
    return { ...r, fields: { ...r.fields, [key]: next } };
  });
  return { ...p, records };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- recordOps`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/modules/flashcards/recordOps.ts tests/recordOps.test.ts
git commit -m "feat(flashcards): recordOps record CRUD (pure)"
```

---

## Task 3: recordOps — schema ops + field migration

**Files:**
- Modify: `src/lib/modules/flashcards/recordOps.ts`
- Test: `tests/recordOps.test.ts` (add a describe block)

**Interfaces:**
- Consumes: `Schema` from `./model`; `emptyFieldValue` from Task 2.
- Produces:
  - `migrateRecordFields(p: Project): Project`
  - `addSchema(p: Project, name: string): { project: Project; id: string }`
  - `updateSchema(p: Project, schemaId: string, patch: { name?: string; fields?: SchemaField[] }): Project`
  - `deleteSchema(p: Project, schemaId: string): Project`

- [ ] **Step 1: Write the failing test**

Append to `tests/recordOps.test.ts`:
```ts
import type { SchemaField } from '../src/lib/modules/flashcards/model';

describe('recordOps schema ops', () => {
  it('addSchema appends an empty schema and returns its id', () => {
    const p = newProject();
    const { project, id } = ops.addSchema(p, 'Phrases');
    expect(project.schemas).toHaveLength(1);
    expect(project.schemas[0]).toMatchObject({ id, name: 'Phrases', fields: [], cardTemplates: [] });
  });

  it('migrateRecordFields adds new fields empty and drops removed fields', () => {
    const { p } = withSchema();
    const added = ops.addRecord(p, 's1');
    const filled = ops.setField(added.project, added.id, 'title', 'Owl', 'en');
    // Remove 'note', add 'extra'
    const newFields: SchemaField[] = [
      { id: 'f1', key: 'title', label: 'Title', type: 'text', multilingual: true },
      { id: 'f4', key: 'extra', label: 'Extra', type: 'text', multilingual: true },
      { id: 'f3', key: 'pic', label: 'Pic', type: 'image' },
    ];
    const p2 = ops.updateSchema(filled, 's1', { fields: newFields });
    const r = p2.records[0];
    expect(r.fields.title).toEqual({ en: 'Owl', vi: '' }); // preserved
    expect(r.fields.extra).toEqual({ en: '', vi: '' });     // new
    expect('note' in r.fields).toBe(false);                 // dropped
  });

  it('migrateRecordFields converts a string into a multilingual object', () => {
    const p = newProject();
    p.schemas.push({ id: 's1', name: 'X', cardTemplates: [],
      fields: [{ id: 'f1', key: 'title', label: 'T', type: 'text', multilingual: true }] });
    p.records.push({ id: 'r1', schemaId: 's1', fieldsHash: '', fields: { title: 'hi' } });
    const p2 = ops.migrateRecordFields(p);
    expect(p2.records[0].fields.title).toEqual({ en: 'hi', vi: 'hi' });
  });

  it('updateSchema can rename', () => {
    const { p } = withSchema();
    const p2 = ops.updateSchema(p, 's1', { name: 'Renamed' });
    expect(p2.schemas[0].name).toBe('Renamed');
  });

  it('deleteSchema removes the schema and its records', () => {
    const { p } = withSchema();
    const added = ops.addRecord(p, 's1');
    const p2 = ops.deleteSchema(added.project, 's1');
    expect(p2.schemas).toHaveLength(0);
    expect(p2.records).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- recordOps`
Expected: FAIL — `ops.addSchema` / `migrateRecordFields` not a function.

- [ ] **Step 3: Implement schema ops**

Append to `src/lib/modules/flashcards/recordOps.ts`:
```ts
import type { Schema } from './model';

/** Reconcile every record's fields to its schema: add missing, drop unknown,
 *  and convert string<->multilingual-object per the field's current type. */
export function migrateRecordFields(p: Project): Project {
  const records = p.records.map((rec) => {
    const schema = p.schemas.find((s) => s.id === rec.schemaId);
    if (!schema) return rec;
    const fields: Record<string, LocalizedText> = {};
    for (const f of schema.fields) {
      const cur = rec.fields[f.key];
      if (f.type === 'image' || f.multilingual === false) {
        fields[f.key] = typeof cur === 'string'
          ? cur
          : cur && typeof cur === 'object'
            ? (cur[p.activeLocale] ?? Object.values(cur)[0] ?? '')
            : '';
      } else {
        const obj: Record<string, string> = {};
        if (typeof cur === 'string') { for (const l of p.locales) obj[l] = cur; }
        else if (cur && typeof cur === 'object') { for (const l of p.locales) obj[l] = cur[l] ?? ''; }
        else { for (const l of p.locales) obj[l] = ''; }
        fields[f.key] = obj;
      }
    }
    return { ...rec, fields };
  });
  return { ...p, records };
}

export function addSchema(p: Project, name: string): { project: Project; id: string } {
  const id = uid('sch');
  const schema: Schema = { id, name: name || 'Untitled', fields: [], cardTemplates: [] };
  return { project: { ...p, schemas: [...p.schemas, schema] }, id };
}

export function updateSchema(
  p: Project, schemaId: string, patch: { name?: string; fields?: SchemaField[] },
): Project {
  const schemas = p.schemas.map((s) =>
    s.id === schemaId
      ? { ...s, ...(patch.name !== undefined ? { name: patch.name } : {}),
              ...(patch.fields ? { fields: patch.fields } : {}) }
      : s,
  );
  return migrateRecordFields({ ...p, schemas });
}

export function deleteSchema(p: Project, schemaId: string): Project {
  return {
    ...p,
    schemas: p.schemas.filter((s) => s.id !== schemaId),
    records: p.records.filter((r) => r.schemaId !== schemaId),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- recordOps`
Expected: PASS (10 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/lib/modules/flashcards/recordOps.ts tests/recordOps.test.ts
git commit -m "feat(flashcards): recordOps schema ops + field migration"
```

---

## Task 4: recordOps — locale + import ops

**Files:**
- Modify: `src/lib/modules/flashcards/recordOps.ts`
- Test: `tests/recordOps.test.ts` (add a describe block)

**Interfaces:**
- Produces:
  - `addLocale(p: Project, locale: string): Project`
  - `removeLocale(p: Project, locale: string): Project`
  - `setActiveLocale(p: Project, locale: string): Project`
  - `importRecords(p: Project, schemaId: string, incoming: RecordItem[], mode: 'overwrite' | 'append'): Project`

- [ ] **Step 1: Write the failing test**

Append to `tests/recordOps.test.ts`:
```ts
import type { RecordItem } from '../src/lib/modules/flashcards/model';

describe('recordOps locale + import', () => {
  it('addLocale extends locales and seeds the key in multilingual fields', () => {
    const { p } = withSchema();
    const added = ops.addRecord(p, 's1');
    const p2 = ops.addLocale(added.project, 'ja');
    expect(p2.locales).toContain('ja');
    expect(p2.records[0].fields.title).toEqual({ en: '', vi: '', ja: '' });
  });
  it('addLocale ignores duplicates and blanks', () => {
    const p = newProject();
    expect(ops.addLocale(p, 'en')).toBe(p);
    expect(ops.addLocale(p, '')).toBe(p);
  });
  it('removeLocale strips the key and fixes activeLocale', () => {
    const { p } = withSchema();
    const added = ops.addRecord(p, 's1');
    const p2 = ops.setActiveLocale(added.project, 'vi');
    const p3 = ops.removeLocale(p2, 'vi');
    expect(p3.locales).toEqual(['en']);
    expect(p3.activeLocale).toBe('en');
    expect(p3.records[0].fields.title).toEqual({ en: '' });
  });
  it('removeLocale refuses to remove the last locale', () => {
    const p = newProject();
    const one = ops.removeLocale(p, 'vi'); // now ['en']
    expect(ops.removeLocale(one, 'en')).toBe(one);
  });
  it('setActiveLocale only accepts known locales', () => {
    const p = newProject();
    expect(ops.setActiveLocale(p, 'zz')).toBe(p);
    expect(ops.setActiveLocale(p, 'vi').activeLocale).toBe('vi');
  });
  it('importRecords overwrite replaces that schema records only', () => {
    const { p } = withSchema();
    const seeded = ops.addRecord(p, 's1').project;
    const incoming: RecordItem[] = [{ id: '', schemaId: 'ignored', fieldsHash: '', fields: { title: { en: 'A', vi: '' } } }];
    const p2 = ops.importRecords(seeded, 's1', incoming, 'overwrite');
    expect(p2.records).toHaveLength(1);
    expect(p2.records[0].schemaId).toBe('s1'); // forced
    expect(p2.records[0].id).not.toBe('');      // id assigned
    expect(p2.records[0].fields.title).toEqual({ en: 'A', vi: '' });
  });
  it('importRecords append keeps existing', () => {
    const { p } = withSchema();
    const seeded = ops.addRecord(p, 's1').project;
    const p2 = ops.importRecords(seeded, 's1', [{ id: 'x', schemaId: 's1', fieldsHash: '', fields: {} }], 'append');
    expect(p2.records).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- recordOps`
Expected: FAIL — `ops.addLocale` not a function.

- [ ] **Step 3: Implement locale + import ops**

Append to `src/lib/modules/flashcards/recordOps.ts`:
```ts
export function addLocale(p: Project, locale: string): Project {
  if (!locale || p.locales.includes(locale)) return p;
  return migrateRecordFields({ ...p, locales: [...p.locales, locale] });
}

export function removeLocale(p: Project, locale: string): Project {
  if (!p.locales.includes(locale) || p.locales.length <= 1) return p;
  const locales = p.locales.filter((l) => l !== locale);
  const activeLocale = p.activeLocale === locale ? locales[0] : p.activeLocale;
  return migrateRecordFields({ ...p, locales, activeLocale });
}

export function setActiveLocale(p: Project, locale: string): Project {
  if (!p.locales.includes(locale)) return p;
  return { ...p, activeLocale: locale };
}

export function importRecords(
  p: Project, schemaId: string, incoming: RecordItem[], mode: 'overwrite' | 'append',
): Project {
  if (!p.schemas.some((s) => s.id === schemaId)) return p;
  const normalized: RecordItem[] = incoming.map((r) => ({
    ...r,
    id: r.id || uid('rec'),
    schemaId,
    fieldsHash: r.fieldsHash ?? '',
    fields: r.fields ?? {},
  }));
  const records = mode === 'overwrite'
    ? [...p.records.filter((r) => r.schemaId !== schemaId), ...normalized]
    : [...p.records, ...normalized];
  return migrateRecordFields({ ...p, records });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- recordOps`
Expected: PASS (17 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/lib/modules/flashcards/recordOps.ts tests/recordOps.test.ts
git commit -m "feat(flashcards): recordOps locale + import ops"
```

---

## Task 5: keyedDebounce utility

**Files:**
- Create: `src/lib/debounce.ts`
- Test: `tests/debounce.test.ts`

**Interfaces:**
- Produces: `keyedDebounce<A extends unknown[]>(fn: (...a: A) => void, ms: number): { call(key: string, ...args: A): void; flushAll(): void }`

- [ ] **Step 1: Write the failing test**

Create `tests/debounce.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { keyedDebounce } from '../src/lib/debounce';

describe('keyedDebounce', () => {
  it('coalesces rapid calls with the same key to the last args', () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    const d = keyedDebounce(spy, 300);
    d.call('a', 1); d.call('a', 2); d.call('a', 3);
    vi.advanceTimersByTime(300);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(3);
    vi.useRealTimers();
  });
  it('keeps different keys independent', () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    const d = keyedDebounce(spy, 300);
    d.call('a', 'x'); d.call('b', 'y');
    vi.advanceTimersByTime(300);
    expect(spy).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
  it('flushAll fires pending immediately', () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    const d = keyedDebounce(spy, 300);
    d.call('a', 'x');
    d.flushAll();
    expect(spy).toHaveBeenCalledWith('x');
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- debounce`
Expected: FAIL — cannot resolve `../src/lib/debounce`.

- [ ] **Step 3: Implement `debounce.ts`**

Create `src/lib/debounce.ts`:
```ts
/** Per-key trailing debounce. Calls with the same key coalesce to the last args. */
export function keyedDebounce<A extends unknown[]>(fn: (...a: A) => void, ms: number) {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const pending = new Map<string, A>();
  return {
    call(key: string, ...args: A): void {
      pending.set(key, args);
      const prev = timers.get(key);
      if (prev) clearTimeout(prev);
      timers.set(key, setTimeout(() => {
        timers.delete(key);
        const a = pending.get(key);
        pending.delete(key);
        if (a) fn(...a);
      }, ms));
    },
    flushAll(): void {
      for (const [key, t] of timers) {
        clearTimeout(t);
        const a = pending.get(key);
        if (a) fn(...a);
      }
      timers.clear();
      pending.clear();
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- debounce`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/debounce.ts tests/debounce.test.ts
git commit -m "feat: keyedDebounce utility"
```

---

## Task 6: Store action wrappers + UI stores

**Files:**
- Modify: `src/lib/modules/flashcards/stores.ts`
- Test: `tests/flashcards-stores.test.ts`

**Interfaces:**
- Consumes: `recordOps` (Tasks 2-4); existing `project`, `commit`, `initProject`, `loadProject` in `stores.ts`.
- Produces (new exports): `selectedRecordId`, `activeSchemaId`, `schemaEditorOpen` (writables); `selectRecord(id)`, `addRecord(schemaId)`, `deleteRecord(id)`, `duplicateRecord(id)`, `setField(recordId, key, value, locale?)`, `addSchema(name)`, `updateSchema(schemaId, patch)`, `deleteSchema(id)`, `addLocale(l)`, `removeLocale(l)`, `setActiveLocale(l)`, `importRecords(schemaId, incoming, mode)`.

- [ ] **Step 1: Write the failing test**

Create `tests/flashcards-stores.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import * as S from '../src/lib/modules/flashcards/stores';

beforeEach(() => { S.initProject(); });

describe('flashcards store wrappers', () => {
  it('addSchema then addRecord updates project and selects the record', () => {
    S.addSchema('Words');
    const schemaId = get(S.project).schemas[0].id;
    S.addRecord(schemaId);
    expect(get(S.project).records).toHaveLength(1);
    expect(get(S.selectedRecordId)).toBe(get(S.project).records[0].id);
    expect(get(S.dirty)).toBe(true);
  });

  it('setField edits through history (undoable)', () => {
    S.addSchema('Words');
    const sid = get(S.project).schemas[0].id;
    S.updateSchema(sid, { fields: [{ id: 'f1', key: 'title', label: 'T', type: 'text', multilingual: true }] });
    S.addRecord(sid);
    const rid = get(S.project).records[0].id;
    S.setField(rid, 'title', 'Owl', 'en');
    expect(get(S.project).records[0].fields.title).toMatchObject({ en: 'Owl' });
    S.undo();
    expect(get(S.project).records[0].fields.title).toMatchObject({ en: '' });
  });

  it('deleteRecord clears selection when the deleted record was selected', () => {
    S.addSchema('Words');
    const sid = get(S.project).schemas[0].id;
    S.addRecord(sid);
    const rid = get(S.selectedRecordId)!;
    S.deleteRecord(rid);
    expect(get(S.selectedRecordId)).toBeNull();
  });

  it('initProject resets selection', () => {
    S.addSchema('Words');
    S.addRecord(get(S.project).schemas[0].id);
    S.initProject();
    expect(get(S.selectedRecordId)).toBeNull();
    expect(get(S.project).records).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- flashcards-stores`
Expected: FAIL — `S.addSchema` is not a function.

- [ ] **Step 3: Extend `stores.ts`**

Add to `src/lib/modules/flashcards/stores.ts` (keep existing content). Add imports at top:
```ts
import { writable } from 'svelte/store';
import * as ops from './recordOps';
import type { SchemaField, RecordItem } from './model';
```
Add UI stores + wrappers (below the existing exports):
```ts
// ── UI-only state (not in history) ─────────────────────────────────────
export const selectedRecordId = writable<string | null>(null);
export const activeSchemaId = writable<string | null>(null);
export const schemaEditorOpen = writable<string | '__new__' | null>(null);

export function selectRecord(id: string | null): void { selectedRecordId.set(id); }

// ── Record actions ─────────────────────────────────────────────────────
export function addRecord(schemaId: string): void {
  const { project: np, id } = ops.addRecord(get(project), schemaId);
  if (!id) return;
  commit(np);
  activeSchemaId.set(schemaId);
  selectedRecordId.set(id);
}
export function deleteRecord(id: string): void {
  commit(ops.deleteRecord(get(project), id));
  if (get(selectedRecordId) === id) selectedRecordId.set(null);
}
export function duplicateRecord(id: string): void {
  const { project: np, id: nid } = ops.duplicateRecord(get(project), id);
  if (!nid) return;
  commit(np);
  selectedRecordId.set(nid);
}
export function setField(recordId: string, key: string, value: string, locale?: string): void {
  commit(ops.setField(get(project), recordId, key, value, locale));
}

// ── Schema actions ─────────────────────────────────────────────────────
export function addSchema(name: string): string {
  const { project: np, id } = ops.addSchema(get(project), name);
  commit(np);
  activeSchemaId.set(id);
  return id;
}
export function updateSchema(schemaId: string, patch: { name?: string; fields?: SchemaField[] }): void {
  commit(ops.updateSchema(get(project), schemaId, patch));
}
export function deleteSchema(id: string): void {
  commit(ops.deleteSchema(get(project), id));
  if (get(activeSchemaId) === id) activeSchemaId.set(get(project).schemas[0]?.id ?? null);
  const sel = get(project).records.find((r) => r.id === get(selectedRecordId));
  if (!sel) selectedRecordId.set(null);
}

// ── Locale actions ─────────────────────────────────────────────────────
export function addLocale(l: string): void { commit(ops.addLocale(get(project), l)); }
export function removeLocale(l: string): void { commit(ops.removeLocale(get(project), l)); }
export function setActiveLocale(l: string): void { commit(ops.setActiveLocale(get(project), l)); }

// ── Import ─────────────────────────────────────────────────────────────
export function importRecords(schemaId: string, incoming: RecordItem[], mode: 'overwrite' | 'append'): void {
  commit(ops.importRecords(get(project), schemaId, incoming, mode));
}
```
Modify existing `initProject` and `loadProject` to reset UI selection. Replace their bodies:
```ts
export function initProject(): void {
  history.set(H.createHistory(newProject()));
  filePath.set(null); dirty.set(false);
  selectedRecordId.set(null); activeSchemaId.set(null); schemaEditorOpen.set(null);
}
export function loadProject(p: Project, path: string | null): void {
  history.set(H.createHistory(p));
  filePath.set(path); dirty.set(false);
  selectedRecordId.set(null);
  activeSchemaId.set(p.schemas[0]?.id ?? null);
  schemaEditorOpen.set(null);
}
```
(The `writable` import may already be present via the existing `type Writable` import — ensure `writable` itself is imported.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- flashcards-stores`
Expected: PASS (4 tests).

- [ ] **Step 5: Verify no regressions + commit**

Run: `npm test -- flashcards && npm run check`
Expected: existing `flashcards-model` / `flashcards-io` still pass; check 0 errors.
```bash
git add src/lib/modules/flashcards/stores.ts tests/flashcards-stores.test.ts
git commit -m "feat(flashcards): store action wrappers + UI stores"
```

---

## Task 7: ImageField component

**Files:**
- Create: `src/lib/modules/flashcards/components/ImageField.svelte`
- Test: `tests/ImageField.test.ts`

**Interfaces:**
- Produces: `<ImageField value={string} onChange={(url: string) => void} />`

- [ ] **Step 1: Write the failing test**

Create `tests/ImageField.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/svelte';
import ImageField from '../src/lib/modules/flashcards/components/ImageField.svelte';

describe('ImageField', () => {
  it('shows the url in the input and fires onChange on typing', async () => {
    const onChange = vi.fn();
    render(ImageField, { value: 'http://x/a.png', onChange });
    const input = screen.getByPlaceholderText(/image url/i) as HTMLInputElement;
    expect(input.value).toBe('http://x/a.png');
    await fireEvent.input(input, { target: { value: 'http://x/b.png' } });
    expect(onChange).toHaveBeenCalledWith('http://x/b.png');
  });
  it('clear button empties the value', async () => {
    const onChange = vi.fn();
    render(ImageField, { value: 'http://x/a.png', onChange });
    await fireEvent.click(screen.getByRole('button', { name: /clear/i }));
    expect(onChange).toHaveBeenCalledWith('');
  });
  it('hides clear when empty', () => {
    render(ImageField, { value: '', onChange: vi.fn() });
    expect(screen.queryByRole('button', { name: /clear/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- ImageField`
Expected: FAIL — cannot resolve the component.

- [ ] **Step 3: Implement `ImageField.svelte`**

Create `src/lib/modules/flashcards/components/ImageField.svelte`:
```svelte
<script lang="ts">
  let { value = '', onChange }: { value?: string; onChange: (url: string) => void } = $props();
  let fileInput: HTMLInputElement;

  function onFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onChange(String(reader.result));
    reader.readAsDataURL(file);
  }
  async function paste() {
    try {
      const txt = await navigator.clipboard.readText();
      if (txt) onChange(txt.trim());
    } catch { /* clipboard unavailable */ }
  }
</script>

<div class="imgfield">
  <div class="thumb" class:empty={!value}
       style={value ? `background-image:url('${value}')` : ''}></div>
  <div class="body">
    <input class="url" type="text" placeholder="Image URL or data URL"
           value={value}
           oninput={(e) => onChange((e.target as HTMLInputElement).value)} />
    <div class="btns">
      <button type="button" onclick={() => fileInput.click()}>Pick…</button>
      <button type="button" onclick={paste}>Paste</button>
      {#if value}<button type="button" onclick={() => onChange('')}>Clear</button>{/if}
    </div>
  </div>
  <input bind:this={fileInput} type="file" accept="image/*" hidden onchange={onFile} />
</div>

<style>
  .imgfield { display:flex; gap:10px; align-items:flex-start; }
  .thumb { width:64px; height:64px; border:1px solid var(--border); border-radius:8px;
    background-size:cover; background-position:center; flex:none; }
  .thumb.empty { background:var(--accent-weak); }
  .body { flex:1; min-width:0; display:flex; flex-direction:column; gap:6px; }
  .url { width:100%; padding:6px 8px; border:1px solid var(--border); border-radius:6px;
    background:var(--bg); color:var(--text); font:inherit; }
  .btns { display:flex; gap:6px; }
  .btns button { border:1px solid var(--border); background:transparent; color:var(--text);
    border-radius:6px; padding:4px 10px; font:inherit; }
  .btns button:hover { background:var(--accent-weak); color:var(--accent); }
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- ImageField`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/modules/flashcards/components/ImageField.svelte tests/ImageField.test.ts
git commit -m "feat(flashcards): ImageField component"
```

---

## Task 8: RichText component (TipTap wrapper)

**Files:**
- Create: `src/lib/modules/flashcards/components/RichText.svelte`

**Interfaces:**
- Consumes: `createEditor`, `htmlToMd` from `../lib/richtext` (Task 1).
- Produces: `<RichText value={string /* markdown */} onChange={(md: string) => void} />`

**Note on testing:** TipTap/ProseMirror editor instantiation is unreliable under jsdom, so this component has **no automated test** — it is verified manually in `npm run tauri dev` (Task 15 checklist). Its risky logic (Markdown round-trip) is already covered by `richtext.test.ts`. Do not add a jsdom test that instantiates the editor.

- [ ] **Step 1: Implement `RichText.svelte`**

Create `src/lib/modules/flashcards/components/RichText.svelte`:
```svelte
<script lang="ts">
  import type { Editor } from '@tiptap/core';
  import { createEditor, htmlToMd } from '../lib/richtext';

  let { value = '', onChange }: { value?: string; onChange: (md: string) => void } = $props();
  let editor = $state<Editor | undefined>(undefined);
  let tick = $state(0); // bump to recompute toolbar active-state

  function mount(el: HTMLDivElement) {
    const ed = createEditor(el, value, () => { onChange(htmlToMd(ed.getHTML())); tick++; });
    ed.on('selectionUpdate', () => tick++);
    ed.on('transaction', () => tick++);
    editor = ed;
    return { destroy() { ed.destroy(); editor = undefined; } };
  }

  // TipTap isActive supports isActive(name, attrs?) and isActive(attrs).
  const active = (name: string | Record<string, unknown>, attrs?: Record<string, unknown>): boolean => {
    void tick; // re-run on selection/transaction ticks
    if (!editor) return false;
    return typeof name === 'string' ? editor.isActive(name, attrs) : editor.isActive(name);
  };
</script>

<div class="rt">
  <div class="rt-toolbar">
    <button type="button" class:on={active('bold')} aria-label="bold"
      onclick={() => editor?.chain().focus().toggleBold().run()}><strong>B</strong></button>
    <button type="button" class:on={active('italic')} aria-label="italic"
      onclick={() => editor?.chain().focus().toggleItalic().run()}><em>I</em></button>
    <button type="button" class:on={active('underline')} aria-label="underline"
      onclick={() => editor?.chain().focus().toggleUnderline().run()}><u>U</u></button>
    <span class="rt-div"></span>
    <button type="button" class:on={active('heading', { level: 1 })} aria-label="h1"
      onclick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}>H1</button>
    <button type="button" class:on={active('heading', { level: 2 })} aria-label="h2"
      onclick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>H2</button>
    <button type="button" class:on={active('bulletList')} aria-label="bullet list"
      onclick={() => editor?.chain().focus().toggleBulletList().run()}>•</button>
    <button type="button" class:on={active('orderedList')} aria-label="ordered list"
      onclick={() => editor?.chain().focus().toggleOrderedList().run()}>1.</button>
    <span class="rt-div"></span>
    <button type="button" class:on={active({ textAlign: 'left' })} aria-label="align left"
      onclick={() => editor?.chain().focus().setTextAlign('left').run()}>⬅</button>
    <button type="button" class:on={active({ textAlign: 'center' })} aria-label="align center"
      onclick={() => editor?.chain().focus().setTextAlign('center').run()}>⬌</button>
    <button type="button" class:on={active({ textAlign: 'right' })} aria-label="align right"
      onclick={() => editor?.chain().focus().setTextAlign('right').run()}>➡</button>
  </div>
  <div class="rt-editor" use:mount></div>
</div>

<style>
  .rt { border:1px solid var(--border); border-radius:8px; background:var(--bg); }
  .rt-toolbar { display:flex; align-items:center; gap:2px; flex-wrap:wrap; padding:4px 6px;
    border-bottom:1px solid var(--border); }
  .rt-toolbar button { border:none; background:transparent; color:var(--text);
    border-radius:6px; padding:3px 7px; font:inherit; min-width:26px; }
  .rt-toolbar button:hover { background:var(--accent-weak); color:var(--accent); }
  .rt-toolbar button.on { background:var(--accent); color:#fff; }
  .rt-div { width:1px; height:18px; background:var(--border); margin:0 4px; }
  .rt-editor { padding:8px 10px; min-height:60px; }
  .rt-editor :global(.ProseMirror) { outline:none; min-height:44px; }
  .rt-editor :global(.ProseMirror p) { margin:0 0 6px; }
</style>
```

- [ ] **Step 2: Type-check**

Run: `npm run check`
Expected: 0 errors (the `active(...)` overloads accept both a name string and an attrs object — TipTap's `isActive` supports both signatures).

- [ ] **Step 3: Commit**

```bash
git add src/lib/modules/flashcards/components/RichText.svelte
git commit -m "feat(flashcards): RichText TipTap wrapper"
```

---

## Task 9: RecordField component

**Files:**
- Create: `src/lib/modules/flashcards/components/RecordField.svelte`
- Test: `tests/RecordField.test.ts`

**Interfaces:**
- Consumes: `SchemaField`, `LocalizedText` from `../model`; `RichText` (Task 8); `ImageField` (Task 7).
- Produces: `<RecordField field={SchemaField} value={LocalizedText} locales={string[]} onChange={(val: string, locale?: string) => void} />`

**Test note:** tests use `text` and `image` field types only; `text-long` (which mounts `RichText`) is verified manually per Task 8.

- [ ] **Step 1: Write the failing test**

Create `tests/RecordField.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/svelte';
import RecordField from '../src/lib/modules/flashcards/components/RecordField.svelte';
import type { SchemaField } from '../src/lib/modules/flashcards/model';

describe('RecordField', () => {
  it('renders one input per locale for a multilingual text field', () => {
    const field: SchemaField = { id: 'f1', key: 'title', label: 'Title', type: 'text', multilingual: true };
    render(RecordField, { field, value: { en: 'Owl', vi: 'Cú' }, locales: ['en', 'vi'], onChange: vi.fn() });
    expect(screen.getByDisplayValue('Owl')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Cú')).toBeInTheDocument();
    expect(screen.getByText('EN')).toBeInTheDocument();
    expect(screen.getByText('VI')).toBeInTheDocument();
  });
  it('fires onChange with the locale for a multilingual edit', async () => {
    const field: SchemaField = { id: 'f1', key: 'title', label: 'Title', type: 'text', multilingual: true };
    const onChange = vi.fn();
    render(RecordField, { field, value: { en: '', vi: '' }, locales: ['en', 'vi'], onChange });
    const inputs = screen.getAllByRole('textbox');
    await fireEvent.input(inputs[0], { target: { value: 'Owl' } });
    expect(onChange).toHaveBeenCalledWith('Owl', 'en');
  });
  it('renders a single input (no locale tags) for a non-multilingual field', () => {
    const field: SchemaField = { id: 'f1', key: 'code', label: 'Code', type: 'text', multilingual: false };
    render(RecordField, { field, value: 'X1', locales: ['en', 'vi'], onChange: vi.fn() });
    expect(screen.getByDisplayValue('X1')).toBeInTheDocument();
    expect(screen.queryByText('EN')).not.toBeInTheDocument();
  });
  it('renders ImageField for an image field', () => {
    const field: SchemaField = { id: 'f3', key: 'pic', label: 'Pic', type: 'image' };
    render(RecordField, { field, value: 'http://x/a.png', locales: ['en'], onChange: vi.fn() });
    expect(screen.getByPlaceholderText(/image url/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- RecordField`
Expected: FAIL — cannot resolve the component.

- [ ] **Step 3: Implement `RecordField.svelte`**

Create `src/lib/modules/flashcards/components/RecordField.svelte`:
```svelte
<script lang="ts">
  import type { SchemaField, LocalizedText } from '../model';
  import RichText from './RichText.svelte';
  import ImageField from './ImageField.svelte';

  let { field, value, locales, onChange }: {
    field: SchemaField;
    value: LocalizedText;
    locales: string[];
    onChange: (val: string, locale?: string) => void;
  } = $props();

  const multilingual = $derived(field.type !== 'image' && field.multilingual !== false);
  function loc(l: string): string {
    return value && typeof value === 'object' ? (value[l] ?? '') : (typeof value === 'string' ? value : '');
  }
  function str(): string { return typeof value === 'string' ? value : ''; }
</script>

<div class="field">
  <span class="field-label">{field.label}</span>

  {#if field.type === 'image'}
    <ImageField value={str()} onChange={(u) => onChange(u)} />
  {:else if multilingual}
    <div class="locales">
      {#each locales as l (l)}
        <div class="loc-row">
          <span class="loc-tag">{l.toUpperCase()}</span>
          {#if field.type === 'text-long'}
            <RichText value={loc(l)} onChange={(md) => onChange(md, l)} />
          {:else}
            <input class="txt" type="text" value={loc(l)}
              oninput={(e) => onChange((e.target as HTMLInputElement).value, l)} />
          {/if}
        </div>
      {/each}
    </div>
  {:else if field.type === 'text-long'}
    <RichText value={str()} onChange={(md) => onChange(md)} />
  {:else}
    <input class="txt" type="text" value={str()}
      oninput={(e) => onChange((e.target as HTMLInputElement).value)} />
  {/if}
</div>

<style>
  .field { display:flex; flex-direction:column; gap:6px; }
  .field-label { font-size:12px; font-weight:600; color:var(--text-muted); }
  .locales { display:flex; flex-direction:column; gap:6px; }
  .loc-row { display:flex; gap:8px; align-items:flex-start; }
  .loc-tag { font-size:11px; font-weight:600; color:var(--accent); padding-top:8px; min-width:24px; }
  .txt { flex:1; padding:7px 9px; border:1px solid var(--border); border-radius:6px;
    background:var(--bg); color:var(--text); font:inherit; }
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- RecordField`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/modules/flashcards/components/RecordField.svelte tests/RecordField.test.ts
git commit -m "feat(flashcards): RecordField type-router component"
```

---

## Task 10: RecordDetail component

**Files:**
- Create: `src/lib/modules/flashcards/components/RecordDetail.svelte`
- Test: `tests/RecordDetail.test.ts`

**Interfaces:**
- Consumes: stores `project`, `selectedRecordId`, `setField`, `deleteRecord`, `duplicateRecord` (Task 6); `RecordField` (Task 9); `keyedDebounce` (Task 5); `@tauri-apps/plugin-dialog` `confirm`.
- Produces: `<RecordDetail />` (self-contained; reads stores).

- [ ] **Step 1: Write the failing test**

Create `tests/RecordDetail.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { render, screen } from '@testing-library/svelte';
import RecordDetail from '../src/lib/modules/flashcards/components/RecordDetail.svelte';
import * as S from '../src/lib/modules/flashcards/stores';

vi.mock('@tauri-apps/plugin-dialog', () => ({ confirm: vi.fn(async () => true) }));

beforeEach(() => {
  S.initProject();
  const sid = S.addSchema('Words');
  S.updateSchema(sid, { fields: [
    { id: 'f1', key: 'title', label: 'Title', type: 'text', multilingual: true },
    { id: 'f3', key: 'pic', label: 'Pic', type: 'image' },
  ] });
  S.addRecord(sid);
});

describe('RecordDetail', () => {
  it('renders a field per schema field for the selected record', () => {
    render(RecordDetail);
    expect(screen.getByText('Title')).toBeInTheDocument();
    expect(screen.getByText('Pic')).toBeInTheDocument();
  });
  it('shows the empty state when nothing is selected', () => {
    S.selectRecord(null);
    render(RecordDetail);
    expect(screen.getByText(/no record selected/i)).toBeInTheDocument();
  });
  it('duplicate button adds a record and selects it', async () => {
    const { getByRole } = render(RecordDetail);
    const before = get(S.project).records.length;
    await getByRole('button', { name: /duplicate/i }).click();
    expect(get(S.project).records.length).toBe(before + 1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- RecordDetail`
Expected: FAIL — cannot resolve the component.

- [ ] **Step 3: Implement `RecordDetail.svelte`**

Create `src/lib/modules/flashcards/components/RecordDetail.svelte`:
```svelte
<script lang="ts">
  import Copy from 'lucide-svelte/icons/copy';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import { confirm } from '@tauri-apps/plugin-dialog';
  import { project, selectedRecordId, setField, deleteRecord, duplicateRecord } from '../stores';
  import { keyedDebounce } from '../../../debounce';
  import RecordField from './RecordField.svelte';

  const record = $derived($project.records.find((r) => r.id === $selectedRecordId) ?? null);
  const schema = $derived(record ? ($project.schemas.find((s) => s.id === record.schemaId) ?? null) : null);

  const debounced = keyedDebounce(
    (rid: string, key: string, val: string, locale?: string) => setField(rid, key, val, locale),
    300,
  );
  function onFieldChange(key: string, val: string, locale?: string) {
    if (!record) return;
    debounced.call(`${record.id}|${key}|${locale ?? ''}`, record.id, key, val, locale);
  }
  // Flush pending edits when switching away from a record so nothing is lost.
  let lastId: string | null = null;
  $effect(() => {
    const id = $selectedRecordId;
    if (id !== lastId) { debounced.flushAll(); lastId = id; }
  });

  async function onDelete() {
    if (!record) return;
    if (await confirm('Delete this record?', { title: 'Delete record', kind: 'warning' })) {
      deleteRecord(record.id);
    }
  }
</script>

{#if record && schema}
  <div class="detail">
    <header class="detail-header">
      <span class="detail-title">Edit record</span>
      <div class="actions">
        <button type="button" onclick={() => duplicateRecord(record.id)} title="Duplicate record">
          <Copy size={15} /> Duplicate
        </button>
        <button type="button" class="danger" onclick={onDelete} title="Delete record">
          <Trash2 size={15} />
        </button>
      </div>
    </header>
    <div class="detail-body">
      {#each schema.fields as f (f.id)}
        <RecordField
          field={f}
          value={record.fields[f.key] ?? ''}
          locales={$project.locales}
          onChange={(val, locale) => onFieldChange(f.key, val, locale)} />
      {/each}
      {#if schema.fields.length === 0}
        <p class="hint">This schema has no fields yet. Edit the schema to add some.</p>
      {/if}
    </div>
  </div>
{:else}
  <div class="empty">
    <p>No record selected. Pick one on the left, or add a new record.</p>
  </div>
{/if}

<style>
  .detail { height:100%; display:flex; flex-direction:column; min-height:0; }
  .detail-header { display:flex; align-items:center; justify-content:space-between;
    padding:10px 14px; border-bottom:1px solid var(--border); background:var(--surface); }
  .detail-title { font-weight:600; }
  .actions { display:flex; gap:6px; }
  .actions button { display:inline-flex; align-items:center; gap:5px; border:1px solid var(--border);
    background:transparent; color:var(--text); border-radius:6px; padding:4px 9px; font:inherit; }
  .actions button:hover { background:var(--accent-weak); color:var(--accent); }
  .actions .danger:hover { background:#fee; color:#b91c1c; }
  .detail-body { flex:1; overflow:auto; padding:14px; display:flex; flex-direction:column; gap:14px; }
  .hint, .empty p { color:var(--text-muted); font-size:13px; }
  .empty { height:100%; display:flex; align-items:center; justify-content:center; padding:24px; text-align:center; }
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- RecordDetail`
Expected: PASS (3 tests). Note: field edits are debounced (300ms); these tests do not assert on debounced commits.

- [ ] **Step 5: Commit**

```bash
git add src/lib/modules/flashcards/components/RecordDetail.svelte tests/RecordDetail.test.ts
git commit -m "feat(flashcards): RecordDetail form with debounced edits"
```

---

## Task 11: LocaleBar component

**Files:**
- Create: `src/lib/modules/flashcards/components/LocaleBar.svelte`
- Test: `tests/LocaleBar.test.ts`

**Interfaces:**
- Consumes: stores `project`, `addLocale`, `removeLocale`, `setActiveLocale` (Task 6).
- Produces: `<LocaleBar />`.

- [ ] **Step 1: Write the failing test**

Create `tests/LocaleBar.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { render, fireEvent, screen } from '@testing-library/svelte';
import LocaleBar from '../src/lib/modules/flashcards/components/LocaleBar.svelte';
import * as S from '../src/lib/modules/flashcards/stores';

beforeEach(() => { S.initProject(); }); // locales en, vi

describe('LocaleBar', () => {
  it('renders a button per locale and marks the active one', () => {
    render(LocaleBar);
    const en = screen.getByRole('button', { name: 'EN' });
    expect(en.closest('.chip')).toHaveClass('active'); // active class is on the wrapping chip
  });
  it('clicking a locale sets it active', async () => {
    render(LocaleBar);
    await fireEvent.click(screen.getByRole('button', { name: 'VI' }));
    expect(get(S.project).activeLocale).toBe('vi');
  });
  it('adds a locale from the input', async () => {
    render(LocaleBar);
    const input = screen.getByPlaceholderText(/add locale/i);
    await fireEvent.input(input, { target: { value: 'ja' } });
    await fireEvent.submit(input.closest('form')!);
    expect(get(S.project).locales).toContain('ja');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- LocaleBar`
Expected: FAIL — cannot resolve the component.

- [ ] **Step 3: Implement `LocaleBar.svelte`**

Create `src/lib/modules/flashcards/components/LocaleBar.svelte`:
```svelte
<script lang="ts">
  import X from 'lucide-svelte/icons/x';
  import { project, addLocale, removeLocale, setActiveLocale } from '../stores';

  let newLocale = $state('');
  function submit(e: Event) {
    e.preventDefault();
    const l = newLocale.trim().toLowerCase();
    if (l) addLocale(l);
    newLocale = '';
  }
</script>

<div class="localebar">
  {#each $project.locales as l (l)}
    <span class="chip" class:active={$project.activeLocale === l}>
      <button type="button" class="pick" onclick={() => setActiveLocale(l)}>{l.toUpperCase()}</button>
      {#if $project.locales.length > 1}
        <button type="button" class="rm" aria-label={`remove ${l}`} onclick={() => removeLocale(l)}>
          <X size={11} />
        </button>
      {/if}
    </span>
  {/each}
  <form onsubmit={submit}>
    <input placeholder="add locale…" bind:value={newLocale} size="8" />
  </form>
</div>

<style>
  .localebar { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
  .chip { display:inline-flex; align-items:center; border:1px solid var(--border); border-radius:6px; overflow:hidden; }
  .chip.active { border-color:var(--accent); }
  .pick { border:none; background:transparent; color:var(--text); font:inherit; font-size:12px; padding:3px 7px; }
  .chip.active .pick { background:var(--accent); color:#fff; font-weight:600; }
  .rm { border:none; background:transparent; color:var(--text-muted); display:inline-flex; padding:2px 4px; }
  .rm:hover { color:#b91c1c; }
  .localebar input { border:1px solid var(--border); border-radius:6px; padding:3px 7px;
    background:var(--bg); color:var(--text); font:inherit; font-size:12px; }
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- LocaleBar`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/modules/flashcards/components/LocaleBar.svelte tests/LocaleBar.test.ts
git commit -m "feat(flashcards): LocaleBar component"
```

---

## Task 12: SchemaRecordList component (left pane) + JSON copy/paste

**Files:**
- Create: `src/lib/modules/flashcards/components/SchemaRecordList.svelte`
- Test: `tests/SchemaRecordList.test.ts`

**Interfaces:**
- Consumes: stores `project`, `selectedRecordId`, `activeSchemaId`, `schemaEditorOpen`, `selectRecord`, `addRecord`, `addSchema`, `importRecords` (Task 6); `LocaleBar` (Task 11); `@tauri-apps/plugin-dialog` `confirm`.
- Produces: `<SchemaRecordList />`.
- Row label: the first non-image field's active-locale value, else `(untitled)`.

- [ ] **Step 1: Write the failing test**

Create `tests/SchemaRecordList.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { render, fireEvent, screen } from '@testing-library/svelte';
import SchemaRecordList from '../src/lib/modules/flashcards/components/SchemaRecordList.svelte';
import * as S from '../src/lib/modules/flashcards/stores';

vi.mock('@tauri-apps/plugin-dialog', () => ({ confirm: vi.fn(async () => true) }));

function seed() {
  S.initProject();
  const sid = S.addSchema('Words');
  S.updateSchema(sid, { fields: [{ id: 'f1', key: 'title', label: 'Title', type: 'text', multilingual: true }] });
  S.addRecord(sid);
  S.setField(get(S.project).records[0].id, 'title', 'Owl', 'en');
  return sid;
}
beforeEach(seed);

describe('SchemaRecordList', () => {
  it('shows the schema name and a row labelled by the first field', () => {
    render(SchemaRecordList);
    expect(screen.getByText('Words')).toBeInTheDocument();
    expect(screen.getByText('Owl')).toBeInTheDocument();
  });
  it('clicking a record selects it', async () => {
    render(SchemaRecordList);
    await fireEvent.click(screen.getByText('Owl'));
    expect(get(S.selectedRecordId)).toBe(get(S.project).records[0].id);
  });
  it('add-record button adds a record to that schema', async () => {
    const sid = get(S.project).schemas[0].id;
    render(SchemaRecordList);
    const before = get(S.project).records.length;
    await fireEvent.click(screen.getByRole('button', { name: /add record/i }));
    expect(get(S.project).records.length).toBe(before + 1);
    expect(get(S.project).records.at(-1)!.schemaId).toBe(sid);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- SchemaRecordList`
Expected: FAIL — cannot resolve the component.

- [ ] **Step 3: Implement `SchemaRecordList.svelte`**

Create `src/lib/modules/flashcards/components/SchemaRecordList.svelte`:
```svelte
<script lang="ts">
  import Plus from 'lucide-svelte/icons/plus';
  import Pencil from 'lucide-svelte/icons/pencil';
  import Clipboard from 'lucide-svelte/icons/clipboard';
  import ClipboardPaste from 'lucide-svelte/icons/clipboard-paste';
  import { confirm } from '@tauri-apps/plugin-dialog';
  import {
    project, selectedRecordId, selectRecord, addRecord, addSchema,
    schemaEditorOpen, importRecords,
  } from '../stores';
  import { showToast } from '../../../shell';
  import type { RecordItem, Schema } from '../model';
  import LocaleBar from './LocaleBar.svelte';

  function rowLabel(rec: RecordItem, schema: Schema): string {
    const f = schema.fields.find((x) => x.type !== 'image');
    if (!f) return '(untitled)';
    const v = rec.fields[f.key];
    const s = v && typeof v === 'object' ? (v[$project.activeLocale] ?? '') : (typeof v === 'string' ? v : '');
    return s.trim() || '(untitled)';
  }
  const recordsBySchema = $derived((id: string) => $project.records.filter((r) => r.schemaId === id));

  async function copyJson(schemaId: string) {
    const recs = $project.records.filter((r) => r.schemaId === schemaId);
    try {
      await navigator.clipboard.writeText(JSON.stringify(recs, null, 2));
      showToast('Records copied as JSON');
    } catch { showToast('Could not access clipboard', 'error'); }
  }
  async function pasteJson(schemaId: string) {
    let incoming: RecordItem[];
    try {
      const txt = await navigator.clipboard.readText();
      const parsed = JSON.parse(txt);
      if (!Array.isArray(parsed)) throw new Error('not an array');
      incoming = parsed as RecordItem[];
    } catch { showToast('Clipboard is not a records JSON array', 'error'); return; }
    const overwrite = await confirm(
      `Paste ${incoming.length} record(s)? OK = overwrite this schema, Cancel = append.`,
      { title: 'Paste records', kind: 'info' },
    );
    importRecords(schemaId, incoming, overwrite ? 'overwrite' : 'append');
    showToast('Records pasted');
  }
</script>

<div class="list">
  <div class="list-top">
    <LocaleBar />
    <button type="button" class="new-schema" onclick={() => schemaEditorOpen.set('__new__')}>
      <Plus size={14} /> Schema
    </button>
  </div>

  {#if $project.schemas.length === 0}
    <div class="empty">
      <p>No schemas yet.</p>
      <button type="button" onclick={() => schemaEditorOpen.set('__new__')}>Create a schema</button>
    </div>
  {:else}
    {#each $project.schemas as schema (schema.id)}
      <section class="schema">
        <header class="schema-head">
          <span class="schema-name">{schema.name}</span>
          <span class="count">{recordsBySchema(schema.id).length}</span>
          <div class="schema-actions">
            <button type="button" aria-label="edit schema" title="Edit schema"
              onclick={() => schemaEditorOpen.set(schema.id)}><Pencil size={13} /></button>
            <button type="button" aria-label="copy json" title="Copy records JSON"
              onclick={() => copyJson(schema.id)}><Clipboard size={13} /></button>
            <button type="button" aria-label="paste json" title="Paste records JSON"
              onclick={() => pasteJson(schema.id)}><ClipboardPaste size={13} /></button>
          </div>
        </header>
        <ul class="records">
          {#each recordsBySchema(schema.id) as rec (rec.id)}
            <li>
              <button type="button" class="rec" class:sel={$selectedRecordId === rec.id}
                onclick={() => selectRecord(rec.id)}>{rowLabel(rec, schema)}</button>
            </li>
          {/each}
        </ul>
        <button type="button" class="add-rec" onclick={() => addRecord(schema.id)}>
          <Plus size={13} /> Add record
        </button>
      </section>
    {/each}
  {/if}
</div>

<style>
  .list { height:100%; overflow:auto; padding:10px; display:flex; flex-direction:column; gap:12px; background:var(--sidebar); }
  .list-top { display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap; }
  .new-schema, .add-rec { display:inline-flex; align-items:center; gap:5px; border:1px solid var(--border);
    background:transparent; color:var(--text); border-radius:6px; padding:4px 9px; font:inherit; font-size:12px; }
  .new-schema:hover, .add-rec:hover { background:var(--accent-weak); color:var(--accent); }
  .schema { display:flex; flex-direction:column; gap:6px; }
  .schema-head { display:flex; align-items:center; gap:8px; }
  .schema-name { font-weight:600; font-size:13px; }
  .count { font-size:11px; color:var(--text-muted); background:var(--accent-weak); border-radius:10px; padding:0 7px; }
  .schema-actions { margin-left:auto; display:flex; gap:2px; }
  .schema-actions button { border:none; background:transparent; color:var(--text-muted); padding:3px; border-radius:5px; }
  .schema-actions button:hover { background:var(--accent-weak); color:var(--accent); }
  .records { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:2px; }
  .rec { width:100%; text-align:left; border:none; background:transparent; color:var(--text);
    border-radius:6px; padding:6px 9px; font:inherit; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .rec:hover { background:var(--accent-weak); }
  .rec.sel { background:var(--accent); color:#fff; font-weight:600; }
  .empty { color:var(--text-muted); font-size:13px; text-align:center; padding:20px 8px; display:flex; flex-direction:column; gap:8px; align-items:center; }
  .empty button { border:1px solid var(--border); background:transparent; color:var(--text); border-radius:6px; padding:5px 12px; font:inherit; }
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- SchemaRecordList`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/modules/flashcards/components/SchemaRecordList.svelte tests/SchemaRecordList.test.ts
git commit -m "feat(flashcards): SchemaRecordList left pane + JSON copy/paste"
```

---

## Task 13: SchemaEditorModal component

**Files:**
- Create: `src/lib/modules/flashcards/components/SchemaEditorModal.svelte`
- Test: `tests/SchemaEditorModal.test.ts`

**Interfaces:**
- Consumes: stores `project`, `schemaEditorOpen`, `addSchema`, `updateSchema`, `deleteSchema` (Task 6); `SchemaField` from `../model`; `@tauri-apps/plugin-dialog` `confirm`.
- Produces: `<SchemaEditorModal />` — renders nothing when `$schemaEditorOpen === null`; otherwise a modal editing the target schema (`'__new__'` creates then edits).
- Editing is **local (draft)** until Save; Save calls `addSchema`(if new)/`updateSchema` then closes.

- [ ] **Step 1: Write the failing test**

Create `tests/SchemaEditorModal.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { render, fireEvent, screen } from '@testing-library/svelte';
import SchemaEditorModal from '../src/lib/modules/flashcards/components/SchemaEditorModal.svelte';
import * as S from '../src/lib/modules/flashcards/stores';

vi.mock('@tauri-apps/plugin-dialog', () => ({ confirm: vi.fn(async () => true) }));

beforeEach(() => { S.initProject(); });

describe('SchemaEditorModal', () => {
  it('renders nothing when closed', () => {
    render(SchemaEditorModal);
    expect(screen.queryByText(/schema name/i)).not.toBeInTheDocument();
  });
  it('creates a new schema with a field on save', async () => {
    render(SchemaEditorModal);
    S.schemaEditorOpen.set('__new__');
    await screen.findByText(/schema name/i);
    await fireEvent.input(screen.getByLabelText(/schema name/i), { target: { value: 'Verbs' } });
    await fireEvent.click(screen.getByRole('button', { name: /add field/i }));
    const keyInput = screen.getByLabelText(/field key/i);
    await fireEvent.input(keyInput, { target: { value: 'title' } });
    await fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    const schemas = get(S.project).schemas;
    expect(schemas).toHaveLength(1);
    expect(schemas[0].name).toBe('Verbs');
    expect(schemas[0].fields[0].key).toBe('title');
    expect(get(S.schemaEditorOpen)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- SchemaEditorModal`
Expected: FAIL — cannot resolve the component.

- [ ] **Step 3: Implement `SchemaEditorModal.svelte`**

Create `src/lib/modules/flashcards/components/SchemaEditorModal.svelte`:
```svelte
<script lang="ts">
  import Plus from 'lucide-svelte/icons/plus';
  import X from 'lucide-svelte/icons/x';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import { confirm } from '@tauri-apps/plugin-dialog';
  import { project, schemaEditorOpen, addSchema, updateSchema, deleteSchema } from '../stores';
  import { uid, type SchemaField } from '../model';

  let name = $state('');
  let fields = $state<SchemaField[]>([]);
  let target = $state<string | '__new__' | null>(null);

  // Load a draft whenever the editor target changes.
  $effect(() => {
    const open = $schemaEditorOpen;
    if (open === target) return;
    target = open;
    if (open === null) return;
    if (open === '__new__') { name = ''; fields = []; return; }
    const s = $project.schemas.find((x) => x.id === open);
    name = s?.name ?? '';
    fields = s ? structuredClone(s.fields) : [];
  });

  function addField() {
    fields = [...fields, { id: uid('fld'), key: '', label: '', type: 'text', multilingual: true }];
  }
  function removeField(i: number) { fields = fields.filter((_, idx) => idx !== i); }
  function moveField(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= fields.length) return;
    const next = [...fields];
    [next[i], next[j]] = [next[j], next[i]];
    fields = next;
  }
  function patchField(i: number, patch: Partial<SchemaField>) {
    fields = fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f));
  }

  function close() { schemaEditorOpen.set(null); }
  function save() {
    // Fill blank keys/labels defensively so records can address fields.
    const clean = fields.map((f, i) => ({
      ...f,
      key: f.key.trim() || `field${i + 1}`,
      label: f.label.trim() || f.key.trim() || `Field ${i + 1}`,
    }));
    if (target === '__new__') {
      const id = addSchema(name.trim() || 'Untitled');
      updateSchema(id, { fields: clean });
    } else if (target) {
      updateSchema(target, { name: name.trim() || 'Untitled', fields: clean });
    }
    close();
  }
  async function onDeleteSchema() {
    if (target && target !== '__new__') {
      if (await confirm('Delete this schema and all its records?', { title: 'Delete schema', kind: 'warning' })) {
        deleteSchema(target);
        close();
      }
    }
  }
</script>

{#if $schemaEditorOpen !== null}
  <div class="overlay" role="dialog" aria-modal="true">
    <div class="modal">
      <header class="modal-head">
        <span>{target === '__new__' ? 'New schema' : 'Edit schema'}</span>
        <button type="button" aria-label="close" onclick={close}><X size={16} /></button>
      </header>

      <div class="modal-body">
        <label class="row">
          <span class="lbl">Schema name</span>
          <input bind:value={name} />
        </label>

        <div class="fields-head">
          <span class="lbl">Fields</span>
          <button type="button" class="add" onclick={addField}><Plus size={13} /> Add field</button>
        </div>

        {#each fields as f, i (f.id)}
          <div class="field-row">
            <input aria-label="field key" placeholder="key" bind:value={f.key}
              oninput={(e) => patchField(i, { key: (e.target as HTMLInputElement).value })} />
            <input aria-label="field label" placeholder="label" bind:value={f.label}
              oninput={(e) => patchField(i, { label: (e.target as HTMLInputElement).value })} />
            <select aria-label="field type" value={f.type}
              onchange={(e) => patchField(i, { type: (e.target as HTMLSelectElement).value as SchemaField['type'] })}>
              <option value="text">text</option>
              <option value="text-long">text-long</option>
              <option value="image">image</option>
            </select>
            <label class="ml" title="multilingual">
              <input type="checkbox" checked={f.multilingual !== false}
                disabled={f.type === 'image'}
                onchange={(e) => patchField(i, { multilingual: (e.target as HTMLInputElement).checked })} /> ML
            </label>
            <button type="button" aria-label="move up" onclick={() => moveField(i, -1)}>↑</button>
            <button type="button" aria-label="move down" onclick={() => moveField(i, 1)}>↓</button>
            <button type="button" aria-label="remove field" onclick={() => removeField(i)}><X size={13} /></button>
          </div>
        {/each}
      </div>

      <footer class="modal-foot">
        {#if target !== '__new__'}
          <button type="button" class="danger" onclick={onDeleteSchema}><Trash2 size={14} /> Delete schema</button>
        {/if}
        <span class="spacer"></span>
        <button type="button" onclick={close}>Cancel</button>
        <button type="button" class="primary" onclick={save}>Save</button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .overlay { position:fixed; inset:0; background:rgba(0,0,0,.4); display:flex; align-items:center;
    justify-content:center; z-index:50; }
  .modal { background:var(--surface); color:var(--text); border:1px solid var(--border);
    border-radius:12px; width:min(640px,92vw); max-height:88vh; display:flex; flex-direction:column; }
  .modal-head { display:flex; align-items:center; justify-content:space-between; padding:12px 16px;
    border-bottom:1px solid var(--border); font-weight:600; }
  .modal-head button { border:none; background:transparent; color:var(--text-muted); }
  .modal-body { padding:14px 16px; overflow:auto; display:flex; flex-direction:column; gap:12px; }
  .lbl { font-size:12px; font-weight:600; color:var(--text-muted); }
  .row { display:flex; flex-direction:column; gap:5px; }
  .row input { padding:7px 9px; border:1px solid var(--border); border-radius:6px; background:var(--bg); color:var(--text); font:inherit; }
  .fields-head { display:flex; align-items:center; justify-content:space-between; }
  .add { display:inline-flex; align-items:center; gap:5px; border:1px solid var(--border); background:transparent;
    color:var(--text); border-radius:6px; padding:4px 9px; font:inherit; font-size:12px; }
  .add:hover { background:var(--accent-weak); color:var(--accent); }
  .field-row { display:flex; align-items:center; gap:6px; }
  .field-row input[type=text], .field-row input:not([type]), .field-row select { padding:5px 7px;
    border:1px solid var(--border); border-radius:6px; background:var(--bg); color:var(--text); font:inherit; font-size:13px; }
  .field-row > input { flex:1; min-width:0; }
  .field-row > button { border:1px solid var(--border); background:transparent; color:var(--text-muted);
    border-radius:6px; padding:4px 7px; font:inherit; }
  .ml { display:inline-flex; align-items:center; gap:3px; font-size:11px; color:var(--text-muted); }
  .modal-foot { display:flex; align-items:center; gap:8px; padding:12px 16px; border-top:1px solid var(--border); }
  .spacer { flex:1; }
  .modal-foot button { border:1px solid var(--border); background:transparent; color:var(--text);
    border-radius:6px; padding:6px 14px; font:inherit; }
  .modal-foot .primary { background:var(--accent); color:#fff; border-color:var(--accent); font-weight:600; }
  .modal-foot .danger { color:#b91c1c; border-color:#f3c2c2; display:inline-flex; align-items:center; gap:5px; }
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- SchemaEditorModal`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/modules/flashcards/components/SchemaEditorModal.svelte tests/SchemaEditorModal.test.ts
git commit -m "feat(flashcards): SchemaEditorModal"
```

---

## Task 14: Wire Workspace + full-suite gates + manual verification

**Files:**
- Modify: `src/lib/modules/flashcards/Workspace.svelte`
- Test: `tests/flashcards-workspace.test.ts`

**Interfaces:**
- Consumes: `SchemaRecordList` (Task 12), `RecordDetail` (Task 10), `SchemaEditorModal` (Task 13); `dragX` action (existing `../../actions/resize`); stores `project`.

- [ ] **Step 1: Write the failing test**

Create `tests/flashcards-workspace.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Workspace from '../src/lib/modules/flashcards/Workspace.svelte';
import * as S from '../src/lib/modules/flashcards/stores';

vi.mock('@tauri-apps/plugin-dialog', () => ({ confirm: vi.fn(async () => true) }));

beforeEach(() => {
  S.initProject();
  const sid = S.addSchema('Words');
  S.updateSchema(sid, { fields: [{ id: 'f1', key: 'title', label: 'Title', type: 'text', multilingual: true }] });
  S.addRecord(sid);
});

describe('Flashcards Workspace', () => {
  it('renders the left list and the detail form together', () => {
    render(Workspace);
    expect(screen.getByText('Words')).toBeInTheDocument();       // left pane schema
    expect(screen.getByText('Title')).toBeInTheDocument();       // right pane field (record auto-selected)
  });
  it('shows the project name in the header', () => {
    render(Workspace);
    expect(screen.getByText('Untitled')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- flashcards-workspace`
Expected: FAIL — Workspace still the placeholder (no "Title" text).

- [ ] **Step 3: Rewrite `Workspace.svelte`**

Replace `src/lib/modules/flashcards/Workspace.svelte` with:
```svelte
<script lang="ts">
  import { project } from './stores';
  import { dragX } from '../../actions/resize';
  import SchemaRecordList from './components/SchemaRecordList.svelte';
  import RecordDetail from './components/RecordDetail.svelte';
  import SchemaEditorModal from './components/SchemaEditorModal.svelte';

  let leftWidth = $state(300);
</script>

<div class="workspace">
  <header class="header">
    <span class="project-name">{$project.projectName}</span>
    <span class="counts">
      {$project.schemas.length} schema{$project.schemas.length === 1 ? '' : 's'} ·
      {$project.records.length} record{$project.records.length === 1 ? '' : 's'}
    </span>
  </header>
  <div class="body" style={`grid-template-columns:${leftWidth}px 6px 1fr`}>
    <div class="left"><SchemaRecordList /></div>
    <div
      class="divider divider-x"
      role="separator"
      aria-orientation="vertical"
      aria-label="resize sidebar"
      use:dragX={(dx) => (leftWidth = Math.max(220, Math.min(560, leftWidth + dx)))}
    ></div>
    <div class="right"><RecordDetail /></div>
  </div>
  <SchemaEditorModal />
</div>

<style>
  .workspace { flex:1; display:flex; flex-direction:column; min-height:0; background:var(--bg); color:var(--text); }
  .header { display:flex; align-items:center; gap:12px; padding:8px 12px;
    background:var(--surface); border-bottom:1px solid var(--border); }
  .project-name { font-weight:600; }
  .counts { color:var(--text-muted); font-size:12px; }
  .body { flex:1; display:grid; min-height:0; }
  .left, .right { min-height:0; min-width:0; }
  .left { background:var(--sidebar); }
  .right { background:var(--bg); }
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- flashcards-workspace`
Expected: PASS (2 tests).

- [ ] **Step 5: Run all gates**

Run: `npm test`
Expected: all suites green, 0 unhandled errors (existing 123 + new ~40).
Run: `npm run check`
Expected: 0 errors (the pre-existing `TreeNode` `state_referenced_locally` warning may remain — it is a warning, not an error).
Run: `npm run build`
Expected: vite build completes OK.

- [ ] **Step 6: Manual verification (`npm run tauri dev`)**

Confirm each (these cover the jsdom-untested RichText path):
- Start screen → **New Flashcards** → empty workspace with "Create a schema".
- Create a schema `Words` with fields `title` (text, ML), `note` (text-long, ML), `pic` (image); Save.
- **Add record** → row appears; select it → form shows Title (EN/VI inputs), Note (rich-text with EN/VI editors + working B/I/H1/list/align toolbar), Pic (URL/Pick/Paste + thumbnail).
- Type in Note; switch record and back → text persists (debounced commit flushed).
- Locale bar: add `ja` → a JA input/editor appears on multilingual fields; switch active locale; remove `ja`.
- Duplicate a record; delete a record (confirm dialog); undo/redo (Ctrl+Z / Ctrl+Y) across edits.
- Copy JSON on a schema, Paste JSON (append + overwrite).
- Save (Ctrl+S) → writes `.tomoe.json`; reopen the file → records/schemas/locales restored.

- [ ] **Step 7: Commit**

```bash
git add src/lib/modules/flashcards/Workspace.svelte tests/flashcards-workspace.test.ts
git commit -m "feat(flashcards): wire Records workspace (list + detail + schema editor)"
```

---

## Self-review notes (author)

- **Spec coverage:** list+form (T12/T10/T14), schema+field editor no cardTemplates (T13), record CRUD incl. duplicate (T2/T6/T10), rich-text WYSIWYG stored as Markdown (T1/T8/T9), image url/paste/pick/clear (T7), locale management (T4/T6/T11), JSON copy/paste records-only (T4/T6/T12), debounced undo granularity (T5/T10). All mapped.
- **Out-of-scope** items (card preview, status, chips, pack, image search/crop, AI, sort/search) are not implemented — consistent with the spec.
- **Type consistency:** `setField(recordId,key,value,locale?)`, `updateSchema(schemaId,{name?,fields?})`, `importRecords(schemaId,incoming,mode)`, `addSchema→string` used identically across recordOps, stores, and components.
- **Testing gap (declared, not silent):** `RichText.svelte` and the `text-long` branch of `RecordField` are verified manually (Task 14 Step 6), because TipTap/ProseMirror is unreliable under jsdom; the Markdown round-trip logic they depend on is unit-tested in `richtext.test.ts`.
```
