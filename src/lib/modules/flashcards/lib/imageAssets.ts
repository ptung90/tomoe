/** Deduplicated base64 image store for the project file.
 *
 *  Records and every packed card can hold the SAME base64 image string — a card copies its source
 *  record's image, once per schema view (see cardMapping.recordToCard). A naive JSON save writes
 *  each blob many times, and a naive parse creates a DISTINCT string object per occurrence, so the
 *  file and the WebView heap both grow with (records + cards×views). On a low-RAM machine that
 *  exhausts the renderer heap mid-session (the save/export stalls; a restart temporarily clears it).
 *
 *  deflateAssets pools each unique `data:` URL once (returned separately, to store under `_assets`)
 *  and replaces every occurrence with a compact ref. inflateAssets restores them by the SAME
 *  reference, so all occurrences share ONE string in memory. Both are pure and structure-preserving;
 *  a value with no `data:` URLs deflates to an empty pool (old files without `_assets` stay
 *  compatible — inflateAssets with an absent/empty pool is a faithful deep copy). */

// A whole field value equal to this prefix + an integer never occurs in real content, so a stored
// ref can't collide with user text and deflate never needs to escape existing field values.
const REF_PREFIX = '@@tomoe-asset:';

const isDataUrl = (v: unknown): v is string => typeof v === 'string' && v.startsWith('data:');
const refFor = (i: number): string => REF_PREFIX + i;
function refIndex(v: unknown): number | null {
  if (typeof v !== 'string' || !v.startsWith(REF_PREFIX)) return null;
  const n = Number(v.slice(REF_PREFIX.length));
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/** Deep-copy `value`, replacing each `data:` URL with a ref and collecting the unique blobs. */
export function deflateAssets(value: unknown): { data: unknown; assets: string[] } {
  const assets: string[] = [];
  const index = new Map<string, number>();
  const walk = (v: unknown): unknown => {
    if (isDataUrl(v)) {
      let i = index.get(v);
      if (i === undefined) { i = assets.length; assets.push(v); index.set(v, i); }
      return refFor(i);
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const o: Record<string, unknown> = {};
      for (const k of Object.keys(v)) o[k] = walk((v as Record<string, unknown>)[k]);
      return o;
    }
    return v;
  };
  return { data: walk(value), assets };
}

/** Deep-copy `value`, replacing each ref with `assets[i]` — the SAME string object every time, so
 *  all occurrences share one string in the heap. Refs out of range or malformed are left as-is. */
export function inflateAssets(value: unknown, assets: string[]): unknown {
  const pool = Array.isArray(assets) ? assets : [];
  const walk = (v: unknown): unknown => {
    const i = refIndex(v);
    if (i !== null) return i < pool.length ? pool[i] : v;
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const o: Record<string, unknown> = {};
      for (const k of Object.keys(v)) o[k] = walk((v as Record<string, unknown>)[k]);
      return o;
    }
    return v;
  };
  return walk(value);
}
