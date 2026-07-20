import { describe, it, expect, vi, beforeEach } from 'vitest';

const toPng = vi.fn(async () => 'data:image/png;base64,iVBORw0KGgo=');
const saveDialog = vi.fn(async (): Promise<string | null> => '/tmp/tuan-2.png');
const writeFile = vi.fn(async () => {});
vi.mock('html-to-image', () => ({ toPng: (...a: unknown[]) => (toPng as (...x: unknown[]) => unknown)(...a) }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ save: (...a: unknown[]) => (saveDialog as (...x: unknown[]) => unknown)(...a) }));
vi.mock('@tauri-apps/plugin-fs', () => ({ writeFile: (...a: unknown[]) => (writeFile as (...x: unknown[]) => unknown)(...a) }));

import { exportWeekPng, slugifyTitle } from '../src/lib/modules/menu/export/exportImage';
import { newMenuDoc } from '../src/lib/modules/menu/model';

beforeEach(() => { toPng.mockClear(); saveDialog.mockClear(); writeFile.mockClear(); });

describe('menu PNG export', () => {
  it('slugifyTitle strips Vietnamese diacritics + punctuation', () => {
    expect(slugifyTitle('Thực đơn tháng 6 - Tuần 2')).toBe('thuc-don-thang-6-tuan-2');
  });
  it('renders, rasterizes and writes decoded PNG bytes', async () => {
    const { template, settings } = newMenuDoc();
    await exportWeekPng({ id: 'w', title: 'Tuần 2', cells: {} }, template, settings);
    expect(toPng).toHaveBeenCalledOnce();
    expect(saveDialog).toHaveBeenCalledOnce();
    expect((writeFile.mock.calls[0] as unknown[])[1]).toBeInstanceOf(Uint8Array);
  });
  it('does nothing if the save dialog is cancelled', async () => {
    saveDialog.mockResolvedValueOnce(null as any);
    const { template, settings } = newMenuDoc();
    await exportWeekPng({ id: 'w', title: 'T', cells: {} }, template, settings);
    expect(writeFile).not.toHaveBeenCalled();
  });
});
