import { describe, it, expect } from 'vitest';
import { lockPath, parseLock, isStale, isForeign, shouldWarn, LOCK_TTL_MS } from '../src/lib/modules/flashcards/lib/lockFile';

const now = Date.parse('2026-07-17T12:00:00.000Z');
const fresh = { by: 'Alice', at: '2026-07-17T11:59:00.000Z' };  // 1 min ago
const old = { by: 'Alice', at: '2026-07-17T11:00:00.000Z' };    // 60 min ago

describe('lockFile helpers', () => {
  it('lockPath appends .lock', () => {
    expect(lockPath('/data/vn.tomoe.json')).toBe('/data/vn.tomoe.json.lock');
  });
  it('parseLock accepts well-formed and rejects malformed', () => {
    expect(parseLock('{"by":"A","at":"2026"}')).toEqual({ by: 'A', at: '2026' });
    expect(parseLock('{"by":1}')).toBeNull();
    expect(parseLock('not json')).toBeNull();
  });
  it('isStale: fresh is live, old past ttl is stale, bad timestamp is stale', () => {
    expect(isStale(fresh, now)).toBe(false);
    expect(isStale(old, now)).toBe(true);
    expect(isStale({ by: 'A', at: 'nonsense' }, now)).toBe(true);
    expect(isStale(fresh, now, 30_000)).toBe(true); // 1min > 30s ttl
  });
  it('isForeign compares owner', () => {
    expect(isForeign(fresh, 'Bob')).toBe(true);
    expect(isForeign(fresh, 'Alice')).toBe(false);
  });
  it('shouldWarn only for a live, foreign lock', () => {
    expect(shouldWarn(fresh, 'Bob', now)).toBe(true);   // someone else, live
    expect(shouldWarn(fresh, 'Alice', now)).toBe(false); // mine
    expect(shouldWarn(old, 'Bob', now)).toBe(false);     // stale
    expect(shouldWarn(null, 'Bob', now)).toBe(false);    // no lock
  });
  it('LOCK_TTL_MS is 30 minutes', () => {
    expect(LOCK_TTL_MS).toBe(30 * 60_000);
  });
});
