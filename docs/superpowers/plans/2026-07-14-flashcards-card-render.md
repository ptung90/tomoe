# Flashcards Card Render + Live Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the flashcard-creator render engine into Tomoe as a pure TS util and show a live, scale-to-fit card preview of the selected record in a third workspace pane, with layout / paper / orientation controls and basic style (border + fonts) editing.

**Architecture:** A pure `card-render.ts` (`buildCardHTML` → HTML string, rendered via `{@html}`) + a global `card-render.css` for `.fc-*` classes; a pure `cardMapping.ts` turns a record + auto-derived template into the `Card` the engine consumes; thin Svelte components (`CardPreview`, `StyleControls`) read `$project` and commit through store wrappers.

**Tech Stack:** Svelte 5 (runes), TypeScript, Vite 5, vitest + @testing-library/svelte, `marked` (already a dep), Tomoe flashcards model.

## Global Constraints

- Everything under `src/lib/modules/flashcards/`. Module isolation: no shared/global state beyond the existing shell + per-module store.
- **Card interior colors are FIXED print colors** (white card `#fff`, dark text `#1a1a1a`, grey placeholders `#9ca3af`), NOT Calm Paper tokens — a card represents a physical white sheet. Calm Paper tokens (`var(--bg)`, `var(--surface)`, `var(--border)`, `var(--text)`, `var(--text-muted)`, `var(--accent)`, `var(--accent-weak)`) apply ONLY to the surrounding pane chrome (CardPreview toolbar, StyleControls). `#fff` on accent is an accepted repo pattern; the repo has no danger token (hardcoded danger red accepted).
- `text-long`/section content is Markdown; render via `marked`. Rendered card HTML is injected with `{@html}` — acceptable because it is the user's own local project data (no third-party input); per-card `customCss` editing is NOT exposed here.
- lucide-svelte icons: subpath imports only (`lucide-svelte/icons/<name>`).
- The render engine is PURE: no Svelte, no DOM, no globals. `buildCardHTML(card, settings, locale, forPrint=false, overridePx=null)`.
- Only these 7 layouts are in scope: `fulltext`, `fullimage`, `2x2`, `1top-1bot`, `1top-2bot`, `2top-1bot`, `3card`. Do NOT port `buildHandles` (drag) or the heavy compounds (`8img-8txt`, `6cell`, `txtgrid`, `img3-txt3`, `2img-2txt`, `3img-3txt`).
- Port source (present on disk): `d:\github\flashcard-creator\src\js\render.js`, `src\js\core\state.js`, `src\js\core\layouts-compound.js`, `src\js\core\utils.js`, `src\css\preview.css`.
- TDD: failing test first for all pure logic. Gates: `npm run check` 0 errors, `npm test` green (0 unhandled), `npm run build` OK. Commit after each task.

## File map

```
src/lib/modules/flashcards/
  lib/card-render.ts        # NEW: pure buildCardHTML + registries + helpers
  lib/card-render.css       # NEW: ported .fc-* styles (global)
  cardMapping.ts            # NEW: deriveAutoTemplate, recordToCard, applySettings, applyTemplatePatch (pure)
  stores.ts                 # MODIFY: setSettings, setTemplateLayout
  Workspace.svelte          # MODIFY: 3rd pane + second resizer
  components/
    CardPreview.svelte      # NEW: right pane (toolbar + scaled {@html} card)
    StyleControls.svelte    # NEW: border + title/content font editing
tests/
  card-render.test.ts, cardMapping.test.ts, flashcards-cardstores.test.ts,
  StyleControls.test.ts, CardPreview.test.ts, flashcards-workspace.test.ts (extend)
```

Model reference (`src/lib/modules/flashcards/model.ts`, already exists) — types used verbatim: `Card` (requires `id, layout, imageHeightPercent, images, title, sections`; optional `orientation, hideTitle, hideSectionLabels, titleFont, contentFont, customCss, cssClass, imageGridSplit`), `CardTemplate` (`id, templateType, layout, size?, orientation?, hideTitle?, hideSectionLabels?, mapping`), `CardSection` (`id, label: LocalizedText, content: LocalizedText, customClass?, fontSize?, textAlign?, labelSize?`), `CardImage` (`slot, url, size?, color?`), `Settings`, `FontSpec`, `Schema`, `SchemaField`, `RecordItem`, `LocalizedText`, `uid`.

---

## Task 1: card-render.ts — helpers + registries

**Files:**
- Create: `src/lib/modules/flashcards/lib/card-render.ts`
- Test: `tests/card-render.test.ts`

**Interfaces:**
- Produces: `PAPER_MM`, `LAYOUTS` (7), `LAYOUT_SLOTS`, `LAYOUT_SPLIT_DEFAULTS`; `getPaperPx(paperSize, orientation): {w:number;h:number}`, `mmToPx(mm): number`, `esc(s): string`, `resolveLocale(val: LocalizedText | undefined, locale: string): string`, `mdInline(s): string`, `mdBlock(s): string`.

- [ ] **Step 1: Write the failing test**

Create `tests/card-render.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { getPaperPx, mmToPx, esc, resolveLocale, LAYOUTS, LAYOUT_SLOTS } from '../src/lib/modules/flashcards/lib/card-render';

describe('card-render helpers', () => {
  it('getPaperPx A5 portrait ~ 559x794 px', () => {
    const { w, h } = getPaperPx('A5', 'portrait');
    expect(w).toBe(Math.round((148 / 25.4) * 96));
    expect(h).toBe(Math.round((210 / 25.4) * 96));
    expect(h).toBeGreaterThan(w);
  });
  it('getPaperPx landscape swaps w/h', () => {
    const p = getPaperPx('A5', 'landscape');
    expect(p.w).toBeGreaterThan(p.h);
  });
  it('mmToPx converts mm to px at 96dpi', () => { expect(mmToPx(25.4)).toBe(96); });
  it('esc escapes html', () => { expect(esc('<a>&"')).toBe('&lt;a&gt;&amp;&quot;'); });
  it('resolveLocale reads a localized object and passes strings through', () => {
    expect(resolveLocale({ en: 'Owl', vi: 'Cú' }, 'vi')).toBe('Cú');
    expect(resolveLocale('plain', 'en')).toBe('plain');
    expect(resolveLocale(undefined, 'en')).toBe('');
  });
  it('registries expose the 7 in-scope layouts', () => {
    expect(LAYOUTS).toEqual(['fulltext','fullimage','2x2','1top-1bot','1top-2bot','2top-1bot','3card']);
    expect(LAYOUT_SLOTS['2x2']).toBe(4);
    expect(LAYOUT_SLOTS['fulltext']).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- card-render`
Expected: FAIL — cannot resolve `card-render`.

- [ ] **Step 3: Implement the helpers + registries**

Create `src/lib/modules/flashcards/lib/card-render.ts` (start of file; more appended in Tasks 2-3):
```ts
import { marked } from 'marked';
import type { Card, Settings, CardSection, CardImage, FontSpec, LocalizedText } from '../model';

export const PAPER_MM: Record<string, { w: number; h: number }> = {
  A4: { w: 210, h: 297 }, A5: { w: 148, h: 210 }, A6: { w: 105, h: 148 }, Letter: { w: 216, h: 279 },
};

export const LAYOUTS = ['fulltext', 'fullimage', '2x2', '1top-1bot', '1top-2bot', '2top-1bot', '3card'] as const;

export const LAYOUT_SLOTS: Record<string, number> = {
  fulltext: 0, fullimage: 1, '2x2': 4, '1top-1bot': 2, '1top-2bot': 3, '2top-1bot': 3, '3card': 3,
};

export const LAYOUT_SPLIT_DEFAULTS: Record<string, { row: number; col: number; inner: number }> = {
  fulltext: { row: 0, col: 50, inner: 50 }, fullimage: { row: 100, col: 100, inner: 50 },
  '2x2': { row: 50, col: 50, inner: 50 }, '1top-1bot': { row: 50, col: 50, inner: 50 },
  '1top-2bot': { row: 50, col: 50, inner: 50 }, '2top-1bot': { row: 50, col: 50, inner: 50 },
  '3card': { row: 50, col: 33, inner: 33 },
};

export function getPaperPx(paperSize: string, orientation: string): { w: number; h: number } {
  let { w, h } = PAPER_MM[paperSize] || PAPER_MM.A4;
  if (orientation === 'landscape') [w, h] = [h, w];
  return { w: Math.round((w / 25.4) * 96), h: Math.round((h / 25.4) * 96) };
}

export function mmToPx(mm: number): number { return Math.round((mm / 25.4) * 96); }

export function esc(str: unknown): string {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function resolveLocale(val: LocalizedText | undefined | null, locale: string): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'object') return val[locale] ?? '';
  return val;
}

export function mdInline(text: string): string { return marked.parseInline(text || '', { async: false }) as string; }
export function mdBlock(text: string): string {
  if (!text) return '';
  if (text.trimStart().startsWith('<')) return text;
  return marked.parse(text, { async: false, breaks: false }) as string;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- card-render`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/modules/flashcards/lib/card-render.ts tests/card-render.test.ts
git commit -m "feat(flashcards): card-render helpers + layout registries"
```

---

## Task 2: card-render.ts — buildCardHTML (grid + fulltext + fullimage)

**Files:**
- Modify: `src/lib/modules/flashcards/lib/card-render.ts`
- Test: `tests/card-render.test.ts` (add a describe block)

**Interfaces:**
- Produces: `buildCardHTML(card: Card, settings: Settings, locale: string, forPrint?: boolean, overridePx?: {w:number;h:number} | null): string`.

**Port instructions:** Transcribe from `d:\github\flashcard-creator\src\js\render.js` the following, applying the transforms below. Read that file for the exact bodies. Port ONLY what the 7 layouts need; do NOT port `buildHandles`, the heavy compound builders, or `buildCaptureHTML`.

Functions to port for THIS task (grid/fulltext/fullimage path):
- `getGridTemplateStyle` + its `GRID_STRATEGIES` — keep only keys used by the in-scope grid layouts: `2x2`, `1top-1bot`, `2top-1bot`, `1top-2bot`. (Drop `1big-2small`, `1left-2right`, `1left-3right`, `1top-3bot`, `2img-2txt`.)
- `resolveImgStyle`, `buildSlots` (drop `buildAttrHtml`/attribution — pass `''`).
- `buildSectionsHtml`, `buildSectionContentStyle`, `buildFontOverride`, `TEXT_VALIGN_MAP`, `_scopeCardCss`.
- `buildCardHTML` itself — the top (size/style setup), the per-card `<style>` tag, and the `fulltext`, `fullimage`, and final default-grid `return`. Where it calls `buildCompound(card, compoundCtx)`, leave a call to `buildCompound` (implemented in Task 3) but in THIS task define a temporary `buildCompound` that `return null` (Task 3 replaces it).

**Transforms (apply to every ported function):**
1. Replace the global `state.activeLocale` and `getLocaleValue(x, state.activeLocale)` with the `locale` parameter and `resolveLocale(x, locale)`. Thread `locale` through helper signatures as needed.
2. Replace `mdParseInline` → `mdInline`, `renderSectionContent`/`mdParse` → `mdBlock`, `getPaperPx`/`mmToPx`/`esc` → the local versions (Task 1).
3. Types: annotate params (`card: Card`, `settings: Settings`, etc.); use `Record<string,...>` for style maps. `card.images.find((im) => im.slot === i)` etc. stay.
4. **Color replacement:** any placeholder/empty background hex the engine emits inline stays as-is (e.g. `#e5e7eb`); do not introduce Calm Paper tokens into card markup.
5. Keep the emitted class names (`fc-card`, `fc-image-area`, `fc-image-slot`, `fc-image-slot-<i>`, `fc-text-area`, `fc-title`, `fc-sections`, `fc-section`, `fc-section__label`, `fc-section__content`, `fc-layout-<layout>`, `data-layout`, `data-id`) EXACTLY — `card-render.css` (Task 7) targets them.

- [ ] **Step 1: Write the failing test**

Append to `tests/card-render.test.ts`:
```ts
import { buildCardHTML } from '../src/lib/modules/flashcards/lib/card-render';
import { DEFAULT_SETTINGS, type Card } from '../src/lib/modules/flashcards/model';

function card(partial: Partial<Card>): Card {
  return { id: 'c1', layout: '1top-1bot', imageHeightPercent: 50, images: [], title: '', sections: [], ...partial };
}

describe('buildCardHTML grid/fulltext/fullimage', () => {
  it('renders a fulltext card with title + section content (markdown)', () => {
    const html = buildCardHTML(card({
      layout: 'fulltext', title: 'Owl',
      sections: [{ id: 's1', label: 'Def', content: 'a **bird**' }],
    }), DEFAULT_SETTINGS, 'en');
    expect(html).toContain('data-layout="fulltext"');
    expect(html).toContain('data-id="c1"');
    expect(html).toContain('Owl');
    expect(html).toContain('<strong>bird</strong>');
    expect(html).toContain('fc-sections');
  });
  it('renders a 1top-1bot card with 2 image slots and image url', () => {
    const html = buildCardHTML(card({
      layout: '1top-1bot',
      images: [{ slot: 0, url: 'http://x/a.png' }],
      sections: [{ id: 's1', label: '', content: 'hi' }],
    }), DEFAULT_SETTINGS, 'en');
    expect(html).toContain('fc-layout-1top-1bot');
    expect(html).toContain('fc-image-slot-0');
    expect(html).toContain('http://x/a.png');
  });
  it('resolves the requested locale for title/sections', () => {
    const html = buildCardHTML(card({
      layout: 'fulltext',
      title: { en: 'Owl', vi: 'Cú' },
      sections: [{ id: 's1', label: { en: 'Def', vi: 'Nghĩa' }, content: { en: 'bird', vi: 'chim' } }],
    }), DEFAULT_SETTINGS, 'vi');
    expect(html).toContain('Cú');
    expect(html).toContain('chim');
    expect(html).not.toContain('Owl');
  });
  it('sizes the card from the paper size (A6 smaller than A5)', () => {
    const a5 = buildCardHTML(card({}), { ...DEFAULT_SETTINGS, paperSize: 'A5' }, 'en');
    const a6 = buildCardHTML(card({}), { ...DEFAULT_SETTINGS, paperSize: 'A6' }, 'en');
    const w = (s: string) => Number(/width:(\d+)px/.exec(s)![1]);
    expect(w(a5)).toBeGreaterThan(w(a6));
  });
  it('forPrint renders empty image slots without the placeholder glyph', () => {
    const html = buildCardHTML(card({ layout: '2x2' }), DEFAULT_SETTINGS, 'en', true);
    expect(html).not.toContain('📷');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- card-render`
Expected: FAIL — `buildCardHTML` is not exported.

- [ ] **Step 3: Implement (port) the grid/fulltext/fullimage path**

Append the ported functions + `buildCardHTML` to `src/lib/modules/flashcards/lib/card-render.ts`, following the Port instructions + Transforms above. Include a temporary `function buildCompound(_card: Card, _ctx: unknown): string | null { return null; }` to be replaced in Task 3. `buildCardHTML` must:
- compute `w/h` from `overridePx || getPaperPx(settings.paperSize, card.orientation || settings.orientation)`, margins/padding via `mmToPx`;
- build the per-card `<style>` tag (h1/h2/h3 + label/content size + img-label font rules, scoped by `.fc-card[data-id="<id>"]`) exactly as the source does, using `buildFontOverride` on `{...settings.titleFont, ...card.titleFont}` / `{...settings.contentFont, ...card.contentFont}`;
- return the `fulltext` branch, the `fullimage` branch, and the default grid `return` (image-area with `getGridTemplateStyle` inline + `buildSlots`, then text-area with title + `buildSectionsHtml`); call `buildCompound` first and return it when non-null.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- card-render`
Expected: PASS (11 tests total). `npm run check` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/modules/flashcards/lib/card-render.ts tests/card-render.test.ts
git commit -m "feat(flashcards): buildCardHTML grid + fulltext + fullimage layouts"
```

---

## Task 3: card-render.ts — 3card compound layout

**Files:**
- Modify: `src/lib/modules/flashcards/lib/card-render.ts`
- Test: `tests/card-render.test.ts` (add cases)

**Interfaces:**
- Consumes: everything from Tasks 1-2.
- Produces: real `buildCompound(card, ctx)` that handles `3card` (returns `null` for any other layout); `build_3card` + the compound helpers it needs.

**Port instructions:** From `render.js`, port `build_3card`, `buildCompoundCellStyle`, `buildSectionCellHtml`, `titleBlock`, `renderCompoundShell`, and a `buildCompound` switch that maps ONLY `'3card' → build_3card` (default `return null`). Apply the same Transforms as Task 2 (locale param, md helpers, types). `build_3card` reads `ctx.s.threeCardFit`, `ctx.imgStyle`, borders, etc. — construct the `compoundCtx` object inside `buildCardHTML` (as the source does) and pass it. Replace the temporary `buildCompound` stub from Task 2 with this real one.

- [ ] **Step 1: Write the failing test**

Append to `tests/card-render.test.ts`:
```ts
describe('buildCardHTML 3card', () => {
  it('renders a 3-column card with per-column titles, content, and images', () => {
    const html = buildCardHTML(card({
      layout: '3card',
      images: [{ slot: 0, url: 'http://x/0.png' }, { slot: 1, url: 'http://x/1.png' }],
      sections: [
        { id: 's0', label: 'One', content: 'first' },
        { id: 's1', label: 'Two', content: 'second' },
        { id: 's2', label: 'Three', content: 'third' },
      ],
    }), DEFAULT_SETTINGS, 'en');
    expect(html).toContain('data-layout="3card"');
    expect(html).toContain('fc-image-slot-0');
    expect(html).toContain('fc-image-slot-2');
    expect(html).toContain('http://x/0.png');
    expect(html).toContain('first');
    expect(html).toContain('third');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- card-render`
Expected: FAIL — `3card` currently falls through (stub `buildCompound` returns null → no `data-layout="3card"` cells, or content missing).

- [ ] **Step 3: Implement 3card**

Replace the stub `buildCompound` and add `build_3card` + helpers per the Port instructions.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- card-render`
Expected: PASS (12 tests total). `npm run check` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/modules/flashcards/lib/card-render.ts tests/card-render.test.ts
git commit -m "feat(flashcards): 3card compound layout render"
```

---

## Task 4: cardMapping.ts — auto-template + record→card + settings/template ops

**Files:**
- Create: `src/lib/modules/flashcards/cardMapping.ts`
- Test: `tests/cardMapping.test.ts`

**Interfaces:**
- Consumes: `resolveLocale`, `LAYOUT_SLOTS` from `./lib/card-render`; model types + `uid`.
- Produces:
  - `deriveAutoTemplate(schema: Schema): CardTemplate`
  - `recordToCard(record: RecordItem, schema: Schema, template: CardTemplate, settings: Settings, locale: string): Card`
  - `applySettings(p: Project, patch: Partial<Settings>): Project`
  - `applyTemplatePatch(p: Project, schemaId: string, patch: Partial<CardTemplate>): Project`

- [ ] **Step 1: Write the failing test**

Create `tests/cardMapping.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { newProject, DEFAULT_SETTINGS, type Schema, type RecordItem } from '../src/lib/modules/flashcards/model';
import { deriveAutoTemplate, recordToCard, applySettings, applyTemplatePatch } from '../src/lib/modules/flashcards/cardMapping';

function schema(): Schema {
  return { id: 's1', name: 'Words', cardTemplates: [], fields: [
    { id: 'f1', key: 'title', label: 'Title', type: 'text', multilingual: true },
    { id: 'f2', key: 'def', label: 'Definition', type: 'text-long', multilingual: true },
    { id: 'f3', key: 'pic', label: 'Pic', type: 'image' },
  ] };
}

describe('deriveAutoTemplate', () => {
  it('picks an image layout when the schema has an image field', () => {
    const t = deriveAutoTemplate(schema());
    expect(t.layout).toBe('1top-1bot');
    expect(t.templateType).toBe('single');
  });
  it('picks fulltext when there is no image field', () => {
    const s = schema(); s.fields = s.fields.filter(f => f.type !== 'image');
    expect(deriveAutoTemplate(s).layout).toBe('fulltext');
  });
});

describe('recordToCard', () => {
  const rec: RecordItem = { id: 'r1', schemaId: 's1', fieldsHash: '', fields: {
    title: { en: 'Owl', vi: 'Cú' }, def: { en: 'a bird', vi: 'con chim' }, pic: 'http://x/o.png',
  } };
  it('maps first text field to title, rest to sections, image field to a slot', () => {
    const t = deriveAutoTemplate(schema());
    const c = recordToCard(rec, schema(), t, DEFAULT_SETTINGS, 'en');
    expect(c.title).toBe('Owl');
    expect(c.sections).toHaveLength(1);
    expect(c.sections[0].label).toBe('Definition');
    expect(c.sections[0].content).toBe('a bird');
    expect(c.images[0]).toMatchObject({ slot: 0, url: 'http://x/o.png' });
    expect(c.layout).toBe('1top-1bot');
  });
  it('resolves the requested locale', () => {
    const c = recordToCard(rec, schema(), deriveAutoTemplate(schema()), DEFAULT_SETTINGS, 'vi');
    expect(c.title).toBe('Cú');
    expect(c.sections[0].content).toBe('con chim');
  });
  it('tolerates a record with missing fields (no image, empty section)', () => {
    const bare: RecordItem = { id: 'r2', schemaId: 's1', fieldsHash: '', fields: {} };
    const c = recordToCard(bare, schema(), deriveAutoTemplate(schema()), DEFAULT_SETTINGS, 'en');
    expect(c.images).toHaveLength(0);
    expect(c.title).toBe('');
    expect(c.sections[0].content).toBe('');
  });
});

describe('applySettings / applyTemplatePatch', () => {
  it('applySettings deep-merges border + fonts without mutating input', () => {
    const p = newProject();
    const p2 = applySettings(p, { border: { width: 8 } as any, paperSize: 'A4' });
    expect(p2.settings.border.width).toBe(8);
    expect(p2.settings.border.color).toBe(p.settings.border.color); // preserved
    expect(p2.settings.paperSize).toBe('A4');
    expect(p.settings.border.width).not.toBe(8); // unmutated
  });
  it('applyTemplatePatch creates the schema template then patches it', () => {
    const p = newProject(); p.schemas.push(schema());
    const p2 = applyTemplatePatch(p, 's1', { layout: '2x2' });
    expect(p2.schemas[0].cardTemplates[0].layout).toBe('2x2');
    const p3 = applyTemplatePatch(p2, 's1', { orientation: 'landscape' });
    expect(p3.schemas[0].cardTemplates[0].layout).toBe('2x2'); // preserved
    expect(p3.schemas[0].cardTemplates[0].orientation).toBe('landscape');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- cardMapping`
Expected: FAIL — cannot resolve `cardMapping`.

- [ ] **Step 3: Implement `cardMapping.ts`**

Create `src/lib/modules/flashcards/cardMapping.ts`:
```ts
import { uid, type Project, type Schema, type CardTemplate, type RecordItem, type Card, type CardSection, type CardImage, type Settings } from './model';
import { resolveLocale, LAYOUT_SLOTS } from './lib/card-render';

const DEFAULT_IMAGE_HEIGHT = 50;

export function deriveAutoTemplate(schema: Schema): CardTemplate {
  const hasImage = schema.fields.some((f) => f.type === 'image');
  const layout = hasImage ? '1top-1bot' : 'fulltext';
  return {
    id: uid('tpl'),
    templateType: layout === '3card' ? 'compound' : 'single',
    layout,
    size: null,
    orientation: 'portrait',
    hideTitle: false,
    hideSectionLabels: false,
    mapping: {},
  };
}

export function recordToCard(
  record: RecordItem, schema: Schema, template: CardTemplate, settings: Settings, locale: string,
): Card {
  const textFields = schema.fields.filter((f) => f.type !== 'image');
  const imageFields = schema.fields.filter((f) => f.type === 'image');
  const titleField = textFields[0] ?? null;
  const sectionFields = titleField ? textFields.slice(1) : textFields;
  const slotCount = LAYOUT_SLOTS[template.layout] ?? 0;

  const images: CardImage[] = [];
  for (let i = 0; i < Math.min(slotCount, imageFields.length); i++) {
    const url = resolveLocale(record.fields[imageFields[i].key], locale);
    if (url) images.push({ slot: i, url });
  }
  const sections: CardSection[] = sectionFields.map((f) => ({
    id: uid('sec'),
    label: f.label,
    content: resolveLocale(record.fields[f.key], locale),
  }));

  return {
    id: 'preview_' + record.id,
    layout: template.layout,
    imageHeightPercent: DEFAULT_IMAGE_HEIGHT,
    images,
    title: titleField ? resolveLocale(record.fields[titleField.key], locale) : '',
    sections,
    orientation: template.orientation ?? settings.orientation,
    hideTitle: template.hideTitle,
    hideSectionLabels: template.hideSectionLabels,
    recordId: record.id,
    templateId: template.id,
  };
}

export function applySettings(p: Project, patch: Partial<Settings>): Project {
  const s = p.settings;
  return { ...p, settings: {
    ...s, ...patch,
    border: { ...s.border, ...(patch.border ?? {}) },
    image: { ...s.image, ...(patch.image ?? {}) },
    titleFont: { ...s.titleFont, ...(patch.titleFont ?? {}) },
    contentFont: { ...s.contentFont, ...(patch.contentFont ?? {}) },
  } };
}

export function applyTemplatePatch(p: Project, schemaId: string, patch: Partial<CardTemplate>): Project {
  return { ...p, schemas: p.schemas.map((s) => {
    if (s.id !== schemaId) return s;
    const existing = s.cardTemplates[0] ?? deriveAutoTemplate(s);
    return { ...s, cardTemplates: [{ ...existing, ...patch }, ...s.cardTemplates.slice(1)] };
  }) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- cardMapping`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/modules/flashcards/cardMapping.ts tests/cardMapping.test.ts
git commit -m "feat(flashcards): card mapping (auto-template, record->card, settings/template ops)"
```

---

## Task 5: stores — setSettings + setTemplateLayout

**Files:**
- Modify: `src/lib/modules/flashcards/stores.ts`
- Test: `tests/flashcards-cardstores.test.ts`

**Interfaces:**
- Consumes: `applySettings`, `applyTemplatePatch` from `./cardMapping`; existing `project`, `commit`, `get`.
- Produces: `setSettings(patch: Partial<Settings>): void`, `setTemplateLayout(schemaId: string, patch: Partial<CardTemplate>): void`.

- [ ] **Step 1: Write the failing test**

Create `tests/flashcards-cardstores.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import * as S from '../src/lib/modules/flashcards/stores';

beforeEach(() => { S.initProject(); });

describe('card stores', () => {
  it('setSettings commits a deep-merged, undoable settings change', () => {
    S.setSettings({ paperSize: 'A4' });
    expect(get(S.project).settings.paperSize).toBe('A4');
    expect(get(S.dirty)).toBe(true);
    S.undo();
    expect(get(S.project).settings.paperSize).not.toBe('A4');
  });
  it('setTemplateLayout creates and patches the schema template', () => {
    const sid = S.addSchema('Words');
    S.setTemplateLayout(sid, { layout: '2x2' });
    expect(get(S.project).schemas[0].cardTemplates[0].layout).toBe('2x2');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- flashcards-cardstores`
Expected: FAIL — `S.setSettings` not a function.

- [ ] **Step 3: Extend `stores.ts`**

Add to the imports in `src/lib/modules/flashcards/stores.ts`:
```ts
import * as cardOps from './cardMapping';
import type { Settings, CardTemplate } from './model';
```
(Merge the type import into the existing `./model` type import line if one exists, to avoid a duplicate-import lint warning.)
Add the wrappers (near the other action wrappers):
```ts
export function setSettings(patch: Partial<Settings>): void {
  commit(cardOps.applySettings(get(project), patch));
}
export function setTemplateLayout(schemaId: string, patch: Partial<CardTemplate>): void {
  commit(cardOps.applyTemplatePatch(get(project), schemaId, patch));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- flashcards-cardstores`
Expected: PASS (2 tests). Run `npm run check` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/modules/flashcards/stores.ts tests/flashcards-cardstores.test.ts
git commit -m "feat(flashcards): setSettings + setTemplateLayout store wrappers"
```

---

## Task 6: StyleControls component

**Files:**
- Create: `src/lib/modules/flashcards/components/StyleControls.svelte`
- Test: `tests/StyleControls.test.ts`

**Interfaces:**
- Consumes: stores `project`, `setSettings`.
- Produces: `<StyleControls />` (self-contained; reads/writes settings). Uses `onchange` (fires on commit/blur) → one undoable commit per edit (no debounce needed).

- [ ] **Step 1: Write the failing test**

Create `tests/StyleControls.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { render, fireEvent, screen } from '@testing-library/svelte';
import StyleControls from '../src/lib/modules/flashcards/components/StyleControls.svelte';
import * as S from '../src/lib/modules/flashcards/stores';

beforeEach(() => { S.initProject(); });

describe('StyleControls', () => {
  it('editing border width commits to settings', async () => {
    render(StyleControls);
    const input = screen.getByLabelText(/border width/i);
    await fireEvent.change(input, { target: { value: '6' } });
    expect(get(S.project).settings.border.width).toBe(6);
  });
  it('editing title font size commits to settings', async () => {
    render(StyleControls);
    const input = screen.getByLabelText(/title font size/i);
    await fireEvent.change(input, { target: { value: '20' } });
    expect(get(S.project).settings.titleFont.size).toBe(20);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- StyleControls`
Expected: FAIL — cannot resolve the component.

- [ ] **Step 3: Implement `StyleControls.svelte`**

Create `src/lib/modules/flashcards/components/StyleControls.svelte`:
```svelte
<script lang="ts">
  import { project, setSettings } from '../stores';

  const s = $derived($project.settings);
  const num = (e: Event) => Number((e.target as HTMLInputElement).value);
  const str = (e: Event) => (e.target as HTMLInputElement | HTMLSelectElement).value;
</script>

<div class="style-controls">
  <fieldset>
    <legend>Border</legend>
    <label>Border width <input type="number" min="0" value={s.border.width}
      onchange={(e) => setSettings({ border: { ...s.border, width: num(e) } })} /></label>
    <label>Style
      <select value={s.border.style} onchange={(e) => setSettings({ border: { ...s.border, style: str(e) } })}>
        {#each ['solid','dashed','dotted','double','none'] as st (st)}<option value={st}>{st}</option>{/each}
      </select>
    </label>
    <label>Color <input type="color" value={s.border.color}
      onchange={(e) => setSettings({ border: { ...s.border, color: str(e) } })} /></label>
    <label>Radius <input type="number" min="0" value={s.border.radius}
      onchange={(e) => setSettings({ border: { ...s.border, radius: num(e) } })} /></label>
  </fieldset>

  <fieldset>
    <legend>Title font</legend>
    <label>Title font size <input type="number" min="1" value={s.titleFont.size}
      onchange={(e) => setSettings({ titleFont: { ...s.titleFont, size: num(e) } })} /></label>
    <label>Color <input type="color" value={s.titleFont.color}
      onchange={(e) => setSettings({ titleFont: { ...s.titleFont, color: str(e) } })} /></label>
  </fieldset>

  <fieldset>
    <legend>Content font</legend>
    <label>Content font size <input type="number" min="1" value={s.contentFont.size}
      onchange={(e) => setSettings({ contentFont: { ...s.contentFont, size: num(e) } })} /></label>
    <label>Color <input type="color" value={s.contentFont.color}
      onchange={(e) => setSettings({ contentFont: { ...s.contentFont, color: str(e) } })} /></label>
  </fieldset>
</div>

<style>
  .style-controls { display:flex; flex-direction:column; gap:10px; padding:10px 12px;
    background:var(--surface); border-bottom:1px solid var(--border); }
  fieldset { border:1px solid var(--border); border-radius:8px; padding:8px 10px; display:flex; flex-wrap:wrap; gap:8px; }
  legend { font-size:11px; font-weight:600; color:var(--text-muted); padding:0 4px; }
  label { display:inline-flex; align-items:center; gap:5px; font-size:12px; color:var(--text); }
  input[type=number] { width:56px; }
  input, select { border:1px solid var(--border); border-radius:6px; padding:3px 6px;
    background:var(--bg); color:var(--text); font:inherit; font-size:12px; }
  input[type=color] { padding:0; width:34px; height:24px; }
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- StyleControls`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/modules/flashcards/components/StyleControls.svelte tests/StyleControls.test.ts
git commit -m "feat(flashcards): StyleControls (border + fonts)"
```

---

## Task 7: CardPreview component + card-render.css

**Files:**
- Create: `src/lib/modules/flashcards/components/CardPreview.svelte`
- Create: `src/lib/modules/flashcards/lib/card-render.css`
- Test: `tests/CardPreview.test.ts`

**Interfaces:**
- Consumes: `buildCardHTML`, `LAYOUTS`, `getPaperPx` from `../lib/card-render`; `deriveAutoTemplate`, `recordToCard` from `../cardMapping`; stores `project`, `selectedRecordId`, `setSettings`, `setTemplateLayout`; `StyleControls` (Task 6).
- Produces: `<CardPreview />`.

- [ ] **Step 1: Create `card-render.css`**

Create `src/lib/modules/flashcards/lib/card-render.css` (ported `.fc-*` subset for the 7 layouts; `--c-*` vars replaced with fixed print colors):
```css
/* Card render styles (global). Card interior = fixed white-paper colors, NOT app theme tokens. */
.fc-card { background:#fff; color:#1a1a1a; display:flex; flex-direction:column; overflow:hidden; position:relative; }
.fc-image-area { flex-shrink:0; overflow:hidden; }
.fc-text-area { flex:1; overflow:hidden; display:flex; flex-direction:column; }
.fc-title { text-align:center; padding:6px 8px 4px; font-size:0.85em; border-bottom:1px solid #e5e7eb; }
.fc-layout-3card .fc-title { border-bottom:none; }
.fc-sections { flex:1; overflow:hidden; padding:4px 8px 6px; }
.fc-section { margin-bottom:4px; }
.fc-section__label { font-weight:700; }
.fc-section__content { display:block; }
.fc-section__content > p { display:block; margin:0 0 2px; }
.fc-section__content ul, .fc-section__content ol { display:block; padding-left:14px; margin:1px 0 0; }
.fc-section__content ul { list-style:disc; }
.fc-section__content ol { list-style:decimal; }
.fc-section__content ul ul { list-style:circle; }
.fc-section__content li { margin-bottom:1px; }
.fc-image-slot { background:#e5e7eb; overflow:hidden; position:relative; display:flex; align-items:center; justify-content:center; }
.fc-image-slot .empty-placeholder { color:#9ca3af; font-size:11px; text-align:center; pointer-events:none; }
.fc-image-slot > div.img-bg { position:absolute; inset:0; }
.fc-img-label { padding:2px 5px; font-size:0.78em; text-align:center; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

/* Grid overrides for the in-scope layouts */
.fc-layout-2top-1bot .fc-image-area { display:grid; grid-template-rows:1fr 1fr; grid-template-columns:1fr 1fr; gap:2px; }
.fc-layout-2top-1bot .fc-image-slot-0 { grid-column:1; grid-row:1; }
.fc-layout-2top-1bot .fc-image-slot-1 { grid-column:2; grid-row:1; }
.fc-layout-2top-1bot .fc-image-slot-2 { grid-column:1 / -1; grid-row:2; }
.fc-layout-1top-1bot .fc-image-area { display:grid; grid-template-rows:1fr 1fr; grid-template-columns:1fr; gap:2px; }
.fc-layout-1top-1bot .fc-image-slot-0 { grid-column:1; grid-row:1; }
.fc-layout-1top-1bot .fc-image-slot-1 { grid-column:1; grid-row:2; }
.fc-layout-1top-2bot .fc-image-area { display:grid; grid-template-rows:1fr 1fr; grid-template-columns:1fr 1fr; gap:2px; }
.fc-layout-1top-2bot .fc-image-slot-0 { grid-column:1 / -1; grid-row:1; }
.fc-layout-1top-2bot .fc-image-slot-1 { grid-column:1; grid-row:2; }
.fc-layout-1top-2bot .fc-image-slot-2 { grid-column:2; grid-row:2; }
.fc-layout-2x2 .fc-image-area { display:grid; grid-template-columns:1fr 1fr; grid-template-rows:1fr 1fr; gap:2px; }
.fc-layout-fullimage .fc-image-slot { width:100%; height:100%; }
```

- [ ] **Step 2: Write the failing test**

Create `tests/CardPreview.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import CardPreview from '../src/lib/modules/flashcards/components/CardPreview.svelte';
import * as S from '../src/lib/modules/flashcards/stores';
import { get } from 'svelte/store';

beforeEach(() => {
  S.initProject();
  const sid = S.addSchema('Words');
  S.updateSchema(sid, { fields: [{ id: 'f1', key: 'title', label: 'Title', type: 'text', multilingual: true }] });
  S.addRecord(sid);
  S.setField(get(S.project).records[0].id, 'title', 'Owl', 'en');
});

describe('CardPreview', () => {
  it('renders a card for the selected record', () => {
    const { container } = render(CardPreview);
    expect(container.querySelector('.fc-card')).toBeInTheDocument();
    expect(container.textContent).toContain('Owl');
  });
  it('shows an empty state when no record is selected', () => {
    S.selectRecord(null);
    render(CardPreview);
    expect(screen.getByText(/no record selected/i)).toBeInTheDocument();
  });
  it('offers the in-scope layouts in the layout selector', () => {
    render(CardPreview);
    const sel = screen.getByLabelText(/layout/i) as HTMLSelectElement;
    expect(sel.querySelectorAll('option').length).toBe(7);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- CardPreview`
Expected: FAIL — cannot resolve the component.

- [ ] **Step 4: Implement `CardPreview.svelte`**

Create `src/lib/modules/flashcards/components/CardPreview.svelte`:
```svelte
<script lang="ts">
  import '../lib/card-render.css';
  import Palette from 'lucide-svelte/icons/palette';
  import { project, selectedRecordId, setSettings, setTemplateLayout } from '../stores';
  import { deriveAutoTemplate, recordToCard } from '../cardMapping';
  import { buildCardHTML, LAYOUTS, getPaperPx } from '../lib/card-render';
  import StyleControls from './StyleControls.svelte';

  let paneW = $state(360);
  let showStyle = $state(false);

  const record = $derived($project.records.find((r) => r.id === $selectedRecordId) ?? null);
  const schema = $derived(record ? ($project.schemas.find((s) => s.id === record.schemaId) ?? null) : null);
  const template = $derived(schema ? (schema.cardTemplates[0] ?? deriveAutoTemplate(schema)) : null);

  const paper = $derived(getPaperPx(
    template?.size || $project.settings.paperSize,
    template?.orientation || $project.settings.orientation,
  ));
  const scale = $derived(Math.max(0.05, Math.min(1, (paneW - 32) / paper.w)));
  const cardHtml = $derived(
    record && schema && template
      ? buildCardHTML(recordToCard(record, schema, template, $project.settings, $project.activeLocale),
                      $project.settings, $project.activeLocale)
      : '',
  );

  function onLayout(e: Event) {
    if (schema) setTemplateLayout(schema.id, { layout: (e.target as HTMLSelectElement).value });
  }
</script>

<div class="preview" bind:clientWidth={paneW}>
  <header class="preview-toolbar">
    <label>Layout
      <select value={template?.layout ?? 'fulltext'} onchange={onLayout} disabled={!schema}>
        {#each LAYOUTS as l (l)}<option value={l}>{l}</option>{/each}
      </select>
    </label>
    <label>Paper
      <select value={$project.settings.paperSize} onchange={(e) => setSettings({ paperSize: (e.target as HTMLSelectElement).value as any })}>
        {#each ['A4','A5','A6','Letter'] as p (p)}<option value={p}>{p}</option>{/each}
      </select>
    </label>
    <button type="button" class:on={$project.settings.orientation === 'landscape'}
      onclick={() => setSettings({ orientation: $project.settings.orientation === 'portrait' ? 'landscape' : 'portrait' })}>
      {$project.settings.orientation === 'landscape' ? 'Landscape' : 'Portrait'}
    </button>
    <button type="button" class="style-toggle" class:on={showStyle} aria-label="style" onclick={() => (showStyle = !showStyle)}>
      <Palette size={15} />
    </button>
  </header>

  {#if showStyle}<StyleControls />{/if}

  {#if record && schema}
    <div class="preview-scroll">
      <div class="preview-scaler" style={`transform:scale(${scale});width:${paper.w}px;height:${paper.h}px;`}>
        {@html cardHtml}
      </div>
    </div>
  {:else}
    <div class="empty"><p>No record selected. Pick one to preview its card.</p></div>
  {/if}
</div>

<style>
  .preview { height:100%; min-width:0; display:flex; flex-direction:column; background:var(--bg); }
  .preview-toolbar { display:flex; align-items:center; gap:10px; flex-wrap:wrap; padding:8px 12px;
    background:var(--surface); border-bottom:1px solid var(--border); }
  .preview-toolbar label { display:inline-flex; align-items:center; gap:5px; font-size:12px; color:var(--text-muted); }
  .preview-toolbar select, .preview-toolbar button { border:1px solid var(--border); border-radius:6px;
    padding:3px 8px; background:var(--bg); color:var(--text); font:inherit; font-size:12px; }
  .preview-toolbar button.on { background:var(--accent); color:#fff; border-color:var(--accent); }
  .style-toggle { margin-left:auto; display:inline-flex; align-items:center; }
  .preview-scroll { flex:1; overflow:auto; padding:16px; }
  .preview-scaler { transform-origin:top left; box-shadow:0 4px 16px rgba(0,0,0,.12); }
  .empty { flex:1; display:flex; align-items:center; justify-content:center; padding:24px; text-align:center;
    color:var(--text-muted); font-size:13px; }
</style>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- CardPreview`
Expected: PASS (3 tests). `npm run check` → 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/modules/flashcards/components/CardPreview.svelte src/lib/modules/flashcards/lib/card-render.css tests/CardPreview.test.ts
git commit -m "feat(flashcards): CardPreview pane + card-render.css"
```

---

## Task 8: Wire the third pane into Workspace + gates

**Files:**
- Modify: `src/lib/modules/flashcards/Workspace.svelte`
- Test: `tests/flashcards-workspace.test.ts` (extend)

**Interfaces:**
- Consumes: `CardPreview` (Task 7); existing `SchemaRecordList`, `RecordDetail`, `SchemaEditorModal`, `dragX`.

- [ ] **Step 1: Write the failing test**

Add to `tests/flashcards-workspace.test.ts` (inside the existing `describe`):
```ts
  it('renders the card preview pane alongside list and detail', () => {
    const { container } = render(Workspace);
    // record auto-selected in beforeEach → a card renders
    expect(container.querySelector('.fc-card')).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- flashcards-workspace`
Expected: FAIL — no `.fc-card` (preview pane not wired yet).

- [ ] **Step 3: Add the third pane to `Workspace.svelte`**

Modify `src/lib/modules/flashcards/Workspace.svelte`:
- import `CardPreview`: `import CardPreview from './components/CardPreview.svelte';`
- add a second width state: `let rightWidth = $state(360);`
- change the grid to five tracks: `` `grid-template-columns:${leftWidth}px 6px 1fr 6px ${rightWidth}px` ``
- add a second `divider` (aria-label "resize preview") using `use:dragX={(dx) => (rightWidth = Math.max(240, Math.min(720, rightWidth - dx)))}` (note: subtract dx because dragging left grows the right pane) and a `<div class="preview-pane"><CardPreview /></div>` after it.

Resulting body:
```svelte
  <div class="body" style={`grid-template-columns:${leftWidth}px 6px 1fr 6px ${rightWidth}px`}>
    <div class="left"><SchemaRecordList /></div>
    <div class="divider divider-x" role="separator" aria-orientation="vertical" aria-label="resize sidebar"
      use:dragX={(dx) => (leftWidth = Math.max(220, Math.min(560, leftWidth + dx)))}></div>
    <div class="right"><RecordDetail /></div>
    <div class="divider divider-x" role="separator" aria-orientation="vertical" aria-label="resize preview"
      use:dragX={(dx) => (rightWidth = Math.max(240, Math.min(720, rightWidth - dx)))}></div>
    <div class="preview-pane"><CardPreview /></div>
  </div>
```
Add `.preview-pane { min-height:0; min-width:0; }` to the `<style>`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- flashcards-workspace`
Expected: PASS (all workspace tests, including the new one).

- [ ] **Step 5: Run all gates**

Run: `npm test` → all suites green, 0 unhandled (if transient Windows EBUSY vitest-cache noise appears, re-run once for a clean count).
Run: `npm run check` → 0 errors (pre-existing `TreeNode` warning may remain).
Run: `npm run build` → OK.

- [ ] **Step 6: Manual verification (`npm run tauri dev`)**

- New Flashcards → create schema `Words` with `title` (text), `def` (text-long), `pic` (image); add a record with values + an image URL.
- Third pane shows a live card; typing in the form updates the card.
- Change layout dropdown across all 7 (fulltext, fullimage, 2x2, 1top-1bot, 1top-2bot, 2top-1bot, 3card) — each renders without error; layout persists (survives record switch + save/reopen).
- Change paper (A4/A5/A6/Letter) + orientation → card resizes.
- Open Style panel → change border width/color + title/content font size/color → card updates; undo/redo works.
- Ctrl+S then reopen the `.tomoe.json` → template layout + settings restored.

- [ ] **Step 7: Commit**

```bash
git add src/lib/modules/flashcards/Workspace.svelte tests/flashcards-workspace.test.ts
git commit -m "feat(flashcards): wire card preview as third workspace pane"
```

---

## Self-review notes (author)

- **Spec coverage:** engine port 7 layouts (T1-T3), auto-template + record→card mapping (T4), settings/template store wrappers (T5), StyleControls border+fonts (T6), CardPreview pane with layout/paper/orientation controls + scale-to-fit `{@html}` + global css (T7), third-pane wiring (T8). All mapped.
- **Out of scope** (slot-mapping editor, multiple templates, heavy compounds, drag handles, copy/print, per-card overrides) — not implemented.
- **Type consistency:** `buildCardHTML(card, settings, locale, forPrint?, overridePx?)`, `recordToCard(record, schema, template, settings, locale)`, `deriveAutoTemplate(schema)`, `applySettings(p, patch)`, `applyTemplatePatch(p, schemaId, patch)`, `setSettings(patch)`, `setTemplateLayout(schemaId, patch)` used identically across engine, mapping, stores, and components. Class names emitted by the engine match `card-render.css` selectors.
- **Testing gap (declared):** the engine port (T2/T3) is transcribed from `render.js` with explicit transforms; its output is asserted structurally in `card-render.test.ts`. Visual fidelity of layouts is confirmed in the T8 manual pass. `{@html}` uses the user's own local data (no third-party input); per-card custom CSS is not exposed.
