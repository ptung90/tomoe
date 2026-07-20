import { describe, it, expect, vi } from 'vitest';
import { isRemoteUrl, remoteImageRefs, embedImages } from '../src/lib/modules/flashcards/lib/embedImages';
import type { RecordItem } from '../src/lib/modules/flashcards/model';

const rec = (id: string, fields: Record<string, unknown>): RecordItem =>
  ({ id, schemaId: 's1', fieldsHash: '', fields: fields as RecordItem['fields'] });

describe('isRemoteUrl', () => {
  it('true only for http(s) strings', () => {
    expect(isRemoteUrl('https://x/a.png')).toBe(true);
    expect(isRemoteUrl('http://x/a.png')).toBe(true);
    expect(isRemoteUrl('data:image/png;base64,AAA')).toBe(false);
    expect(isRemoteUrl('')).toBe(false);
    expect(isRemoteUrl(undefined)).toBe(false);
    expect(isRemoteUrl({ vi: 'https://x' })).toBe(false);
  });
});

describe('remoteImageRefs', () => {
  it('collects only remote-URL image-field values across records × keys', () => {
    const records = [
      rec('r1', { image: 'https://f/vn.png', name: 'VN' }),
      rec('r2', { image: 'data:image/png;base64,AA' }), // already embedded → skip
      rec('r3', { image: '' }),                          // empty → skip
      rec('r4', { image: 'https://f/kr.png', flag2: 'https://f/x.png' }),
    ];
    expect(remoteImageRefs(records, ['image', 'flag2'])).toEqual([
      { recordId: 'r1', key: 'image', url: 'https://f/vn.png' },
      { recordId: 'r4', key: 'image', url: 'https://f/kr.png' },
      { recordId: 'r4', key: 'flag2', url: 'https://f/x.png' },
    ]);
  });
});

describe('embedImages', () => {
  it('converts each remote URL via toDataUrl → updates + counts + progress', async () => {
    const records = [rec('r1', { image: 'https://f/vn.png' }), rec('r2', { image: 'https://f/kr.png' })];
    const toDataUrl = vi.fn(async (u: string) => 'data:img,' + u);
    const prog: Array<[number, number]> = [];
    const res = await embedImages(records, ['image'], toDataUrl, (d, t) => prog.push([d, t]));
    expect(res).toEqual({
      total: 2, embedded: 2, failed: 0,
      updates: [
        { recordId: 'r1', key: 'image', url: 'data:img,https://f/vn.png' },
        { recordId: 'r2', key: 'image', url: 'data:img,https://f/kr.png' },
      ],
    });
    expect(prog).toEqual([[1, 2], [2, 2]]);
  });

  it('counts failures and skips them (never throws)', async () => {
    const records = [rec('r1', { image: 'https://f/ok.png' }), rec('r2', { image: 'https://f/bad.png' })];
    const toDataUrl = vi.fn(async (u: string) => { if (u.includes('bad')) throw new Error('boom'); return 'data:ok'; });
    const res = await embedImages(records, ['image'], toDataUrl);
    expect(res.embedded).toBe(1);
    expect(res.failed).toBe(1);
    expect(res.updates).toEqual([{ recordId: 'r1', key: 'image', url: 'data:ok' }]);
  });

  it('no remote URLs → empty result, toDataUrl never called', async () => {
    const records = [rec('r1', { image: 'data:x' }), rec('r2', { image: '' })];
    const toDataUrl = vi.fn();
    const res = await embedImages(records, ['image'], toDataUrl);
    expect(res).toEqual({ updates: [], total: 0, embedded: 0, failed: 0 });
    expect(toDataUrl).not.toHaveBeenCalled();
  });
});
