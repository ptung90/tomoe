import type { RecordItem } from '../model';

/** A remote http(s) URL string (the only values worth downloading/embedding). */
export function isRemoteUrl(v: unknown): v is string {
  return typeof v === 'string' && /^https?:\/\//i.test(v);
}

/** Every image-field value across the records that is a remote URL — the embed candidates.
 *  Skips already-embedded `data:` URIs, empty values, and localized (object) values. Pure. */
export function remoteImageRefs(
  records: RecordItem[], imageKeys: string[],
): { recordId: string; key: string; url: string }[] {
  const refs: { recordId: string; key: string; url: string }[] = [];
  for (const r of records)
    for (const key of imageKeys) {
      const v = r.fields[key];
      if (isRemoteUrl(v)) refs.push({ recordId: r.id, key, url: v });
    }
  return refs;
}

/** Fetch a URL and return a base64 data URI. Browser/webview only; needs the host to serve CORS
 *  (flagcdn + Wikimedia both send `access-control-allow-origin: *`). Throws on a non-OK response. */
export async function urlToDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const blob = await res.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export interface EmbedResult {
  updates: { recordId: string; key: string; url: string }[];
  total: number; embedded: number; failed: number;
}

/** Download every remote image URL in the given image fields and convert it to a base64 data URI.
 *  Sequential (gentle on the network, per-item progress). Never throws per item — a failed fetch is
 *  counted and skipped. `toDataUrl` is injectable for tests. The returned `updates` feed straight
 *  into `applyImageAutofill` (one undo step; data URIs auto-dedup into the file's `_assets` on save). */
export async function embedImages(
  records: RecordItem[],
  imageKeys: string[],
  toDataUrl: (url: string) => Promise<string> = urlToDataUrl,
  onProgress?: (done: number, total: number) => void,
): Promise<EmbedResult> {
  const refs = remoteImageRefs(records, imageKeys);
  const total = refs.length;
  const updates: { recordId: string; key: string; url: string }[] = [];
  let embedded = 0;
  let failed = 0;
  let done = 0;
  for (const ref of refs) {
    try {
      const dataUri = await toDataUrl(ref.url);
      updates.push({ recordId: ref.recordId, key: ref.key, url: dataUri });
      embedded++;
    } catch {
      failed++;
    }
    done++;
    onProgress?.(done, total);
  }
  return { updates, total, embedded, failed };
}
