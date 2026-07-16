# Flashcards Flow (document) Layout Family — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "flow" (document) layout family — collage cover + flowing text pages with floated images — that renders one record across multiple views, without touching the existing 12 grid layouts.

**Architecture:** A parallel `FLOW_LAYOUTS` registry + a dedicated `buildFlowCardHTML` renderer plug into the existing engine through a single dispatch line in `buildCardHTML`, a flow branch in `recordToCard`, and an `<optgroup>` in the layout picker. Flow presets set `cardsPerPage: 1` so the existing print/pack pipeline renders each view full-page unchanged. Auto-fit shrinks overflowing content via a measured uniform `transform: scale`.

**Tech Stack:** Svelte 5 (runes), TypeScript, Vite, vitest (+ jsdom, @testing-library/svelte), `marked`.

## Global Constraints

- Design system "Calm Paper": style with tokens (`var(--accent)`, `var(--bg)`, …), never hardcoded hex. Accent teal-600.
- `lucide-svelte` icons: subpath imports only (`lucide-svelte/icons/<name>`), never the barrel.
- `npm run check` must be 0 errors; `npm test` must be green; `npm run build` must pass.
- Do NOT modify `lib/layouts.ts` (`LAYOUTS`) or the grid branch of `buildCardHTML` — regression tests must stay green (proves the grid engine is undiluted).
- `flow-layouts.ts` must NOT import `marked` or the render engine (same rule as `layouts.ts`) so `model.ts`/`cardMapping.ts` can import it safely.
- Commit only exact changed paths. Never stage `.gitignore`, `package.json`, `src-tauri/SIGNING.md`, `src-tauri/signing/`, or `src-tauri/tauri.signing.conf.json.example`.

---

### Task 1: Flow layout registry

**Files:**
- Create: `src/lib/modules/flashcards/lib/flow-layouts.ts`
- Test: `tests/flow-layouts.test.ts`

**Interfaces:**
- Produces: `interface FlowLayoutDef { id: string; label: string; family: 'flow'; mode: 'collage'|'page'; collageColumns?: number; titleStyle?: 'filled'|'outline'; imageWidth?: string; sectionImageSide?: 'alt'|'left'|'right' }`; `FLOW_LAYOUTS: FlowLayoutDef[]`; `isFlowLayout(id: string): boolean`; `getFlowLayout(id: string): FlowLayoutDef | undefined`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/flow-layouts.test.ts
import { describe, it, expect } from 'vitest';
import { FLOW_LAYOUTS, isFlowLayout, getFlowLayout } from '../src/lib/modules/flashcards/lib/flow-layouts';

describe('flow-layouts registry', () => {
  it('ships the two initial presets', () => {
    expect(FLOW_LAYOUTS.map((l) => l.id)).toEqual(['country-cover', 'country-page']);
  });
  it('every preset is family flow with a mode', () => {
    for (const l of FLOW_LAYOUTS) {
      expect(l.family).toBe('flow');
      expect(['collage', 'page']).toContain(l.mode);
    }
  });
  it('isFlowLayout recognises flow ids and rejects grid ids', () => {
    expect(isFlowLayout('country-cover')).toBe(true);
    expect(isFlowLayout('country-page')).toBe(true);
    expect(isFlowLayout('2x2')).toBe(false);
    expect(isFlowLayout('fulltext')).toBe(false);
  });
  it('getFlowLayout returns the def or undefined', () => {
    expect(getFlowLayout('country-cover')?.mode).toBe('collage');
    expect(getFlowLayout('nope')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/flow-layouts.test.ts`
Expected: FAIL — cannot resolve `flow-layouts`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/modules/flashcards/lib/flow-layouts.ts
// Declarative registry of the "flow" (document) layouts. No `marked`/render deps —
// safe for `model.ts`/`cardMapping.ts` to import (same rule as `./layouts`).
export interface FlowLayoutDef {
  id: string; label: string; family: 'flow';
  mode: 'collage' | 'page';
  collageColumns?: number;                       // collage: image grid columns
  titleStyle?: 'filled' | 'outline';             // cover uses 'outline'
  imageWidth?: string;                           // page: floated image width, e.g. '40%'
  sectionImageSide?: 'alt' | 'left' | 'right';   // page: float side; 'alt' = alternate by index
}
export const FLOW_LAYOUTS: FlowLayoutDef[] = [
  { id: 'country-cover', label: 'Country cover (collage)', family: 'flow', mode: 'collage', collageColumns: 3, titleStyle: 'outline' },
  { id: 'country-page',  label: 'Country page',            family: 'flow', mode: 'page', imageWidth: '40%', sectionImageSide: 'alt' },
];
const _byId = new Map(FLOW_LAYOUTS.map((l) => [l.id, l]));
export function isFlowLayout(id: string): boolean { return _byId.has(id); }
export function getFlowLayout(id: string): FlowLayoutDef | undefined { return _byId.get(id); }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/flow-layouts.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/modules/flashcards/lib/flow-layouts.ts tests/flow-layouts.test.ts
git commit -m "feat(flashcards): flow layout registry + isFlowLayout"
```

---

### Task 2: Card model additive fields + recordToCard flow branch

**Files:**
- Modify: `src/lib/modules/flashcards/model.ts` (`CardSection` line 33, `Card` line 35)
- Modify: `src/lib/modules/flashcards/cardMapping.ts` (`recordToCard`, ~line 64)
- Test: `tests/cardMapping.test.ts` (add a `describe` block)

**Interfaces:**
- Consumes: `isFlowLayout`, `getFlowLayout` from Task 1; `activeFieldsFor`, `splitTitleSections`, `schemaTitleKey`, `resolveLocale` (existing).
- Produces: `Card.meta?: { label: LocalizedText; value: LocalizedText }[]`, `Card.headerImage?: CardImage`, `CardSection.image?: CardImage`; `recordToCard` returns these populated for flow templates. Grid path unchanged.

- [ ] **Step 1: Write the failing test**

```ts
// tests/cardMapping.test.ts — add near the other recordToCard tests
import { recordToCard } from '../src/lib/modules/flashcards/cardMapping';
import type { Schema, CardTemplate, RecordItem, Settings } from '../src/lib/modules/flashcards/model';
import { DEFAULT_SETTINGS } from '../src/lib/modules/flashcards/model';

function countrySchema(): Schema {
  return {
    id: 'sch_c', name: 'Country',
    fields: [
      { id: 'f1', key: 'name', label: 'Name', type: 'text' },
      { id: 'f2', key: 'capital', label: 'Capital', type: 'text' },
      { id: 'f3', key: 'language', label: 'Language', type: 'text' },
      { id: 'f4', key: 'imageFlag', label: 'Flag', type: 'image' },
      { id: 'f5', key: 'contentLandscape', label: 'Landscape', type: 'text-long' },
      { id: 'f6', key: 'imageLandscape', label: 'Landscape image', type: 'image' },
      { id: 'f7', key: 'contentFood', label: 'Food', type: 'text-long' },
      { id: 'f8', key: 'imageFood', label: 'Food image', type: 'image' },
    ],
    cardTemplates: [],
  };
}
function countryRecord(): RecordItem {
  return { id: 'rec_c', schemaId: 'sch_c', fieldsHash: '', fields: {
    name: 'Vietnam', capital: 'Hanoi', language: 'Vietnamese',
    imageFlag: 'flag.png', contentLandscape: '- Coastline\n- Ha Long Bay', imageLandscape: 'halong.png',
    contentFood: '- Pho\n- Banh Mi', imageFood: 'pho.png',
  } };
}
const S: Settings = DEFAULT_SETTINGS;

describe('recordToCard — flow layout', () => {
  it('page mode: title + meta lines + sections with paired images + header image', () => {
    const schema = countrySchema();
    const tpl: CardTemplate = { id: 't1', templateType: 'single', layout: 'country-page', mapping: {},
      fields: ['name', 'capital', 'language', 'imageFlag', 'contentLandscape', 'imageLandscape', 'contentFood', 'imageFood'] };
    const card = recordToCard(countryRecord(), schema, tpl, S, 'en');
    expect(card.title).toContain('Vietnam');
    expect(card.meta?.map((m) => m.value)).toEqual(['Hanoi', 'Vietnamese']);
    expect(card.headerImage?.url).toBe('flag.png');
    expect(card.sections.map((s) => s.label)).toEqual(['Landscape', 'Food']);
    expect(card.sections[0].image?.url).toBe('halong.png');
    expect(card.sections[1].image?.url).toBe('pho.png');
  });
  it('collage mode: no long-text fields → all images become tiles, title kept', () => {
    const schema = countrySchema();
    const tpl: CardTemplate = { id: 't0', templateType: 'single', layout: 'country-cover', mapping: {},
      fields: ['name', 'imageFlag', 'imageLandscape', 'imageFood'] };
    const card = recordToCard(countryRecord(), schema, tpl, S, 'en');
    expect(card.title).toContain('Vietnam');
    expect(card.images.map((i) => i.url)).toEqual(['flag.png', 'halong.png', 'pho.png']);
    expect(card.sections).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/cardMapping.test.ts -t "flow layout"`
Expected: FAIL — `card.meta`/`headerImage`/`section.image` undefined (flow branch not implemented).

- [ ] **Step 3: Write minimal implementation**

In `model.ts`, extend the two interfaces (add only the new optional fields; leave everything else):

```ts
// CardSection — add optional paired image
export interface CardSection { id: string; label: LocalizedText; content: LocalizedText; recordId?: string; customClass?: string; fontSize?: number; textAlign?: string; labelSize?: number; image?: CardImage }
// Card — add optional flow-only fields (grid path never reads these)
// ...existing Card fields... add before `[k: string]: unknown`:
//   meta?: { label: LocalizedText; value: LocalizedText }[]; headerImage?: CardImage;
```

In `cardMapping.ts`, add the flow branch at the top of `recordToCard` (after computing `orientation`, `activeFields`):

```ts
import { isFlowLayout, getFlowLayout } from './lib/layouts' // WRONG — see note
```

> Import from `./lib/flow-layouts`, NOT `./lib/layouts`.

```ts
import { LAYOUT_SLOTS } from './lib/layouts';
import { isFlowLayout, getFlowLayout } from './lib/flow-layouts';

// inside recordToCard, after: const activeFields = activeFieldsFor(schema, template);
if (isFlowLayout(template.layout)) {
  return recordToFlowCard(record, schema, template, settings, locale, orientation, activeFields);
}
```

Add the helper (pure) below `recordToCard`:

```ts
function recordToFlowCard(
  record: RecordItem, schema: Schema, template: CardTemplate, settings: Settings, locale: string,
  orientation: string, activeFields: SchemaField[],
): Card {
  const def = getFlowLayout(template.layout)!;
  const tkey = schemaTitleKey(schema);
  const titleField = tkey ? activeFields.find((f) => f.key === tkey && f.type !== 'image') ?? null : null;
  const title = titleField ? resolveLocale(record.fields[titleField.key], locale) : '';

  if (def.mode === 'collage') {
    const images: CardImage[] = [];
    let slot = 0;
    for (const f of activeFields) {
      if (f.type !== 'image') continue;
      const url = resolveLocale(record.fields[f.key], locale);
      if (url) images.push({ slot: slot++, url });
    }
    return { id: 'preview_' + record.id, layout: template.layout, imageHeightPercent: 50,
      images, title, sections: [], meta: [], orientation, recordId: record.id, templateId: template.id };
  }

  // page mode — walk active fields in order, classifying by position relative to the first section.
  const meta: { label: LocalizedText; value: LocalizedText }[] = [];
  const sections: CardSection[] = [];
  const images: CardImage[] = [];
  let headerImage: CardImage | undefined;
  let seenSection = false;
  let slot = 0;
  for (const f of activeFields) {
    if (f === titleField) continue;
    if (f.type === 'image') {
      const url = resolveLocale(record.fields[f.key], locale);
      if (!url) continue;
      const img: CardImage = { slot: slot++, url };
      if (!seenSection) headerImage = headerImage ?? img;       // leading image = header (flag)
      else sections[sections.length - 1].image = sections[sections.length - 1].image ?? img; // pair to current section
      images.push(img);
    } else if (f.type === 'text-long') {
      seenSection = true;
      sections.push({ id: uid('sec'), label: f.label, content: resolveLocale(record.fields[f.key], locale) });
    } else {
      // short text before any section = meta line; short text after sections is ignored for flow
      if (!seenSection) meta.push({ label: f.label, value: resolveLocale(record.fields[f.key], locale) });
    }
  }
  return { id: 'preview_' + record.id, layout: template.layout, imageHeightPercent: 50,
    images, title, sections, meta, headerImage, orientation, recordId: record.id, templateId: template.id };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/cardMapping.test.ts`
Expected: PASS (existing + 2 new).

- [ ] **Step 5: Run the full suite + check (regression gate)**

Run: `npm test` then `npm run check`
Expected: all green, 0 check errors (grid path untouched).

- [ ] **Step 6: Commit**

```bash
git add src/lib/modules/flashcards/model.ts src/lib/modules/flashcards/cardMapping.ts tests/cardMapping.test.ts
git commit -m "feat(flashcards): recordToCard flow branch + Card meta/headerImage/section.image"
```

---

### Task 3: Flow renderer — `buildFlowCardHTML`

**Files:**
- Create: `src/lib/modules/flashcards/lib/flow-render.ts`
- Test: `tests/flow-render.test.ts`

**Interfaces:**
- Consumes: `esc`, `mdBlock`, `mdInline`, `resolveLocale`, `getPaperPx`, `mmToPx` from `./card-render`; `FlowLayoutDef` from `./flow-layouts`; `Card`, `Settings` from `../model`.
- Produces: `buildFlowCardHTML(card: Card, settings: Settings, locale: string, def: FlowLayoutDef, forPrint?: boolean, overridePx?: { w: number; h: number } | null): string`; `fitFlowScale(naturalH: number, pageInnerH: number): number`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/flow-render.test.ts
import { describe, it, expect } from 'vitest';
import { buildFlowCardHTML, fitFlowScale } from '../src/lib/modules/flashcards/lib/flow-render';
import { getFlowLayout } from '../src/lib/modules/flashcards/lib/flow-layouts';
import { DEFAULT_SETTINGS, type Card } from '../src/lib/modules/flashcards/model';

const page: Card = { id: 'c1', layout: 'country-page', imageHeightPercent: 50,
  images: [], title: '<h1>Vietnam</h1>',
  meta: [{ label: 'Capital', value: 'Hanoi' }, { label: 'Language', value: 'Vietnamese' }],
  headerImage: { slot: 0, url: 'flag.png' },
  sections: [
    { id: 's1', label: 'Landscape', content: '- Coastline\n- Ha Long Bay', image: { slot: 1, url: 'halong.png' } },
    { id: 's2', label: 'Food', content: '- Pho', image: { slot: 2, url: 'pho.png' } },
  ] };
const cover: Card = { id: 'c0', layout: 'country-cover', imageHeightPercent: 50,
  images: [{ slot: 0, url: 'flag.png' }, { slot: 1, url: 'halong.png' }, { slot: 2, url: 'pho.png' }],
  title: '<h1>Vietnam</h1>', meta: [], sections: [] };

describe('buildFlowCardHTML — page', () => {
  const html = buildFlowCardHTML(page, DEFAULT_SETTINGS, 'en', getFlowLayout('country-page')!);
  it('renders a header with title, meta lines and floated flag', () => {
    expect(html).toContain('Vietnam');
    expect(html).toContain('Hanoi');
    expect(html).toContain('flag.png');
    expect(html).toContain('fc-flow-header');
  });
  it('renders section headings and markdown bullets as <ul>', () => {
    expect(html).toContain('Landscape');
    expect(html).toContain('<ul>');
    expect(html).toContain('halong.png');
  });
  it('alternates float side by section index (right then left)', () => {
    const first = html.indexOf('float:right');
    const second = html.indexOf('float:left');
    expect(first).toBeGreaterThan(-1);
    expect(second).toBeGreaterThan(-1);
  });
});
describe('buildFlowCardHTML — collage', () => {
  const html = buildFlowCardHTML(cover, DEFAULT_SETTINGS, 'en', getFlowLayout('country-cover')!);
  it('renders a grid of image tiles and an outline title', () => {
    expect(html).toContain('fc-flow-collage');
    expect((html.match(/flag\.png|halong\.png|pho\.png/g) || []).length).toBe(3);
    expect(html).toContain('-webkit-text-stroke');
  });
});
describe('fitFlowScale', () => {
  it('returns 1 when content fits', () => { expect(fitFlowScale(500, 800)).toBe(1); });
  it('shrinks proportionally when content overflows', () => { expect(fitFlowScale(1600, 800)).toBeCloseTo(0.5); });
  it('never shrinks below 0.5', () => { expect(fitFlowScale(4000, 800)).toBe(0.5); });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/flow-render.test.ts`
Expected: FAIL — cannot resolve `flow-render`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/modules/flashcards/lib/flow-render.ts
import type { Card, Settings, CardSection, CardImage } from '../model';
import type { FlowLayoutDef } from './flow-layouts';
import { esc, mdBlock, resolveLocale, getPaperPx, mmToPx } from './card-render';

/** Uniform scale so `naturalH` fits `pageInnerH`; clamped to [0.5, 1]. Pure. */
export function fitFlowScale(naturalH: number, pageInnerH: number): number {
  if (naturalH <= pageInnerH || naturalH <= 0) return 1;
  return Math.max(0.5, pageInnerH / naturalH);
}

function imgBox(url: string, side: 'left' | 'right', width: string): string {
  return `<div class="fc-flow-img" style="float:${side};width:${width};margin:${side === 'right' ? '0 0 8px 12px' : '0 12px 8px 0'};">` +
    `<div style="width:100%;padding-top:66%;background-image:url('${esc(url)}');background-size:contain;background-position:center;background-repeat:no-repeat;"></div></div>`;
}

function sideFor(def: FlowLayoutDef, i: number): 'left' | 'right' {
  if (def.sectionImageSide === 'left') return 'left';
  if (def.sectionImageSide === 'right') return 'right';
  return i % 2 === 0 ? 'right' : 'left'; // 'alt'
}

export function buildFlowCardHTML(
  card: Card, settings: Settings, locale: string, def: FlowLayoutDef,
  forPrint = false, overridePx: { w: number; h: number } | null = null,
): string {
  const { w, h } = overridePx || getPaperPx(settings.paperSize, card.orientation || settings.orientation);
  const marginPx = mmToPx(settings.margin);
  const cardW = w - 2 * marginPx, cardH = h - 2 * marginPx;
  const b = settings.border;
  const borderStyle = b.width ? `border:${b.width}px ${b.style} ${b.color};border-radius:${b.radius}px;` : '';
  const cf = settings.contentFont, tf = settings.titleFont;
  const baseFont = `font-family:${cf.family};font-size:${cf.size}px;color:${cf.color};line-height:${cf.lineHeight};`;
  const shell = `width:${cardW}px;height:${cardH}px;margin:${marginPx}px auto;background:white;box-sizing:border-box;padding:${mmToPx(settings.padding)}px;overflow:hidden;`;
  const scopeStyle =
    `<style>.fc-flow[data-id="${card.id}"] .fc-flow-section__label{font-weight:700;}` +
    `.fc-flow[data-id="${card.id}"] ul{margin:0 0 8px 0;padding-left:1.2em;}` +
    `.fc-flow[data-id="${card.id}"] h1{margin:0;font-family:${tf.family};color:${tf.color};}</style>`;
  const title = resolveLocale(card.title, locale);

  if (def.mode === 'collage') {
    const cols = def.collageColumns ?? 3;
    const tiles = card.images.map((im) =>
      `<div class="fc-flow-tile" style="width:100%;padding-top:100%;background-image:url('${esc(im.url)}');background-size:contain;background-position:center;background-repeat:no-repeat;"></div>`).join('');
    const titleHtml = def.titleStyle === 'outline'
      ? `<div class="fc-flow-cover-title" style="font-family:${tf.family};font-size:${tf.size * 3}px;font-weight:800;-webkit-text-stroke:2px ${tf.color};color:transparent;text-align:center;margin:12px 0;">${esc(title.replace(/<[^>]+>/g, ''))}</div>`
      : `<div class="fc-flow-cover-title" style="font-family:${tf.family};font-size:${tf.size * 3}px;text-align:center;margin:12px 0;">${title}</div>`;
    return scopeStyle +
      `<div class="fc-flow fc-flow-collage" data-id="${card.id}" style="${shell}${borderStyle}${baseFont}">` +
      titleHtml +
      `<div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:12px;">${tiles}</div></div>`;
  }

  // page mode
  const hasHeader = !!title || (card.meta?.length ?? 0) > 0;
  const metaLines = (card.meta ?? [])
    .map((m) => `<div class="fc-flow-meta">${esc(resolveLocale(m.label, locale))}- ${esc(resolveLocale(m.value, locale))}</div>`).join('');
  const header = hasHeader
    ? `<div class="fc-flow-header" style="overflow:hidden;margin-bottom:12px;">` +
      (card.headerImage ? `<div class="fc-flow-flag" style="float:right;width:32%;"><div style="width:100%;padding-top:66%;background-image:url('${esc(card.headerImage.url)}');background-size:contain;background-position:center;background-repeat:no-repeat;"></div></div>` : '') +
      (title ? `<div class="fc-flow-title">${title}</div>` : '') + metaLines +
      `</div>`
    : '';
  const sections = card.sections.map((sec: CardSection, i: number) => {
    const img = sec.image ? imgBox(sec.image.url, sideFor(def, i), def.imageWidth ?? '40%') : '';
    const label = resolveLocale(sec.label, locale);
    return `<div class="fc-flow-section" style="overflow:hidden;margin-bottom:12px;">` +
      img +
      (label ? `<div class="fc-flow-section__label">${esc(label)}:</div>` : '') +
      `<div class="fc-flow-section__content">${mdBlock(resolveLocale(sec.content, locale))}</div></div>`;
  }).join('');
  return scopeStyle +
    `<div class="fc-flow fc-flow-page" data-id="${card.id}" style="${shell}${borderStyle}${baseFont}">` +
    `<div class="fc-flow-inner" style="transform-origin:top left;transform:scale(var(--flow-scale,1));">${header}${sections}</div></div>`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/flow-render.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add src/lib/modules/flashcards/lib/flow-render.ts tests/flow-render.test.ts
git commit -m "feat(flashcards): buildFlowCardHTML renderer + fitFlowScale"
```

---

### Task 4: Dispatch flow layouts from `buildCardHTML`

**Files:**
- Modify: `src/lib/modules/flashcards/lib/card-render.ts` (`buildCardHTML`, top of body ~line 122)
- Test: `tests/flow-render.test.ts` (add a dispatch test)

**Interfaces:**
- Consumes: `isFlowLayout`, `getFlowLayout` from `./flow-layouts`; `buildFlowCardHTML` from `./flow-render`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/flow-render.test.ts — append
import { buildCardHTML } from '../src/lib/modules/flashcards/lib/card-render';
describe('buildCardHTML dispatch', () => {
  it('routes a flow layout to the flow renderer', () => {
    const html = buildCardHTML(cover, DEFAULT_SETTINGS, 'en');
    expect(html).toContain('fc-flow-collage');
  });
  it('still renders a grid layout the old way', () => {
    const grid: Card = { id: 'g', layout: 'fulltext', imageHeightPercent: 50, images: [], title: 'T',
      sections: [{ id: 's', label: 'L', content: 'body' }] };
    const html = buildCardHTML(grid, DEFAULT_SETTINGS, 'en');
    expect(html).toContain('fc-card');
    expect(html).not.toContain('fc-flow');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/flow-render.test.ts -t "dispatch"`
Expected: FAIL — grid renderer emits `fc-card`, not `fc-flow-collage`.

- [ ] **Step 3: Write minimal implementation**

In `card-render.ts`, add imports and a guard as the FIRST statements inside `buildCardHTML`:

```ts
import { isFlowLayout, getFlowLayout } from './flow-layouts';
import { buildFlowCardHTML } from './flow-render';

export function buildCardHTML(card: Card, settings: Settings, locale: string, forPrint = false, overridePx: { w: number; h: number } | null = null): string {
  if (isFlowLayout(card.layout)) {
    return buildFlowCardHTML(card, settings, locale, getFlowLayout(card.layout)!, forPrint, overridePx);
  }
  const s = settings; // ...existing body unchanged...
```

> Watch for a circular import: `flow-render.ts` imports helpers from `card-render.ts`, and `card-render.ts` now imports `buildFlowCardHTML` from `flow-render.ts`. ES modules handle this cycle because both are only *called* at runtime (not at module top level). If `npm run check`/tests show an init-order error, move the shared helpers (`esc`, `mdBlock`, `resolveLocale`, `getPaperPx`, `mmToPx`) into a new `lib/render-utils.ts` that both import, and keep `card-render.ts` re-exporting them. Verify with the run in Step 4 before assuming a split is needed.

- [ ] **Step 4: Run tests + check (regression gate)**

Run: `npx vitest run tests/flow-render.test.ts tests/CardPreview.test.ts tests/printCards.test.ts tests/pdfExport.test.ts` then `npm run check`
Expected: all green, 0 check errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/modules/flashcards/lib/card-render.ts tests/flow-render.test.ts
git commit -m "feat(flashcards): dispatch flow layouts from buildCardHTML"
```

---

### Task 5: Layout picker — Document optgroup

**Files:**
- Modify: `src/lib/modules/flashcards/components/CardPreview.svelte` (import ~line 13; `<select>` ~line 179-181)
- Test: `tests/CardPreview.test.ts`

**Interfaces:**
- Consumes: `FLOW_LAYOUTS` from `../lib/flow-layouts`; `LAYOUTS` (already imported).

- [ ] **Step 1: Write the failing test**

```ts
// tests/CardPreview.test.ts — add an assertion in the render test (follow the file's existing setup)
// After rendering CardPreview with a schema selected:
it('lists grid layouts and a Document optgroup with flow presets', () => {
  // ...existing render setup that mounts CardPreview...
  const groups = document.querySelectorAll('optgroup');
  const labels = Array.from(groups).map((g) => g.getAttribute('label'));
  expect(labels).toContain('Cards');
  expect(labels).toContain('Document');
  expect(document.querySelector('option[value="country-cover"]')).not.toBeNull();
});
```

> Match the existing mounting/store setup in `tests/CardPreview.test.ts`; reuse its helpers rather than inventing new ones.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/CardPreview.test.ts -t "Document optgroup"`
Expected: FAIL — no `<optgroup>` yet.

- [ ] **Step 3: Write minimal implementation**

In `CardPreview.svelte`, add the import:

```svelte
import { FLOW_LAYOUTS } from '../lib/flow-layouts';
```

Replace the `<select>` options (lines ~179-181):

```svelte
<select value={template?.layout ?? 'fulltext'} onchange={onLayout} disabled={!schema}>
  <optgroup label="Cards">
    {#each LAYOUTS as l (l.id)}<option value={l.id}>{l.label}</option>{/each}
  </optgroup>
  <optgroup label="Document">
    {#each FLOW_LAYOUTS as l (l.id)}<option value={l.id}>{l.label}</option>{/each}
  </optgroup>
</select>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/CardPreview.test.ts` then `npm run check`
Expected: PASS, 0 check errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/modules/flashcards/components/CardPreview.svelte tests/CardPreview.test.ts
git commit -m "feat(flashcards): add Document layout group to picker"
```

---

### Task 6: Auto-fit wiring — preview + print/PDF

**Files:**
- Modify: `src/lib/modules/flashcards/components/CardPreview.svelte` (add a fit `$effect`)
- Modify: `src/lib/modules/flashcards/components/PrintView.svelte` (apply fit before/after render)
- Modify: `src/lib/modules/flashcards/lib/pdfExport.ts` (apply fit before capture)
- Test: manual (DOM measurement) + `tests/flow-render.test.ts` already covers the pure `fitFlowScale`.

**Interfaces:**
- Consumes: `fitFlowScale` from `../lib/flow-render`.

- [ ] **Step 1: Add the shared fit routine (DOM)**

Add to `CardPreview.svelte` a routine that, after the preview HTML mounts, finds each `.fc-flow-inner`, measures, and sets the CSS var. Because the flow card's outer shell has `overflow:hidden` and a fixed height, measure the inner content's natural height by temporarily clearing the transform:

```svelte
import { fitFlowScale } from '../lib/flow-render';

$effect(() => {
  // re-run whenever the rendered sheet HTML changes
  void sheetHtml;
  queueMicrotask(() => {
    for (const inner of document.querySelectorAll<HTMLElement>('.preview .fc-flow-inner')) {
      const shell = inner.closest<HTMLElement>('.fc-flow');
      if (!shell) continue;
      inner.style.setProperty('--flow-scale', '1');
      const pad = parseFloat(getComputedStyle(shell).paddingTop) || 0;
      const pageInnerH = shell.clientHeight - 2 * pad;
      const scale = fitFlowScale(inner.scrollHeight, pageInnerH);
      inner.style.setProperty('--flow-scale', String(scale));
    }
  });
});
```

- [ ] **Step 2: Mirror the routine in PrintView + pdfExport**

In `PrintView.svelte`, after the print DOM mounts (same selector loop) apply the identical fit pass. In `pdfExport.ts`, before capturing each page to canvas, run the same measurement on the rendered node so the exported PDF matches the preview. Reuse `fitFlowScale`; do not duplicate the clamp logic.

- [ ] **Step 3: Manual verification**

Run: `npm run tauri dev`
- Open a project whose schema uses `country-page` on a content-heavy view.
- Confirm an overflowing page shrinks to fit one page (no clip, no third page).
- Confirm a short page stays at scale 1 (no shrink).
- Print/PDF preview matches the on-screen preview.

- [ ] **Step 4: Run check + full suite**

Run: `npm run check` then `npm test`
Expected: 0 check errors, all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/modules/flashcards/components/CardPreview.svelte src/lib/modules/flashcards/components/PrintView.svelte src/lib/modules/flashcards/lib/pdfExport.ts
git commit -m "feat(flashcards): auto-fit flow pages via measured scale (preview + print/pdf)"
```

---

### Task 7: Country-profile starter fixture

**Files:**
- Create: `save_data/country-profile-starter.tomoe.json`
- Test: `tests/flow-starter.test.ts`

**Interfaces:**
- Consumes: `parseProject` from `../src/lib/modules/flashcards/model`; `isFlowLayout` from `.../lib/flow-layouts`.

> Note (deviation from spec): the Schema Library is localStorage-only with no built-in seed mechanism, so the "schema-library entry" is realized as a starter project file the user opens (New → Open). Flag this in spec review.

- [ ] **Step 1: Write the failing test**

```ts
// tests/flow-starter.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseProject } from '../src/lib/modules/flashcards/model';
import { isFlowLayout } from '../src/lib/modules/flashcards/lib/flow-layouts';

describe('country-profile starter', () => {
  const p = parseProject(readFileSync('save_data/country-profile-starter.tomoe.json', 'utf-8'));
  it('has one schema with 3 flow views', () => {
    expect(p.schemas).toHaveLength(1);
    const views = p.schemas[0].cardTemplates;
    expect(views).toHaveLength(3);
    expect(views.every((v) => isFlowLayout(v.layout))).toBe(true);
  });
  it('cover view is collage; page views set cardsPerPage 1', () => {
    const [cover, page1, page2] = p.schemas[0].cardTemplates;
    expect(cover.layout).toBe('country-cover');
    expect(page1.layout).toBe('country-page');
    expect(page2.layout).toBe('country-page');
    expect(page1.cardsPerPage).toBe(1);
    expect(page2.cardsPerPage).toBe(1);
  });
  it('ships border width 0 so it matches the mock out-of-box', () => {
    expect(p.settings.border.width).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/flow-starter.test.ts`
Expected: FAIL — file not found.

- [ ] **Step 3: Write the fixture**

Create `save_data/country-profile-starter.tomoe.json` — a valid Project (see `model.ts` `Project` + `parseProject`). Include: `settings` with `border.width: 0`, `paperSize: "A4"`, `orientation: "portrait"`; one schema with fields `name`(text), `capital`(text), `language`(text), `imageFlag`(image), and 4 content/image pairs (`contentLandscape`/`imageLandscape`, `contentPlantsAndAnimals`/`imagePlantsAndAnimals`, `contentLandmarksAndCulture`/`imageLandmarksAndCulture`, `contentFood`/`imageFood`), all `multilingual: true` for text; 3 `cardTemplates`:
  - `{ id, templateType:'single', layout:'country-cover', cardsPerPage:1, mapping:{}, name:'Cover', fields:['name','imageFlag','imageLandscape','imagePlantsAndAnimals','imageLandmarksAndCulture','imageFood'] }`
  - `{ id, templateType:'single', layout:'country-page', cardsPerPage:1, mapping:{}, name:'Page 1', fields:['name','capital','language','imageFlag','contentLandscape','imageLandscape','contentPlantsAndAnimals','imagePlantsAndAnimals'] }`
  - `{ id, templateType:'single', layout:'country-page', cardsPerPage:1, mapping:{}, name:'Page 2', fields:['contentLandmarksAndCulture','imageLandmarksAndCulture','contentFood','imageFood'] }`

Seed one record: the Vietnam record from the conversation (the completed `rec_1u7fqw8c`). `records: [ <that record with schemaId set to this schema's id> ]`, `cards: []`, `locales: ['en','vi']`, `activeLocale: 'en'`, `version: 1`, `projectName: 'Country profile'`, `projectIcon: '🌏'`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/flow-starter.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Manual verification**

Run: `npm run tauri dev` → Open `save_data/country-profile-starter.tomoe.json` → confirm 3 views render as cover + 2 pages resembling the mock (images are placeholders until replaced by hand).

- [ ] **Step 6: Commit**

```bash
git add save_data/country-profile-starter.tomoe.json tests/flow-starter.test.ts
git commit -m "feat(flashcards): country-profile starter project fixture"
```

---

## Self-Review

**1. Spec coverage:**
- Render model (multi-page, bounded, auto-fit) → Tasks 3 (renderer), 6 (auto-fit). ✓
- Pages = views → Task 7 fixture (3 views) + reuse of existing multi-view/print (no code change needed). ✓
- Few fixed presets → Task 1 (`FLOW_LAYOUTS`, 2 presets). ✓
- Own baseline style + respects cascade → Task 3 (scoped `<style>`, reads `settings` fonts/border/margin). ✓
- Images: same fields, auto-fill placeholder → Task 2 (reuses image fields, no line-art fields). ✓
- Field-role parsing (type + order) → Task 2. ✓
- Dispatch/isolation, no grid changes → Task 4 (+ regression gates in Tasks 2,4,5,6). ✓
- Picker optgroup → Task 5. ✓
- Print/pack unchanged via `cardsPerPage:1` → Task 7 fixture sets it; Task 6 adds fit hook only. ✓
- Schema-library entry → realized as starter fixture (Task 7) with documented deviation. ✓
- Testing (TDD) → every task test-first; regression gates included. ✓

**2. Placeholder scan:** No TBD/TODO. Fixture content (Task 7) is specified field-by-field with exact `fields` arrays and the concrete Vietnam record as the seed — not "fill in details."

**3. Type consistency:** `FlowLayoutDef`, `isFlowLayout`/`getFlowLayout`, `buildFlowCardHTML(card,settings,locale,def,forPrint?,overridePx?)`, `fitFlowScale(naturalH,pageInnerH)`, and `Card.meta`/`Card.headerImage`/`CardSection.image` are used identically across Tasks 1–7.

## Open items for spec review (raised because the user was away)

- **Field-type assumption:** parsing relies on `capital`/`language` being `type:'text'` and `contentX` being `type:'text-long'` in the real schema (`sch_1t711jio`). Verify against the user's project before/at Task 2; adjust the rule if types differ.
- **Schema-library deviation:** built-in seed vs. starter fixture (Task 7) — confirm the fixture approach is acceptable, or add a small "seed built-in library entries on first run" task.
- **Auto-fit MVP:** uniform `transform: scale` (may leave right-margin whitespace). Font-size-only scaling deferred.
