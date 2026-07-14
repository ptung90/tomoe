import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(() => Promise.resolve(() => {})) }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(() => Promise.resolve(null)) }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn(), confirm: vi.fn(() => Promise.resolve(true)) }));
const readTextFile = vi.fn();
vi.mock('@tauri-apps/plugin-fs', () => ({ readTextFile: (...a: unknown[]) => readTextFile(...a) }));
const openMock = vi.fn();
vi.mock('../src/lib/modules/registry', () => ({
  pickModuleForOpen: () => ({ id: 'json-table', open: openMock }),
  getModule: vi.fn(),
}));

import { openPath } from '../src/lib/fileService';
import { recentFiles } from '../src/lib/recentFiles';
import { setActiveModule } from '../src/lib/shell';
import { get } from 'svelte/store';

beforeEach(() => { localStorage.clear(); recentFiles.set([]); setActiveModule(null); readTextFile.mockReset(); openMock.mockReset(); });

describe('openPath records recent files', () => {
  it('records the path after a successful open', async () => {
    readTextFile.mockResolvedValue('{"foo":1}');
    await openPath('/data/thing.json');
    expect(openMock).toHaveBeenCalled();
    expect(get(recentFiles).map((r) => r.path)).toEqual(['/data/thing.json']);
  });
  it('does NOT record when the read fails', async () => {
    readTextFile.mockRejectedValue(new Error('nope'));
    await openPath('/data/missing.json');
    expect(get(recentFiles)).toEqual([]);
  });
});
