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

// ── Card Render (HTML) ─────────────────────────────────────────────
type GridSplit = { row: number; col: number; inner: number };

const GRID_STRATEGIES: Record<string, (r: number, c: number, n: number) => string> = {
  '2x2': (r, c) => `grid-template-rows:${r}% ${100 - r}%;grid-template-columns:${c}% ${100 - c}%;`,
  '1top-1bot': (r) => `grid-template-rows:${r}% ${100 - r}%;`,
  '2top-1bot': (r, _c, n) => `grid-template-rows:${r}% ${100 - r}%;grid-template-columns:${n}% ${100 - n}%;`,
  '1top-2bot': (r, _c, n) => `grid-template-rows:${r}% ${100 - r}%;grid-template-columns:${n}% ${100 - n}%;`,
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

function buildSlots(card: Card, slotCount: number, imgStyle: string, forPrint = false): string {
  return Array.from({ length: slotCount }, (_, i) => {
    const img = card.images.find((im) => im.slot === i);
    if (img && img.url) {
      return (
        '<div class="fc-image-slot fc-image-slot-' + i +
        '"><div class="img-bg" style="background-image:url(\'' + esc(img.url) + '\');' +
        resolveImgStyle(img, imgStyle) +
        'background-repeat:no-repeat;width:100%;height:100%;"></div>' +
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

// ── Compound layouts ───────────────────────────────────────────────
interface CompoundShellArgs {
  cardStyleTag: string;
  cls: string;
  layout: string;
  id: string;
  wrapperStyle: string;
  titleHtml?: string;
  gridClass?: string;
  gridStyle: string;
  cellsHtml: string;
  handlesHtml?: string;
}

// Shared skeleton for every compound layout: style tag + card wrapper +
// optional title + grid container + cells (+ optional drag handles).
function renderCompoundShell(args: CompoundShellArgs): string {
  const { cardStyleTag, cls, layout, id, wrapperStyle, titleHtml = '', gridClass = '', gridStyle, cellsHtml, handlesHtml = '' } = args;
  const clsAttr = gridClass ? ' class="' + gridClass + '"' : '';
  return (
    cardStyleTag +
    '<div class="' + cls + '" data-layout="' + layout + '" data-id="' + id + '" style="' + wrapperStyle + '">' +
    titleHtml +
    '<div' + clsAttr + ' style="' + gridStyle + '">' +
    cellsHtml + handlesHtml +
    '</div></div>'
  );
}

interface CompoundCtx {
  s: Settings;
  forPrint: boolean;
  cls: string;
  id: string;
  cardStyleTag: string;
  wrapperStyle: string;
  titleStyle: string;
  contentStyle: string;
  gap: number;
  imgStyle: string;
  borderCss: string;
  imgPaddingPx: number;
  paddingPx: number;
  locale: string;
}

function build_3card(card: Card, ctx: CompoundCtx): string {
  const { s } = ctx;
  const cols = 3;
  const imgPct = card.imageHeightPercent || 45;
  // fit mode (global setting): title pins top, content pins bottom, image fills the middle with imgPct as a min-height floor
  const fit = !!ctx.s.threeCardFit;
  const imgAreaStyle = fit ? 'flex:1 1 auto;min-height:' + imgPct + '%;' : 'flex:' + imgPct + ';min-height:0;';
  const txtAreaStyle = fit ? 'flex:0 0 auto;' : 'flex:' + (100 - imgPct) + ';min-height:0;';
  const cells = Array.from({ length: cols }, (_, i) => {
    const sec = card.sections[i] || ({ label: '', content: '' } as CardSection);
    const img = card.images.find((im) => im.slot === i);
    const title = resolveLocale(sec.label, ctx.locale);
    const content = resolveLocale(sec.content, ctx.locale);
    const imgUrl = img && img.url ? img.url : '';
    const hasContent = !!(title || imgUrl || (content || '').trim());
    const cellBorderW = (ctx.forPrint && !hasContent) ? 0 : s.border.width;
    const imgBg = imgUrl
      ? '<div class="img-bg" style="background-image:url(\'' + esc(imgUrl) + '\');' + resolveImgStyle(img, ctx.imgStyle) + 'background-repeat:no-repeat;width:100%;height:100%;"></div>'
      : ctx.forPrint ? '' : '<span class="empty-placeholder">📷</span>';
    const cellStyle =
      'box-sizing:border-box;background:white;overflow:hidden;display:flex;flex-direction:column;' +
      'border:' + cellBorderW + 'px ' + ctx.borderCss + ';border-radius:' + s.border.radius + 'px;padding:' + ctx.paddingPx + 'px;';
    return (
      '<div class="fc-image-slot-' + i + '" style="' + cellStyle + '">' +
      (title && !card.hideSectionLabels ? '<div class="fc-title" style="' + ctx.titleStyle + '">' + mdInline(title) + '</div>' : '') +
      '<div style="' + imgAreaStyle + 'overflow:hidden;display:flex;align-items:center;justify-content:center;padding:' + ctx.imgPaddingPx + 'px;background:white;">' +
      imgBg +
      '</div>' +
      '<div class="fc-sections" style="' + txtAreaStyle + 'overflow:hidden;text-align:justify;' + ctx.contentStyle + '">' +
      mdBlock(content) +
      '</div>' +
      '</div>'
    );
  }).join('');
  const gridStyle = 'flex:1;overflow:hidden;display:grid;grid-template-columns:repeat(' + cols + ',1fr);gap:' + ctx.gap + 'px;';
  return renderCompoundShell({
    cardStyleTag: ctx.cardStyleTag, cls: ctx.cls, layout: card.layout, id: ctx.id,
    wrapperStyle: ctx.wrapperStyle,
    titleHtml: '',
    gridClass: '', gridStyle,
    cellsHtml: cells, handlesHtml: '',
  });
}

function buildCompound(card: Card, ctx: CompoundCtx): string | null {
  switch (card.layout) {
    case '3card': return build_3card(card, ctx);
    default: return null;
  }
}

export function buildCardHTML(card: Card, settings: Settings, locale: string, forPrint = false, overridePx: { w: number; h: number } | null = null): string {
  const s = settings;
  const { w, h } = overridePx || getPaperPx(s.paperSize, card.orientation || s.orientation);
  const marginPx = mmToPx(s.margin);
  const paddingPx = mmToPx(s.padding);
  const imgPaddingPx = mmToPx(s.imgPadding ?? 0);
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

  const slots = buildSlots(card, slotCount, imgStyle, forPrint);
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
  const borderCss = s.border.style + ' ' + s.border.color;
  const compoundWrapperStyle =
    'width:' + cardW + 'px;height:' + cardH + 'px;margin:' + marginPx + 'px auto;background:white;padding:0;border:none;';
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
  const titleF = { ...s.titleFont, ...(card.titleFont || {}) };
  const contentF = { ...s.contentFont, ...(card.contentFont || {}) };
  const titleStyle = buildFontOverride(titleF);
  const contentStyle = buildFontOverride(contentF);
  const _cs = `.fc-card[data-id="${card.id}"]`;
  const _h1Rule =
    `${_cs} .fc-section__content h1{margin:0;padding:0;${titleStyle}}` +
    `${_cs} .fc-section__content h2{margin:0;padding:0;${titleStyle}font-size:${Math.round((titleF.size || 14) * 0.85)}px;}` +
    `${_cs} .fc-section__content h3{margin:0;padding:0;${titleStyle}font-size:${Math.round((titleF.size || 14) * 0.75)}px;}`;
  const _labelSizeRule = card.labelSize
    ? `${_cs} .fc-section__label{font-size:${card.labelSize}px}${_cs} .fc-img-label{font-size:${card.labelSize}px}`
    : '';
  const _contentSizeRule = card.contentSize
    ? `${_cs} .fc-section__content{font-size:${card.contentSize}px}`
    : '';
  const _imgLabelFontRule = contentStyle ? `${_cs} .fc-img-label{${contentStyle}}` : '';
  const cardStyleTag = '<style>' + _h1Rule + _labelSizeRule + _contentSizeRule + _imgLabelFontRule + (card.customCss ? _scopeCardCss(card.customCss, card.id) : '') + '</style>';
  const showTitle = !!resolvedTitle && !card.hideTitle;

  const compoundCtx: CompoundCtx = {
    s, forPrint, cls, id: card.id, cardStyleTag,
    wrapperStyle: compoundWrapperStyle,
    titleStyle, contentStyle,
    gap: marginPx,
    imgStyle, borderCss, imgPaddingPx, paddingPx,
    locale,
  };
  const compoundHtml = buildCompound(card, compoundCtx);
  if (compoundHtml !== null) return compoundHtml;

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

  // fulltext: text fills entire card, no image area
  if (card.layout === 'fulltext') {
    return (
      cardStyleTag +
      '<div class="' + cls + '" data-layout="' + card.layout + '" data-id="' + card.id +
      '" style="' + sizeStyle + borderStyle + '">' +
      '<div class="fc-text-area" style="height:' + cardH + 'px;overflow:auto;' + textVAlignStyle + '">' +
      (showTitle ? '<div class="fc-title" style="' + titleStyle + '">' + resolvedTitle + '</div>' : '') +
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
    gridStyle +
    '">' +
    slots +
    handles +
    '</div>' +
    '<div class="fc-text-area" style="' + textVAlignStyle + '">' +
    (showTitle
      ? '<div class="fc-title" style="' + titleStyle + '">' + resolvedTitle + '</div>'
      : '') +
    '<div class="fc-sections" style="' + contentStyle + sectionsFlexOverride + '">' +
    sectionsHtml +
    '</div></div></div>'
  );
}
