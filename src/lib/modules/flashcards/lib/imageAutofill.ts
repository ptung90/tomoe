import type { RecordItem } from '../model';
import type { ImageHit } from './imageSearch';

export interface AutofillOptions {
  queryKey: string;   // schema field key used to build the search query
  imageKey: string;   // target image field key to write
  overwrite: boolean; // also fill records that already have an image
  locale: string;     // active locale, for resolving the query text
}
export interface AutofillResult {
  updates: { recordId: string; url: string }[];
  filled: number;
  skippedEmptyQuery: number;
  skippedHasImage: number;
  noResult: number;
}

/** Resolve a record field to a plain query string: the active-locale value of a
 *  multilingual field, falling back to the first non-empty locale, then "". */
export function resolveQuery(rec: RecordItem, fieldKey: string, locale: string): string {
  const v = rec.fields[fieldKey];
  if (typeof v === 'string') return v.trim();
  if (v && typeof v === 'object') {
    const at = (v[locale] ?? '').trim();
    if (at) return at;
    for (const val of Object.values(v)) { const s = String(val ?? '').trim(); if (s) return s; }
  }
  return '';
}

/** Sequentially search an image for each record and collect top-1 hits. Never
 *  throws: a per-record search error counts as noResult and the batch continues. */
export async function autofill(
  records: RecordItem[],
  opts: AutofillOptions,
  search: (q: string) => Promise<ImageHit[]>,
  onProgress?: (done: number, total: number) => void,
): Promise<AutofillResult> {
  const res: AutofillResult = { updates: [], filled: 0, skippedEmptyQuery: 0, skippedHasImage: 0, noResult: 0 };
  const total = records.length;
  let done = 0;
  for (const rec of records) {
    const existing = rec.fields[opts.imageKey];
    const hasImage = typeof existing === 'string' && existing.trim() !== '';
    if (hasImage && !opts.overwrite) {
      res.skippedHasImage += 1;
    } else {
      const query = resolveQuery(rec, opts.queryKey, opts.locale);
      if (!query) {
        res.skippedEmptyQuery += 1;
      } else {
        try {
          const hits = await search(query);
          if (hits.length > 0) { res.updates.push({ recordId: rec.id, url: hits[0].full }); res.filled += 1; }
          else res.noResult += 1;
        } catch { res.noResult += 1; }
      }
    }
    done += 1;
    onProgress?.(done, total);
  }
  return res;
}
