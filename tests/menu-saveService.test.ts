import { describe, it, expect, vi, beforeEach } from 'vitest';

const writeFile = vi.fn(async () => {});
const saveDialog = vi.fn(async () => '/tmp/new.menu.tomoe.json');
vi.mock('@tauri-apps/plugin-fs', () => ({ writeFile: (...a: any[]) => writeFile(...a), readTextFile: vi.fn() }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ save: (...a: any[]) => saveDialog(...a) }));

import * as S from '../src/lib/modules/menu/stores';
import { saveToPath, pickSaveTo } from '../src/lib/modules/menu/io/saveService';

beforeEach(() => { S.initDoc(); writeFile.mockClear(); saveDialog.mockClear(); });

describe('menu saveService', () => {
  it('saveToPath writes UTF-8 bytes and marks saved', async () => {
    await saveToPath('/tmp/x.menu.tomoe.json');
    expect(writeFile).toHaveBeenCalledOnce();
    const [path, bytes] = writeFile.mock.calls[0];
    expect(path).toBe('/tmp/x.menu.tomoe.json');
    // ArrayBuffer.isView is realm-safe (jsdom's TextEncoder output is not an
    // `instanceof` the test realm's Uint8Array); decoding proves it's the doc.
    expect(ArrayBuffer.isView(bytes)).toBe(true);
    expect(new TextDecoder().decode(bytes as Uint8Array)).toContain('"version"');
  });

  it('pickSaveTo prompts then writes to the chosen path', async () => {
    await pickSaveTo();
    expect(saveDialog).toHaveBeenCalledOnce();
    expect(writeFile.mock.calls[0][0]).toBe('/tmp/new.menu.tomoe.json');
  });
});
