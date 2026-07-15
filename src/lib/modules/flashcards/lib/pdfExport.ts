import { jsPDF } from 'jspdf';
import { toCanvas } from 'html-to-image';
import './card-render.css';
import type { Project } from '../model';
import { collectPrintCards } from './printCards';
import { buildCardHTML, getPaperPx, PAPER_MM } from './card-render';

/** Slug + timestamp filename, e.g. "vong-tuan-hoan-20260715-1042.pdf". Vietnamese-safe. Pure. */
export function pdfFileName(projectName: string, stamp: string): string {
  const slug = (projectName || '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // strip combining diacritics
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'cards';
  return `${slug}-${stamp}.pdf`;
}

/** YYYYMMDD-HHmm for a given Date (caller supplies `new Date()` at runtime). Pure. */
export function pdfStamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

/**
 * Render every gallery card to a bitmap (html-to-image, WYSIWYG with the preview) and
 * pack one card per page into a PDF at real paper size. Returns the PDF bytes, or null
 * if there are no cards. Browser/webview only (uses DOM + canvas). Throws on a tainted
 * canvas (a non-CORS remote image) — the caller surfaces that.
 */
export async function exportCardsPdf(project: Project): Promise<Uint8Array | null> {
  const cards = collectPrintCards(project);
  if (!cards.length) return null;

  const s = project.settings;
  const portrait = PAPER_MM[s.paperSize] ?? PAPER_MM.A4;
  const scale = s.pdfScale || 2;
  const usePng = s.pdfImageFormat === 'png';
  const fmt: 'PNG' | 'JPEG' = usePng ? 'PNG' : 'JPEG';
  const mime = usePng ? 'image/png' : 'image/jpeg';
  const quality = s.pdfJpegQuality ?? 0.85;

  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;z-index:-1;';
  document.body.appendChild(host);

  let pdf: jsPDF | null = null;
  try {
    for (const card of cards) {
      const orient = (card.orientation as string) || s.orientation;
      const landscape = orient === 'landscape';
      const px = getPaperPx(s.paperSize, orient);
      const pageW = landscape ? portrait.h : portrait.w;
      const pageH = landscape ? portrait.w : portrait.h;

      host.innerHTML =
        `<div style="width:${px.w}px;height:${px.h}px;background:#fff;overflow:hidden;">` +
        buildCardHTML(card, s, project.activeLocale, true, px) +
        `</div>`;
      const page = host.firstElementChild as HTMLElement;

      await document.fonts?.ready;
      await new Promise((r) => requestAnimationFrame(() => r(null)));  // let fonts/layout settle before capture

      const canvas = await toCanvas(page, { pixelRatio: scale, backgroundColor: '#ffffff', cacheBust: false });
      const data = canvas.toDataURL(mime, quality);

      if (!pdf) pdf = new jsPDF({ unit: 'mm', format: [portrait.w, portrait.h], orientation: landscape ? 'l' : 'p' });
      else pdf.addPage([portrait.w, portrait.h], landscape ? 'l' : 'p');
      pdf.addImage(data, fmt, 0, 0, pageW, pageH);
    }
    return pdf ? new Uint8Array(pdf.output('arraybuffer')) : null;
  } finally {
    host.remove();
  }
}
