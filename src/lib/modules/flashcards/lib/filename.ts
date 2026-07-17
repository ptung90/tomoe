// Shared filename helpers — a URL/file-safe slug and a sortable timestamp. Pure, no deps
// (kept out of pdfExport so the tiny backup util needn't pull in jsPDF/html-to-image).

/** Vietnamese-safe slug: đ→d, strip diacritics, lowercase, non-alphanumerics → '-'. May be ''. */
export function slugifyName(name: string): string {
  return (name || '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // strip combining diacritics
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** YYYYMMDD-HHmm for a given Date — sorts chronologically as text. Caller supplies `new Date()`. */
export function timeStamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}
