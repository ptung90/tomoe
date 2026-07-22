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

/** Downscale a blob to a data URL whose longest side is <= `max`, flattened onto white and always
 *  re-encoded as JPEG. Cards are white, so flattening transparency onto white looks identical while
 *  a JPEG is 2–5× smaller than the equivalent PNG (photos pasted from the web/Pinterest arrive as
 *  PNG for no benefit). Browser-only (Image + canvas). Rejects if the image can't be decoded (e.g.
 *  SVG/TIFF the browser won't render) — callers fall back to the original blob. */
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
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch (e) {
        reject(e instanceof Error ? e : new Error('downscale failed'));
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image decode failed')); };
    img.src = url;
  });
}
