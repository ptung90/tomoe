import { describe, it, expect, vi } from 'vitest';
import { searchWikimedia } from '../src/lib/modules/flashcards/lib/imageSearch';

const sample = {
  query: { pages: {
    '1': { title: 'File:Owl.jpg', imageinfo: [{ url: 'https://x/Owl.jpg', thumburl: 'https://x/Owl_300.jpg' }] },
    '2': { title: 'File:Cat.jpg', imageinfo: [{ url: 'https://x/Cat.jpg', thumburl: 'https://x/Cat_300.jpg' }] },
    '3': { title: 'File:NoInfo.jpg' }, // no imageinfo → skipped
  } },
};
const fetchOk = (body: unknown) => vi.fn(async () => ({ json: async () => body })) as unknown as typeof fetch;

describe('searchWikimedia', () => {
  it('parses Commons pages into ImageHit[] (thumb/full/title), skipping entries without imageinfo', async () => {
    const hits = await searchWikimedia('owl', fetchOk(sample));
    expect(hits).toHaveLength(2);
    expect(hits[0]).toMatchObject({ thumb: 'https://x/Owl_300.jpg', full: 'https://x/Owl.jpg', title: 'File:Owl.jpg' });
  });
  it('returns [] for a blank query without calling fetch', async () => {
    const fetchFn = vi.fn();
    expect(await searchWikimedia('   ', fetchFn as unknown as typeof fetch)).toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it('returns [] for a response with no query.pages (no throw)', async () => {
    expect(await searchWikimedia('owl', fetchOk({}))).toEqual([]);
  });
  it('encodes the query in the request url', async () => {
    const fetchFn = vi.fn(async () => ({ json: async () => sample })) as unknown as typeof fetch;
    await searchWikimedia('a b', fetchFn);
    expect((fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain('gsrsearch=a%20b');
  });
});
