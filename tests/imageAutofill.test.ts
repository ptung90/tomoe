import { describe, it, expect, vi } from 'vitest';
import { resolveQuery, autofill } from '../src/lib/modules/flashcards/lib/imageAutofill';
import type { RecordItem } from '../src/lib/modules/flashcards/model';
import type { ImageHit } from '../src/lib/modules/flashcards/lib/imageSearch';

const hit = (u: string): ImageHit => ({ thumb: u + '_t', full: u, title: 't' });
function rec(id: string, fields: RecordItem['fields']): RecordItem {
  return { id, schemaId: 's1', fieldsHash: '', fields };
}

describe('resolveQuery', () => {
  it('returns the active-locale string of a multilingual field, trimmed', () => {
    expect(resolveQuery(rec('r', { title: { en: '  Owl ', vi: 'Cú' } }), 'title', 'en')).toBe('Owl');
  });
  it('falls back to the first non-empty locale when active is blank', () => {
    expect(resolveQuery(rec('r', { title: { en: '', vi: 'Cú' } }), 'title', 'en')).toBe('Cú');
  });
  it('handles a plain string field', () => {
    expect(resolveQuery(rec('r', { title: 'Owl' }), 'title', 'en')).toBe('Owl');
  });
  it('returns "" when all values are blank or missing', () => {
    expect(resolveQuery(rec('r', { title: { en: '', vi: '' } }), 'title', 'en')).toBe('');
    expect(resolveQuery(rec('r', {}), 'title', 'en')).toBe('');
  });
});

describe('autofill', () => {
  const opts = { queryKey: 'title', imageKey: 'pic', overwrite: false, locale: 'en' };

  it('fills only records whose image field is empty when overwrite=false', async () => {
    const records = [
      rec('a', { title: { en: 'Owl' }, pic: '' }),
      rec('b', { title: { en: 'Cat' }, pic: 'https://old/x.jpg' }),
    ];
    const search = vi.fn(async (q: string) => [hit('https://img/' + q + '.jpg')]);
    const res = await autofill(records, opts, search);
    expect(res.updates).toEqual([{ recordId: 'a', url: 'https://img/Owl.jpg' }]);
    expect(res.filled).toBe(1);
    expect(res.skippedHasImage).toBe(1);
    expect(search).toHaveBeenCalledTimes(1);
  });

  it('fills records that already have an image when overwrite=true', async () => {
    const records = [rec('b', { title: { en: 'Cat' }, pic: 'https://old/x.jpg' })];
    const search = vi.fn(async () => [hit('https://img/cat.jpg')]);
    const res = await autofill(records, { ...opts, overwrite: true }, search);
    expect(res.updates).toEqual([{ recordId: 'b', url: 'https://img/cat.jpg' }]);
    expect(res.filled).toBe(1);
  });

  it('counts skippedEmptyQuery when the query field is blank', async () => {
    const records = [rec('a', { title: { en: '' }, pic: '' })];
    const search = vi.fn(async () => [hit('https://img/x.jpg')]);
    const res = await autofill(records, opts, search);
    expect(res.skippedEmptyQuery).toBe(1);
    expect(res.filled).toBe(0);
    expect(search).not.toHaveBeenCalled();
  });

  it('counts noResult when search returns [] or throws', async () => {
    const records = [rec('a', { title: { en: 'Owl' }, pic: '' }), rec('b', { title: { en: 'Cat' }, pic: '' })];
    const search = vi.fn()
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('network'));
    const res = await autofill(records, opts, search);
    expect(res.noResult).toBe(2);
    expect(res.filled).toBe(0);
    expect(res.updates).toEqual([]);
  });

  it('reports progress once per record', async () => {
    const records = [rec('a', { title: { en: 'Owl' }, pic: '' }), rec('b', { title: { en: 'Cat' }, pic: '' })];
    const onProgress = vi.fn();
    await autofill(records, opts, vi.fn(async () => [hit('https://img/x.jpg')]), onProgress);
    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenLastCalledWith(2, 2);
  });
});
