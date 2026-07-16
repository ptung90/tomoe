import type { RecordItem } from '../model';

/** Return copies of `records` with base64 image-field values replaced by the
 *  literal "[image]". Only fields whose key is in `imageKeys` are considered,
 *  and only `data:` URLs are rewritten — remote URLs and empty values are kept
 *  (short + useful as context). Non-image fields are never touched. Immutable. */
export function stripImagesForCopy(records: RecordItem[], imageKeys: Set<string>): RecordItem[] {
  return records.map((r) => {
    const fields: RecordItem['fields'] = {};
    for (const [k, v] of Object.entries(r.fields)) {
      fields[k] = imageKeys.has(k) && typeof v === 'string' && v.startsWith('data:') ? '[image]' : v;
    }
    return { ...r, fields };
  });
}
