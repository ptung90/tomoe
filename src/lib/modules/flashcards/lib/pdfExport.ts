import { jsPDF } from 'jspdf';
import { toCanvas } from 'html-to-image';
import './card-render.css';
import type { Project } from '../model';
import { collectPrintSheets, collectPackedSheets, type PrintSelection } from './printCards';
import { buildSheetHTML, buildPackedSheetHTML, buildAbsSheetHTML, PAPER_MM } from './card-render';
import { applyFlowFit } from './flow-render';
import { withTimeout, heapMB } from './perf';
import { slugifyName } from './filename';
export { timeStamp as pdfStamp } from './filename';

/** Per-sheet render cap (ms). Generous — a real large sheet on a slow machine can take many
 *  seconds — but finite, so a memory-starved hang fails loudly instead of spinning forever. */
const EXPORT_SHEET_TIMEOUT_MS = 45_000;

/** Slug + timestamp filename, e.g. "vong-tuan-hoan-20260715-1042.pdf". Vietnamese-safe. Pure. */
export function pdfFileName(projectName: string, stamp: string): string {
  return `${slugifyName(projectName) || 'cards'}-${stamp}.pdf`;
}


/**
 * Render every printed sheet (N-up tiled, html-to-image, WYSIWYG with the preview) and
 * pack one sheet per PDF page at the sheet's real paper size. Returns the PDF bytes, or
 * null if there are no sheets. Browser/webview only (uses DOM + canvas). Throws on a
 * tainted canvas (a non-CORS remote image) — the caller surfaces that.
 */
export async function exportCardsPdf(project: Project, selection?: PrintSelection, opts?: { compact?: boolean }): Promise<Uint8Array | null> {
  // compact = paper-saving 2D bin-pack (mixed views/sizes/orientation); else the classic per-view grid.
  const sheets = opts?.compact ? collectPackedSheets(project, selection) : collectPrintSheets(project, selection);
  if (!sheets.length) return null;

  const s = project.settings;
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
    for (let i = 0; i < sheets.length; i++) {
      const sheet = sheets[i];
      // The sheet's own paper size/orientation, from `lay`/`settings` (schema-effective —
      // matches the grid buildSheetHTML actually renders, not a re-derivation from card data).
      const paperMm = PAPER_MM[sheet.settings.paperSize] ?? PAPER_MM.A4;
      const landscape = sheet.lay.orient === 'landscape';
      const pageW = landscape ? paperMm.h : paperMm.w;
      const pageH = landscape ? paperMm.w : paperMm.h;
      const px = { w: sheet.lay.sheetW, h: sheet.lay.sheetH };

      host.innerHTML = sheet.pack
        ? buildPackedSheetHTML(sheet.pack, sheet.lay.sheetW, sheet.lay.sheetH, project.activeLocale, true)
        : sheet.abs
          ? buildAbsSheetHTML(sheet.abs, sheet.lay.sheetW, sheet.lay.sheetH, project.activeLocale, true)
          : buildSheetHTML(sheet.cards, sheet.lay, sheet.settings, project.activeLocale, true, px);
      const page = host.firstElementChild as HTMLElement;

      await document.fonts?.ready;
      await new Promise((r) => requestAnimationFrame(() => r(null)));  // let fonts/layout settle before capture
      applyFlowFit(page);  // shrink overflowing flow pages so the PDF matches the on-screen preview

      // Watchdog: on a memory-starved webview the canvas render can hang forever (its backing
      // <img> never fires onload/onerror). Cap each sheet so that surfaces as an actionable error
      // — naming the sheet and heap — instead of an infinite spinner. See lib/perf.ts.
      const canvas = await withTimeout(
        // Pin the capture box to the sheet's exact paper px + force overflow:hidden on the clone, so
        // html-to-image can never grab overflow/scroll below the fold (it otherwise measures the node
        // and would include content that spills past the fixed page height).
        toCanvas(page, {
          pixelRatio: scale, backgroundColor: '#ffffff', cacheBust: false,
          width: px.w, height: px.h, style: { overflow: 'hidden' },
        }),
        EXPORT_SHEET_TIMEOUT_MS,
        () => {
          const mb = heapMB();
          const heap = mb == null ? '' : ` (heap ${mb} MB)`;
          return `Export stalled on sheet ${i + 1}/${sheets.length}${heap}`
            + ` — likely out of memory. Export fewer records or views at a time, or restart the app first.`;
        },
      );
      const data = canvas.toDataURL(mime, quality);

      if (!pdf) pdf = new jsPDF({ unit: 'mm', format: [pageW, pageH], orientation: landscape ? 'l' : 'p' });
      else pdf.addPage([pageW, pageH], landscape ? 'l' : 'p');
      pdf.addImage(data, fmt, 0, 0, pageW, pageH);
    }
    return pdf ? new Uint8Array(pdf.output('arraybuffer')) : null;
  } finally {
    host.remove();
  }
}
