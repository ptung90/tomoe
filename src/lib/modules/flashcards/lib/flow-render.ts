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
