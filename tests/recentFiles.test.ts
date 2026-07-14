import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { basename, pushRecent, recentFiles, recordRecent, removeRecent, clearRecent, type RecentFile } from '../src/lib/recentFiles';

describe('basename', () => {
  it('handles posix and windows separators', () => {
    expect(basename('/a/b/c.tomoe.json')).toBe('c.tomoe.json');
    expect(basename('C:\\x\\y\\z.json')).toBe('z.json');
    expect(basename('bare.json')).toBe('bare.json');
  });
});

describe('pushRecent', () => {
  const mk = (p: string, ts: number): RecentFile => ({ path: p, name: basename(p), ts });
  it('adds newest-first with name + ts', () => {
    const out = pushRecent([], '/a/x.json', 100);
    expect(out).toEqual([{ path: '/a/x.json', name: 'x.json', ts: 100 }]);
  });
  it('dedupes by path, moving an existing entry to the top', () => {
    const list = [mk('/a.json', 1), mk('/b.json', 2)];
    const out = pushRecent(list, '/b.json', 3);
    expect(out.map((r) => r.path)).toEqual(['/b.json', '/a.json']);
    expect(out).toHaveLength(2);
  });
  it('caps at 10', () => {
    let list: RecentFile[] = [];
    for (let i = 0; i < 15; i++) list = pushRecent(list, `/f${i}.json`, i);
    expect(list).toHaveLength(10);
    expect(list[0].path).toBe('/f14.json');
  });
});

describe('recentFiles store', () => {
  beforeEach(() => { localStorage.clear(); clearRecent(); });
  it('recordRecent persists + updates the store (newest-first)', () => {
    recordRecent('/a/x.json'); recordRecent('/a/y.json');
    expect(get(recentFiles).map((r) => r.path)).toEqual(['/a/y.json', '/a/x.json']);
    expect(JSON.parse(localStorage.getItem('tomoe.recentFiles')!)).toHaveLength(2);
  });
  it('removeRecent drops one; clearRecent empties', () => {
    recordRecent('/a.json'); recordRecent('/b.json');
    removeRecent('/a.json');
    expect(get(recentFiles).map((r) => r.path)).toEqual(['/b.json']);
    clearRecent();
    expect(get(recentFiles)).toEqual([]);
    expect(JSON.parse(localStorage.getItem('tomoe.recentFiles')!)).toEqual([]);
  });
});
