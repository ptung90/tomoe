import { toPng } from 'html-to-image';
import jsPDF from 'jspdf';
import { save as saveDialog } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { renderWeekTable } from '../render';
import { slugifyTitle } from './exportImage';
import { showToast } from '../../../shell';
import type { MenuWeek, MenuTemplate, MenuStyle } from '../model';

export async function exportWeekPdf(week: MenuWeek, template: MenuTemplate, settings: MenuStyle): Promise<void> {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-99999px;top:0;width:1000px;background:#fff;padding:16px;';
  host.innerHTML = renderWeekTable(week, template, settings);
  document.body.appendChild(host);
  try {
    // Wait for webfonts (Lexend) to be ready before rasterizing, else the PNG can capture a
    // fallback font — the same gotcha the flashcards pdfExport path already handles.
    await document.fonts?.ready;
    const dataUrl = await toPng(host, { pixelRatio: 2, backgroundColor: '#ffffff' });
    const landscape = settings.orientation === 'landscape';
    const pdf = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'mm', format: settings.paperSize.toLowerCase() as any });
    const pw = pdf.internal.pageSize.getWidth();
    const margin = 8;
    const imgW = pw - margin * 2;
    // Preserve aspect ratio from the rendered node.
    const ratio = host.offsetHeight / host.offsetWidth || 0.5;
    pdf.addImage(dataUrl, 'PNG', margin, margin, imgW, imgW * ratio);
    const path = await saveDialog({ defaultPath: `${slugifyTitle(week.title)}.pdf`, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    if (!path) return;
    await writeFile(path, new Uint8Array(pdf.output('arraybuffer')));
    showToast('Đã xuất PDF');
  } catch (e) {
    showToast(`Không xuất được PDF: ${(e as Error).message}`, 'error');
  } finally {
    document.body.removeChild(host);
  }
}
