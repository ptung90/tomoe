import { marked } from 'marked';
import type { Card, Settings, CardSection, CardImage, FontSpec, LocalizedText } from '../model';
import { LAYOUT_SLOTS, LAYOUT_SPLIT_DEFAULTS } from './layouts';
import { resolveStyle } from './style';
import { isFlowLayout, getFlowLayout } from './flow-layouts';
import { buildFlowCardHTML } from './flow-render';

// Re-exported for existing importers (registry now lives in `./layouts`).
export { LAYOUTS, LAYOUT_IDS, LAYOUT_SLOTS, LAYOUT_SPLIT_DEFAULTS, HIDE_TITLE_LAYOUTS } from './layouts';
export type { LayoutDef } from './layouts';

export const PAPER_MM: Record<string, { w: number; h: number }> = {
  A4: { w: 210, h: 297 }, A5: { w: 148, h: 210 }, A6: { w: 105, h: 148 },
  A7: { w: 74, h: 105 }, A8: { w: 52, h: 74 }, Letter: { w: 216, h: 279 },
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

/** Resolve a field label to display text. Unlike `resolveLocale` (used for field *values*,
 *  which may legitimately be blank), a label always renders something meaningful: the active
 *  `locale`'s text → else the first non-empty value across locales → else the field `key`.
 *  Never returns an empty string. Pure. */
export function resolveLabel(label: LocalizedText, locale: string, key: string): string {
  if (label === null || label === undefined) return key;  // null-safe like resolveLocale (legacy/hand-edited fields)
  if (typeof label === 'object') {
    const cur = (label[locale] ?? '').trim();
    if (cur) return cur;
    for (const v of Object.values(label)) {
      const t = (v ?? '').trim();
      if (t) return t;
    }
    return key;
  }
  const s = (label ?? '').trim();
  return s || key;
}

/** Read the per-locale editor value for a label input: an object label reads its `locale`
 *  slot directly (blank if unset); a legacy string label is shown ONLY under `firstLocale` (so
 *  it appears once, not duplicated under every locale) and blank everywhere else. Pure —
 *  companion to `setLabelLocale` for the label editor UI (SchemaEditorModal / SchemaLibraryModal). */
export function labelLocaleValue(label: LocalizedText, locale: string, firstLocale: string): string {
  if (label === null || label === undefined) return '';
  if (typeof label === 'object') return label[locale] ?? '';
  return locale === firstLocale ? label : '';
}

/** Write one locale's text into a label, normalizing to an object. A legacy string label is
 *  first carried into `{ [firstLocale]: label }` (so editing any OTHER locale never loses it);
 *  a blank label starts from `{}`. Pure — companion to `labelLocaleValue`. */
export function setLabelLocale(label: LocalizedText, locale: string, text: string, firstLocale: string): LocalizedText {
  const base: Record<string, string> = typeof label === 'object' ? { ...label } : (label ? { [firstLocale]: label } : {});
  base[locale] = text;
  return base;
}

export function mdInline(text: string): string { return marked.parseInline(text || '', { async: false }) as string; }
export function mdBlock(text: string): string {
  if (!text) return '';
  if (text.trimStart().startsWith('<')) return text;
  return marked.parse(text, { async: false, breaks: false }) as string;
}

// ── Card Render (HTML) ─────────────────────────────────────────────
type GridSplit = { row: number; col: number; inner: number };

const GRID_STRATEGIES: Record<string, (r: number, c: number, n: number) => string> = {
  '2x2': (r, c) => `grid-template-rows:${r}% ${100 - r}%;grid-template-columns:${c}% ${100 - c}%;`,
  '1top-1bot': (r) => `grid-template-rows:${r}% ${100 - r}%;`,
  '2top-1bot': (r, _c, n) => `grid-template-rows:${r}% ${100 - r}%;grid-template-columns:${n}% ${100 - n}%;`,
  '1top-2bot': (r, _c, n) => `grid-template-rows:${r}% ${100 - r}%;grid-template-columns:${n}% ${100 - n}%;`,
  '1big-2small': (r, c, n) => `grid-template-columns:${c}% ${100 - c}%;grid-template-rows:${n}% ${100 - n}%;`,
  '1left-2right': (r, c, n) => `grid-template-columns:${c}% ${100 - c}%;grid-template-rows:${n}% ${100 - n}%;`,
  '1left-3right': (_r, c) => `grid-template-columns:${c}% ${100 - c}%;grid-template-rows:1fr 1fr 1fr;`,
  '1top-3bot': (r) => `grid-template-rows:${r}% ${100 - r}%;grid-template-columns:1fr 1fr 1fr;`,
};

export function getGridTemplateStyle(layout: string, sp: GridSplit): string {
  const generator = GRID_STRATEGIES[layout];
  return generator ? generator(sp.row, sp.col, sp.inner) : '';
}

function resolveImgStyle(img: CardImage | undefined, globalImgStyle: string): string {
  if (!img || img.size == null) return globalImgStyle;
  return 'background-size:' + img.size + ';background-position:center;' +
    (img.size !== 'cover' && img.color ? 'background-color:' + img.color + ';' : '');
}

/** Optional per-image "frame" CSS shared by grid + flow renders: rounds the corners and/or fills a
 *  solid background behind the image. Emitted only when set (radius > 0, colour not transparent),
 *  so default images stay unstyled. Trailing semicolons kept so it appends cleanly. */
export function imageFrameStyle(image: Settings['image']): string {
  const radius = image.borderRadius ?? 0;
  const color = image.backgroundColor ?? 'transparent';
  return (radius > 0 ? 'border-radius:' + radius + 'px;' : '') +
    (color && color !== 'transparent' ? 'background-color:' + color + ';' : '');
}

function buildSlots(card: Card, slotCount: number, imgStyle: string, frameStyle: string, forPrint = false): string {
  return Array.from({ length: slotCount }, (_, i) => {
    const img = card.images.find((im) => im.slot === i);
    if (img && img.url) {
      return (
        '<div class="fc-image-slot fc-image-slot-' + i +
        '"><div class="img-bg" style="background-image:url(\'' + esc(img.url) + '\');' +
        resolveImgStyle(img, imgStyle) +
        'background-repeat:no-repeat;width:100%;height:100%;' + frameStyle + '"></div>' +
        '</div>'
      );
    }
    if (forPrint) return '<div class="fc-image-slot fc-image-slot-' + i + '" style="background:transparent;"></div>';
    return '<div class="fc-image-slot fc-image-slot-' + i + '"><span class="empty-placeholder">📷</span></div>';
  }).join('');
}

function buildSectionsHtml(sections: CardSection[], hideLabels: boolean, inlineSections: boolean, locale: string): string {
  return sections
    .map(
      (sec) =>
        `<div class="fc-section${sec.customClass ? ` ${esc(sec.customClass)}` : ''}">` +
        (!hideLabels && resolveLocale(sec.label, locale) ? '<span class="fc-section__label"' + (sec.labelSize ? ` style="font-size:${sec.labelSize}px"` : '') + '>• ' + mdInline(resolveLocale(sec.label, locale)) + ': </span>' : '') +
        '<div class="fc-section__content"' + buildSectionContentStyle(sec, inlineSections) + '>' +
        (inlineSections ? mdInline(resolveLocale(sec.content, locale)) : mdBlock(resolveLocale(sec.content, locale))) +
        '</div></div>',
    )
    .join('');
}

function buildSectionContentStyle(sec: CardSection, inline: boolean): string {
  let s = inline ? 'display:inline;' : '';
  if (sec.fontSize) s += `font-size:${sec.fontSize}px;`;
  if (sec.textAlign) s += `text-align:${sec.textAlign};`;
  return s ? ` style="${s}"` : '';
}

function buildFontOverride(f: Partial<FontSpec>): string {
  return (
    (f.family ? 'font-family:' + f.family + ';' : '') +
    (f.size ? 'font-size:' + f.size + 'px;' : '') +
    (f.weight ? 'font-weight:' + f.weight + ';' : '') +
    (f.color ? 'color:' + f.color + ';' : '') +
    (f.lineHeight ? 'line-height:' + f.lineHeight + ';' : '') +
    (f.textAlign ? 'text-align:' + f.textAlign + ';' : '')
  );
}

const TEXT_VALIGN_MAP: Record<string, string> = { top: 'flex-start', middle: 'center', bottom: 'flex-end' };

function _scopeCardCss(css: string, cardId: string): string {
  const prefix = `.fc-card[data-id="${cardId}"]`;
  return css.replace(/([^{}@][^{]*)\{([^}]*)\}/g, (_, sel: string, body: string) =>
    `${prefix} ${sel.trim()} { ${body} }`
  );
}

export function buildCardHTML(card: Card, settings: Settings, locale: string, forPrint = false, overridePx: { w: number; h: number } | null = null): string {
  if (isFlowLayout(card.layout)) {
    return buildFlowCardHTML(card, settings, locale, getFlowLayout(card.layout)!, forPrint, overridePx);
  }
  const s = settings;
  const { w, h } = overridePx || getPaperPx(s.paperSize, card.orientation || s.orientation);
  const marginPx = mmToPx(s.margin);
  const paddingPx = mmToPx(s.padding);
  const imgPaddingPx = mmToPx(s.imgPadding ?? 0);
  // Inset the image block from its allotted area. `fullimage` handles its own
  // wrapper below; every other layout applies it to `.fc-image-area` (which has
  // a fixed px height/min-height, so border-box keeps the padding inside).
  const imgAreaPad = imgPaddingPx ? 'box-sizing:border-box;padding:' + imgPaddingPx + 'px;' : '';
  const vAlign = s.textVAlign || 'top';
  const vAlignJustify = TEXT_VALIGN_MAP[vAlign] || 'flex-start';
  const textVAlignStyle = 'justify-content:' + vAlignJustify + ';';
  const sectionsFlexOverride = vAlign !== 'top' ? 'flex:none;' : '';
  const cardW = w - 2 * marginPx;
  const cardH = h - 2 * marginPx;
  const innerH = cardH - 2 * paddingPx;
  const imgH = Math.round((innerH * card.imageHeightPercent) / 100);
  const slotCount = LAYOUT_SLOTS[card.layout] ?? 3;
  const split: GridSplit = card.imageGridSplit ||
    LAYOUT_SPLIT_DEFAULTS[card.layout] || { row: 50, col: 50, inner: 50 };

  const imgStyle =
    'background-size:' +
    s.image.backgroundSize +
    ';background-position:' +
    s.image.backgroundPosition +
    ';';

  const frameStyle = imageFrameStyle(s.image);
  const slots = buildSlots(card, slotCount, imgStyle, frameStyle, forPrint);
  const handles = '';
  const hideLabels = !!card.hideSectionLabels;
  const sectionsHtml = buildSectionsHtml(card.sections, hideLabels, !!card.inlineSections, locale);

  const cls =
    'fc-card fc-card--' +
    (forPrint ? 'print' : 'preview') +
    ' fc-layout-' +
    card.layout +
    (card.cssClass ? ' ' + card.cssClass.trim() : '');
  const borderStyle =
    'border:' +
    s.border.width +
    'px ' +
    s.border.style +
    ' ' +
    s.border.color +
    ';border-radius:' +
    s.border.radius +
    'px;';
  const sizeStyle =
    'width:' +
    cardW +
    'px;height:' +
    cardH +
    'px;margin:' +
    marginPx +
    'px auto;background:white;padding:' +
    paddingPx +
    'px;';
  const gridStyle = getGridTemplateStyle(card.layout, split);
  const resolvedTitle = resolveLocale(card.title, locale);
  // Title renders through markdown too (same engine as sections), so a title authored in the
  // RichText editor shows its formatting — incl. an h6 "Subtitle" line — instead of literal
  // markdown. mdBlock passes raw HTML straight through, so legacy hand-typed <br>/<small> titles
  // still render as before.
  const titleHtml = mdBlock(resolvedTitle);
  // Font overrides are resolved into `settings` by the caller (global → schema.style → card.style cascade).
  const titleF = { ...s.titleFont };
  const contentF = { ...s.contentFont };
  const titleStyle = buildFontOverride(titleF);
  const contentStyle = buildFontOverride(contentF);
  const _cs = `.fc-card[data-id="${card.id}"]`;
  const _h1Rule =
    `${_cs} .fc-section__content h1{margin:0;padding:0;${titleStyle}}` +
    `${_cs} .fc-section__content h2{margin:0;padding:0;${titleStyle}font-size:${Math.round((titleF.size || 14) * 0.85)}px;}` +
    `${_cs} .fc-section__content h3{margin:0;padding:0;${titleStyle}font-size:${Math.round((titleF.size || 14) * 0.75)}px;}` +
    // h6 = "Subtitle" (RichText toolbar): a small, muted secondary line — not a bold heading.
    `${_cs} .fc-section__content h6{margin:1px 0 0;padding:0;font-weight:400;opacity:0.7;font-size:${Math.round((contentF.size || 12) * 0.82)}px;}` +
    // The title is markdown-rendered too: strip the wrapping <p>'s margins, and give an h6 subtitle
    // line in the title a small, muted look sized off the title font.
    `${_cs} .fc-title p{margin:0;padding:0;}` +
    `${_cs} .fc-title h6{margin:1px 0 0;padding:0;font-weight:400;opacity:0.7;font-size:${Math.round((titleF.size || 14) * 0.62)}px;}`;
  const _labelSizeRule = card.labelSize
    ? `${_cs} .fc-section__label{font-size:${card.labelSize}px}${_cs} .fc-img-label{font-size:${card.labelSize}px}`
    : '';
  const _contentSizeRule = card.contentSize
    ? `${_cs} .fc-section__content{font-size:${card.contentSize}px}`
    : '';
  const _imgLabelFontRule = contentStyle ? `${_cs} .fc-img-label{${contentStyle}}` : '';
  // Gap between content paragraphs; the last one is flush so it doesn't push text off the card.
  const paraGapPx = Math.max(0, s.paraGap ?? 0);
  const _paraGapRule =
    `${_cs} .fc-section__content > p{margin-bottom:${paraGapPx}px}` +
    `${_cs} .fc-section__content > p:last-child{margin-bottom:0}`;
  const cardStyleTag = '<style>' + _h1Rule + _labelSizeRule + _contentSizeRule + _imgLabelFontRule + _paraGapRule + (card.customCss ? _scopeCardCss(card.customCss, card.id) : '') + '</style>';
  const showTitle = !!resolvedTitle && !card.hideTitle;

  // fullimage: image-only card with inner padding wrapper
  if (card.layout === 'fullimage') {
    const borderW = s.border.width || 0;
    const nopadStyle = 'width:' + cardW + 'px;height:' + cardH + 'px;margin:' + marginPx + 'px auto;background:white;padding:0;';
    const innerWrapStyle =
      'box-sizing:border-box;width:100%;height:100%;padding:' +
      imgPaddingPx +
      'px;';
    return (
      cardStyleTag +
      '<div class="' + cls + '" data-layout="' + card.layout + '" data-id="' + card.id +
      '" style="' + nopadStyle + borderStyle + '">' +
      '<div style="' + innerWrapStyle + '">' +
      '<div class="fc-image-area" style="height:' + (cardH - 2 * imgPaddingPx - 2 * borderW) + 'px;position:relative;">' +
      slots + handles +
      '</div></div></div>'
    );
  }

  // title-img-text: title on TOP, then the image, then the text (vocab-card / old 3card cell order)
  if (card.layout === 'title-img-text') {
    return (
      cardStyleTag +
      '<div class="' + cls + '" data-layout="' + card.layout + '" data-id="' + card.id +
      '" style="' + sizeStyle + borderStyle + '">' +
      (showTitle ? '<div class="fc-title" style="' + titleStyle + '">' + titleHtml + '</div>' : '') +
      // Image auto-fills the empty middle between title and text; imageHeightPercent is the floor (min-height).
      '<div class="fc-image-area" style="min-height:' + imgH + 'px;position:relative;flex:1 1 auto;' + imgAreaPad + '">' + slots + handles + '</div>' +
      '<div class="fc-text-area" style="' + textVAlignStyle + '">' +
      '<div class="fc-sections" style="' + contentStyle + sectionsFlexOverride + '">' + sectionsHtml + '</div>' +
      '</div></div>'
    );
  }

  // fulltext: text fills entire card, no image area
  if (card.layout === 'fulltext') {
    return (
      cardStyleTag +
      '<div class="' + cls + '" data-layout="' + card.layout + '" data-id="' + card.id +
      '" style="' + sizeStyle + borderStyle + '">' +
      '<div class="fc-text-area" style="height:' + cardH + 'px;overflow:auto;' + textVAlignStyle + '">' +
      (showTitle ? '<div class="fc-title" style="' + titleStyle + '">' + titleHtml + '</div>' : '') +
      '<div class="fc-sections" style="' + contentStyle + sectionsFlexOverride + '">' + sectionsHtml + '</div>' +
      '</div></div>'
    );
  }

  return (
    cardStyleTag +
    '<div class="' +
    cls +
    '" data-layout="' +
    card.layout +
    '" data-id="' +
    card.id +
    '" style="' +
    sizeStyle +
    borderStyle +
    '">' +
    '<div class="fc-image-area" style="height:' +
    imgH +
    'px;position:relative;' +
    imgAreaPad +
    gridStyle +
    '">' +
    slots +
    handles +
    '</div>' +
    '<div class="fc-text-area" style="' + textVAlignStyle + '">' +
    (showTitle
      ? '<div class="fc-title" style="' + titleStyle + '">' + titleHtml + '</div>'
      : '') +
    '<div class="fc-sections" style="' + contentStyle + sectionsFlexOverride + '">' +
    sectionsHtml +
    '</div></div></div>'
  );
}

// ── N-up sheet tiling (fixed grid + auto-fit) ──────────────────────
const SHEET_GRID: Record<number, [number, number]> = { 1:[1,1], 2:[1,2], 3:[1,3], 4:[2,2], 6:[2,3], 8:[2,4], 9:[3,3], 12:[3,4] };
/** Columns×rows for a fixed N-per-sheet; landscape swaps. Pure. */
export function sheetGrid(n: number, orientation: string): { cols: number; rows: number } {
  let [cols, rows] = SHEET_GRID[n] ?? [1, Math.max(1, n)];
  if (orientation === 'landscape') [cols, rows] = [rows, cols];
  return { cols, rows };
}
/** Resolve grid + cell px for a template's tiling on a sheet. Pure.
 *  fixed grid → cells fill the sheet (fillCell=true); auto-fit → real-size cards packed floor(sheet/card). */
export function sheetLayout(
  opts: { autoFit?: boolean; cardSize?: string; cardsPerPage?: number; gridCols?: number; gridRows?: number },
  sheetSize: string, orientation: string,
): { cols: number; rows: number; cellW: number; cellH: number; perPage: number; fillCell: boolean; sheetW: number; sheetH: number; orient: string } {
  const sheet = getPaperPx(sheetSize, orientation);
  if (opts.autoFit) {
    const card = getPaperPx(opts.cardSize || 'A7', orientation);
    const cols = Math.max(1, Math.floor(sheet.w / card.w));
    const rows = Math.max(1, Math.floor(sheet.h / card.h));
    return { cols, rows, cellW: card.w, cellH: card.h, perPage: cols * rows, fillCell: false, sheetW: sheet.w, sheetH: sheet.h, orient: orientation };
  }
  // Explicit arbitrary grid (user-picked Cols x Rows) wins over the cardsPerPage preset lookup.
  // No landscape swap here — the user chose these dimensions directly.
  if ((opts.gridCols ?? 0) >= 1 && (opts.gridRows ?? 0) >= 1) {
    const cols = Math.max(1, opts.gridCols!);
    const rows = Math.max(1, opts.gridRows!);
    return { cols, rows, cellW: Math.floor(sheet.w / cols), cellH: Math.floor(sheet.h / rows), perPage: cols * rows, fillCell: true, sheetW: sheet.w, sheetH: sheet.h, orient: orientation };
  }
  const { cols, rows } = sheetGrid(Math.max(1, opts.cardsPerPage || 1), orientation);
  return { cols, rows, cellW: Math.floor(sheet.w / cols), cellH: Math.floor(sheet.h / rows), perPage: cols * rows, fillCell: true, sheetW: sheet.w, sheetH: sheet.h, orient: orientation };
}
/** Tile cards into a sheet per a resolved `sheetLayout`. Each cell = buildCardHTML at cell px.
 *  `lay` is the single source of truth for the sheet's own px size (`sheetW`/`sheetH`) — the
 *  container is never re-derived from `cards[0].orientation`, which can go stale vs. `lay`
 *  after the user flips orientation without re-packing. */
export function buildSheetHTML(cards: Card[], lay: { cols: number; rows: number; cellW: number; cellH: number; fillCell: boolean; sheetW: number; sheetH: number }, settings: Settings, locale: string, forPrint = false, overridePx: { w: number; h: number } | null = null): string {
  const { w, h } = overridePx ?? { w: lay.sheetW, h: lay.sheetH };
  const { cols, rows, cellW, cellH } = lay;
  const cells = Array.from({ length: cols * rows }, (_, i) => {
    const card = cards[i];
    const inner = card ? buildCardHTML(card, resolveStyle(settings, card.style), locale, forPrint, { w: cellW, h: cellH }) : '';
    return `<div class="fc-sheet-cell" style="width:${cellW}px;height:${cellH}px;overflow:hidden;">${inner}</div>`;
  }).join('');
  // fixed grid fills the sheet (1fr tracks); auto-fit uses real-size px tracks packed from the top-left.
  const colTrack = lay.fillCell ? 'repeat(' + cols + ',1fr)' : 'repeat(' + cols + ',' + cellW + 'px)';
  const rowTrack = lay.fillCell ? 'repeat(' + rows + ',1fr)' : 'repeat(' + rows + ',' + cellH + 'px)';
  const justify = lay.fillCell ? '' : 'justify-content:start;align-content:start;';
  return `<div class="fc-sheet" style="width:${w}px;height:${h}px;display:grid;grid-template-columns:${colTrack};grid-template-rows:${rowTrack};${justify}background:#fff;overflow:hidden;">${cells}</div>`;
}
