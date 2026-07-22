/** Downscale imported images so a project file doesn't balloon with full-res originals.
 *
 *  Pasting/uploading a photo used to store the ORIGINAL bytes as base64 (a 20–90 MB camera JPEG or
 *  an uncompressed TIFF), so a 30-record project could reach hundreds of MB — the WebView then lags
 *  or can't edit. We cap the longest side and re-encode on import instead. */

/** Target dimensions to fit (w,h) within a `max`×`max` box, preserving aspect ratio; never upscales.
 *  Rounds to whole pixels (min 1). Zero/degenerate input passes through unchanged. Pure. */
export function fitWithin(w: number, h: number, max: number): { w: number; h: number } {
  if (w <= 0 || h <= 0) return { w, h };
  const scale = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

/** Downscale a blob to a data URL whose longest side is <= `max`, re-encoded (JPEG by default;
 *  PNG kept for source PNGs so transparency survives). Browser-only (Image + canvas). Rejects if the
 *  image can't be decoded (e.g. SVG/TIFF the browser won't render) — callers fall back to the
 *  original blob. Already-small images are still normalised through the canvas (cheap). */
export function downscaleBlob(blob: Blob, max = 1600, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        const { w, h } = fitWithin(img.naturalWidth || img.width, img.naturalHeight || img.height, max);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('no 2d context')); return; }
        ctx.drawImage(img, 0, 0, w, h);
        const mime = blob.type === 'image/png' ? 'image/png' : 'image/jpeg';
        resolve(canvas.toDataURL(mime, quality));
      } catch (e) {
        reject(e instanceof Error ? e : new Error('downscale failed'));
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image decode failed')); };
    img.src = url;
  });
}
