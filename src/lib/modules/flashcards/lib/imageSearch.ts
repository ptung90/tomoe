export interface ImageHit { thumb: string; full: string; title: string }

/** Search Wikimedia Commons images (keyless; origin=* → CORS-safe plain fetch).
 *  Ported from flashcard-creator api.js searchWikimedia. Network errors propagate
 *  (the caller shows an error state); a valid-but-empty response returns []. */
export async function searchWikimedia(query: string, fetchFn: typeof fetch = fetch): Promise<ImageHit[]> {
  const q = query.trim();
  if (!q) return [];
  const url = 'https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrnamespace=6'
    + `&gsrsearch=${encodeURIComponent(q)}&gsrlimit=20&prop=imageinfo&iiprop=url%7Cthumburl`
    + '&iiurlwidth=300&format=json&origin=*';
  const res = await fetchFn(url);
  const data = (await res.json()) as { query?: { pages?: Record<string, {
    title?: string; imageinfo?: { url?: string; thumburl?: string }[];
  }> } };
  const pages = data?.query?.pages;
  if (!pages) return [];
  const hits: ImageHit[] = [];
  for (const key of Object.keys(pages)) {
    const info = pages[key]?.imageinfo?.[0];
    if (info?.thumburl && info?.url) hits.push({ thumb: info.thumburl, full: info.url, title: pages[key].title ?? '' });
  }
  return hits;
}
