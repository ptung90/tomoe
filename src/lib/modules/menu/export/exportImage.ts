import { toPng } from 'html-to-image';
import { save as saveDialog } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { renderWeekTable } from '../render';
import { showToast } from '../../../shell';
import type { MenuWeek, MenuTemplate, MenuStyle } from '../model';

export function slugifyTitle(title: string): string {
  return title.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'd')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'thuc-don';
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const b64 = dataUrl.split(',')[1] ?? '';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Render the week table into a detached, offscreen node at a fixed width on white, rasterize,
 *  then prompt + write. Width is fixed so the PNG is crisp and consistent regardless of viewport. */
export async function exportWeekPng(
  week: MenuWeek, template: MenuTemplate, settings: MenuStyle, opts?: { width?: number; pixelRatio?: number },
): Promise<void> {
  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:-99999px;top:0;width:${opts?.width ?? 1000}px;background:#fff;padding:16px;`;
  host.innerHTML = renderWeekTable(week, template, settings);
  document.body.appendChild(host);
  try {
    // Wait for webfonts (Lexend) to be ready before rasterizing, else the PNG can capture a
    // fallback font — the same gotcha the flashcards pdfExport path already handles.
    await document.fonts?.ready;
    const dataUrl = await toPng(host, { pixelRatio: opts?.pixelRatio ?? 2, backgroundColor: '#ffffff' });
    const path = await saveDialog({ defaultPath: `${slugifyTitle(week.title)}.png`, filters: [{ name: 'PNG', extensions: ['png'] }] });
    if (!path) return;
    await writeFile(path, dataUrlToBytes(dataUrl));
    showToast('Đã xuất PNG');
  } catch (e) {
    showToast(`Không xuất được ảnh: ${(e as Error).message}`, 'error');
  } finally {
    document.body.removeChild(host);
  }
}
