import { describe, it, expect, vi, beforeEach } from 'vitest';

let dirEntries: { name: string; isFile: boolean }[] = [];
const writeFile = vi.fn(async (_p: string, _t: Uint8Array) => {});
const readDir = vi.fn(async (_p: string) => dirEntries);
const remove = vi.fn(async (_p: string) => {});
vi.mock('@tauri-apps/plugin-fs', () => ({
  writeFile: (...a: unknown[]) => (writeFile as (...x: unknown[]) => unknown)(...a),
  readDir: (...a: unknown[]) => (readDir as (...x: unknown[]) => unknown)(...a),
  remove: (...a: unknown[]) => (remove as (...x: unknown[]) => unknown)(...a),
}));

import * as S from '../src/lib/modules/flashcards/stores';
import * as shell from '../src/lib/shell';
import { writeBackup, listBackups } from '../src/lib/modules/flashcards/io/backupService';

beforeEach(() => {
  vi.clearAllMocks(); dirEntries = []; localStorage.clear();
  S.initProject(); S.setProjectName('VN');                 // slug 'vn'
  shell.setBackupEnabled(false); shell.setBackupDir(null); shell.setBackupKeep(20);
});

describe('writeBackup', () => {
  it('is a no-op when backups are disabled', async () => {
    await writeBackup('{}');
    expect(writeFile).not.toHaveBeenCalled();
  });
  it('is a no-op when no folder is set', async () => {
    shell.setBackupEnabled(true);
    await writeBackup('{}');
    expect(writeFile).not.toHaveBeenCalled();
  });
  it('writes a timestamped backup into the folder when enabled', async () => {
    shell.setBackupEnabled(true); shell.setBackupDir('/bk');
    await writeBackup('{"x":1}');
    expect(writeFile).toHaveBeenCalledTimes(1);
    const [path, bytes] = writeFile.mock.calls[0] as [string, Uint8Array];
    expect(path).toMatch(/^\/bk\/vn-\d{4}-\d{2}-\d{2}_\d{2}h\d{2}\.tomoe\.json$/);
    expect(new TextDecoder().decode(bytes)).toBe('{"x":1}');
  });
  it('prunes this project\'s backups beyond keep-N (oldest removed, foreign untouched)', async () => {
    shell.setBackupEnabled(true); shell.setBackupDir('/bk'); shell.setBackupKeep(2);
    dirEntries = [
      { name: 'vn-20260101-0000.tomoe.json', isFile: true },
      { name: 'vn-20260102-0000.tomoe.json', isFile: true },
      { name: 'vn-20260103-0000.tomoe.json', isFile: true },
      { name: 'other-20260103-0000.tomoe.json', isFile: true },
    ];
    await writeBackup('{}');
    expect(remove).toHaveBeenCalledTimes(1);
    expect((remove.mock.calls[0] as [string])[0]).toBe('/bk/vn-20260101-0000.tomoe.json');
  });
});

describe('listBackups', () => {
  it('returns this project\'s backups newest-first', async () => {
    shell.setBackupDir('/bk');
    dirEntries = [
      { name: 'vn-20260101-0000.tomoe.json', isFile: true },
      { name: 'vn-20260103-0000.tomoe.json', isFile: true },
      { name: 'other.tomoe.json', isFile: true },
    ];
    const r = await listBackups();
    expect(r.map((x) => x.name)).toEqual(['vn-20260103-0000.tomoe.json', 'vn-20260101-0000.tomoe.json']);
    expect(r[0].path).toBe('/bk/vn-20260103-0000.tomoe.json');
  });
  it('returns [] when no folder is configured', async () => {
    shell.setBackupDir(null);
    expect(await listBackups()).toEqual([]);
  });
});
