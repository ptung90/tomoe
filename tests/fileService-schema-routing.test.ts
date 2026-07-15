import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(() => Promise.resolve(() => {})) }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(() => Promise.resolve(null)) }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn(), confirm: vi.fn(() => Promise.resolve(true)) }));
const readTextFile = vi.fn();
vi.mock('@tauri-apps/plugin-fs', () => ({ readTextFile: (...a: unknown[]) => readTextFile(...a) }));
const importSchemaFileText = vi.fn();
vi.mock('../src/lib/modules/flashcards/stores', () => ({ importSchemaFileText: (...a: unknown[]) => importSchemaFileText(...a) }));
const openMock = vi.fn();
const pickModuleForOpen = vi.fn((..._a: unknown[]) => ({ id: 'json-table', open: openMock }));
vi.mock('../src/lib/modules/registry', () => ({
  pickModuleForOpen: (...a: unknown[]) => pickModuleForOpen(...a),
  getModule: vi.fn(),
}));
const showToast = vi.fn();
vi.mock('../src/lib/shell', async (orig) => {
  const actual = await orig<typeof import('../src/lib/shell')>();
  return { ...actual, showToast: (...a: unknown[]) => showToast(...a) };
});

import { openPath } from '../src/lib/fileService';
import { recentFiles } from '../src/lib/recentFiles';
import { setActiveModule } from '../src/lib/shell';

beforeEach(() => {
  localStorage.clear();
  recentFiles.set([]);
  setActiveModule(null);
  readTextFile.mockReset();
  openMock.mockReset();
  importSchemaFileText.mockReset();
  pickModuleForOpen.mockClear();
  showToast.mockReset();
});

describe('openPath — schema-file routing', () => {
  it('a .schema.json path is imported into the library and never reaches module routing', async () => {
    readTextFile.mockResolvedValue('{"tomoeSchema":1,"schema":{"name":"Words","fields":[],"cardTemplates":[]},"settings":{}}');
    importSchemaFileText.mockReturnValue({ ok: true, name: 'Words' });
    await openPath('/shared/words.schema.json');
    expect(importSchemaFileText).toHaveBeenCalled();
    expect(pickModuleForOpen).not.toHaveBeenCalled();
    expect(openMock).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith("Added 'Words' to the schema library");
    expect(get(recentFiles)).toEqual([]); // not recorded as a recent project file
  });

  it('content with the tomoeSchema marker is gated even without a .schema.json extension', async () => {
    readTextFile.mockResolvedValue('{"tomoeSchema":1,"schema":{"name":"X","fields":[],"cardTemplates":[]},"settings":{}}');
    importSchemaFileText.mockReturnValue({ ok: true, name: 'X' });
    await openPath('/downloads/emailed-file.json');
    expect(importSchemaFileText).toHaveBeenCalled();
    expect(pickModuleForOpen).not.toHaveBeenCalled();
  });

  it('shows an error toast and still skips module routing when the schema file is malformed', async () => {
    readTextFile.mockResolvedValue('not json');
    importSchemaFileText.mockReturnValue({ ok: false, error: 'Not a valid Tomoe schema file' });
    await openPath('/shared/broken.schema.json');
    expect(showToast).toHaveBeenCalledWith('Not a valid Tomoe schema file', 'error');
    expect(pickModuleForOpen).not.toHaveBeenCalled();
  });

  it('regression: a normal .tomoe.json still routes to a module', async () => {
    readTextFile.mockResolvedValue('{"projectName":"P"}');
    await openPath('/data/thing.tomoe.json');
    expect(pickModuleForOpen).toHaveBeenCalled();
    expect(openMock).toHaveBeenCalled();
    expect(importSchemaFileText).not.toHaveBeenCalled();
  });

  it('regression: a generic .json project file still routes to a module', async () => {
    readTextFile.mockResolvedValue('{"foo":1}');
    await openPath('/data/thing.json');
    expect(pickModuleForOpen).toHaveBeenCalled();
    expect(openMock).toHaveBeenCalled();
  });
});
