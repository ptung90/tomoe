import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

let lockText: string | null = null;
const readTextFile = vi.fn(async (_p: string) => { if (lockText === null) throw new Error('nolock'); return lockText; });
const writeTextFile = vi.fn(async (_p: string, _t: string) => {});
const remove = vi.fn(async (_p: string) => {});
vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: (...a: unknown[]) => (readTextFile as (...x: unknown[]) => unknown)(...a),
  writeTextFile: (...a: unknown[]) => (writeTextFile as (...x: unknown[]) => unknown)(...a),
  remove: (...a: unknown[]) => (remove as (...x: unknown[]) => unknown)(...a),
}));
vi.mock('../src/lib/shell', () => ({
  userName: { subscribe: (run: (v: string) => void) => { run('Me'); return () => {}; } },
}));

import * as S from '../src/lib/modules/flashcards/stores';
import * as lock from '../src/lib/modules/flashcards/io/lockService';

beforeEach(() => { vi.clearAllMocks(); lockText = null; S.initProject(); });

describe('checkAndAcquireLock', () => {
  it('acquires when there is no existing lock', async () => {
    await lock.checkAndAcquireLock('/p.tomoe.json');
    expect(writeTextFile).toHaveBeenCalledTimes(1);
    expect(get(S.openLock)).toBeNull();
  });
  it('raises openLock and does NOT acquire when a live foreign lock exists', async () => {
    lockText = JSON.stringify({ by: 'Alice', at: new Date().toISOString() });
    await lock.checkAndAcquireLock('/p.tomoe.json');
    expect(writeTextFile).not.toHaveBeenCalled();
    expect(get(S.openLock)).toMatchObject({ by: 'Alice' });
  });
  it('acquires when the existing lock is stale', async () => {
    lockText = JSON.stringify({ by: 'Alice', at: '2000-01-01T00:00:00.000Z' });
    await lock.checkAndAcquireLock('/p.tomoe.json');
    expect(writeTextFile).toHaveBeenCalledTimes(1);
    expect(get(S.openLock)).toBeNull();
  });
  it('acquires (refresh) when the lock is our own', async () => {
    lockText = JSON.stringify({ by: 'Me', at: new Date().toISOString() });
    await lock.checkAndAcquireLock('/p.tomoe.json');
    expect(writeTextFile).toHaveBeenCalledTimes(1);
    expect(get(S.openLock)).toBeNull();
  });
});

describe('lock resolutions', () => {
  it('resolveOpenReadOnly sets read-only and clears the prompt (no lock taken)', () => {
    S.openLock.set({ by: 'Alice', at: '1' });
    lock.resolveOpenReadOnly();
    expect(get(S.readOnly)).toBe(true);
    expect(get(S.openLock)).toBeNull();
    expect(writeTextFile).not.toHaveBeenCalled();
  });
  it('resolveEditAnyway clears read-only + prompt and takes the lock', async () => {
    S.openLock.set({ by: 'Alice', at: '1' });
    S.filePath.set('/p.tomoe.json');
    await lock.resolveEditAnyway();
    expect(get(S.readOnly)).toBe(false);
    expect(get(S.openLock)).toBeNull();
    expect(writeTextFile).toHaveBeenCalledTimes(1);
  });
});

describe('releaseLock', () => {
  it('removes the lock only when it is ours', async () => {
    lockText = JSON.stringify({ by: 'Me', at: '1' });
    await lock.releaseLock('/p.tomoe.json');
    expect(remove).toHaveBeenCalledTimes(1);
  });
  it('does NOT remove a foreign lock', async () => {
    lockText = JSON.stringify({ by: 'Alice', at: '1' });
    await lock.releaseLock('/p.tomoe.json');
    expect(remove).not.toHaveBeenCalled();
  });
});
