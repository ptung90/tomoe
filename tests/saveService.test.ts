import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

// ── Tauri + shell mocks (saveService touches fs/dialog/toast) ──
let diskText: string | null = '{"disk":true}';
const readTextFile = vi.fn(async (_p: string) => { if (diskText === null) throw new Error('nofile'); return diskText; });
const writeTextFile = vi.fn(async (_p: string, _t: string) => {});
const saveDialog = vi.fn(async () => '/new/copy.tomoe.json');
vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: (...a: unknown[]) => (readTextFile as (...x: unknown[]) => unknown)(...a),
  writeTextFile: (...a: unknown[]) => (writeTextFile as (...x: unknown[]) => unknown)(...a),
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({ save: (...a: unknown[]) => (saveDialog as (...x: unknown[]) => unknown)(...a) }));
vi.mock('../src/lib/shell', () => ({ showToast: vi.fn() }));

import * as S from '../src/lib/modules/flashcards/stores';
import * as svc from '../src/lib/modules/flashcards/io/saveService';
import { newProject, serializeProject } from '../src/lib/modules/flashcards/model';
import { hashContent } from '../src/lib/modules/flashcards/lib/fileSync';

beforeEach(() => {
  vi.clearAllMocks();
  diskText = '{"disk":true}';
  S.initProject();
});

describe('saveService.saveToPath', () => {
  it('writes when the on-disk content still matches the baseline', async () => {
    S.diskBaselineHash.set(hashContent(diskText as string)); // no external change
    await svc.saveToPath('/p.tomoe.json');
    expect(writeTextFile).toHaveBeenCalledTimes(1);
    expect(get(S.saveConflict)).toBeNull();
  });

  it('raises a conflict and does NOT write when the on-disk content changed externally', async () => {
    S.diskBaselineHash.set(hashContent('{"old":true}')); // baseline differs from diskText
    diskText = '{"theirs":true}';
    await svc.saveToPath('/p.tomoe.json');
    expect(writeTextFile).not.toHaveBeenCalled();
    expect(get(S.saveConflict)).toEqual({ path: '/p.tomoe.json', diskText: '{"theirs":true}' });
  });

  it('writes normally when the file is missing/unreadable (no baseline conflict)', async () => {
    diskText = null; // readDisk throws -> treated as no conflict
    S.diskBaselineHash.set(hashContent('{"whatever":true}'));
    await svc.saveToPath('/p.tomoe.json');
    expect(writeTextFile).toHaveBeenCalledTimes(1);
    expect(get(S.saveConflict)).toBeNull();
  });
});

describe('saveService conflict resolutions', () => {
  it('resolveOverwrite writes our version and clears the conflict', async () => {
    S.saveConflict.set({ path: '/p.tomoe.json', diskText: '{"theirs":true}' });
    await svc.resolveOverwrite();
    expect(writeTextFile).toHaveBeenCalledTimes(1);
    expect(get(S.saveConflict)).toBeNull();
  });

  it('resolveReload loads the on-disk version and clears the conflict (no write)', () => {
    const theirs = serializeProject({ ...newProject(), projectName: 'Theirs' });
    S.saveConflict.set({ path: '/p.tomoe.json', diskText: theirs });
    svc.resolveReload();
    expect(get(S.project).projectName).toBe('Theirs');
    expect(get(S.filePath)).toBe('/p.tomoe.json');
    expect(get(S.diskBaselineHash)).toBe(hashContent(theirs));
    expect(get(S.saveConflict)).toBeNull();
    expect(writeTextFile).not.toHaveBeenCalled();
  });

  it('resolveCancel clears the conflict without writing', () => {
    S.saveConflict.set({ path: '/p.tomoe.json', diskText: '{"theirs":true}' });
    svc.resolveCancel();
    expect(get(S.saveConflict)).toBeNull();
    expect(writeTextFile).not.toHaveBeenCalled();
  });
});
