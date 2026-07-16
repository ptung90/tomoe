import { describe, it, expect } from 'vitest';
import { stripImagesForCopy } from '../src/lib/modules/flashcards/lib/copyStrip';
import type { RecordItem } from '../src/lib/modules/flashcards/model';

function rec(fields: RecordItem['fields']): RecordItem {
  return { id: 'r1', schemaId: 's1', fieldsHash: '', fields };
}

describe('stripImagesForCopy', () => {
  const imageKeys = new Set(['pic']);

  it('replaces a base64 data URL in an image field with "[image]"', () => {
    const out = stripImagesForCopy([rec({ pic: 'data:image/png;base64,AAAA' })], imageKeys);
    expect(out[0].fields.pic).toBe('[image]');
  });

  it('keeps a remote http(s) URL in an image field unchanged', () => {
    const out = stripImagesForCopy([rec({ pic: 'https://x/a.jpg' })], imageKeys);
    expect(out[0].fields.pic).toBe('https://x/a.jpg');
  });

  it('keeps an empty image field unchanged', () => {
    const out = stripImagesForCopy([rec({ pic: '' })], imageKeys);
    expect(out[0].fields.pic).toBe('');
  });

  it('leaves non-image string and multilingual fields untouched', () => {
    const out = stripImagesForCopy(
      [rec({ title: { en: 'Owl', vi: 'Cú' }, note: 'data:image/png;base64,ZZ' })],
      imageKeys,
    );
    expect(out[0].fields.title).toEqual({ en: 'Owl', vi: 'Cú' });
    expect(out[0].fields.note).toBe('data:image/png;base64,ZZ'); // 'note' is not an image key
  });

  it('does not mutate the input records', () => {
    const input = [rec({ pic: 'data:image/png;base64,AAAA' })];
    stripImagesForCopy(input, imageKeys);
    expect(input[0].fields.pic).toBe('data:image/png;base64,AAAA');
  });
});
