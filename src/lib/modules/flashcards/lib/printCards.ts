import type { Project, Card, Schema, Settings } from '../model';
import { deriveAutoTemplate, recordToCard, chunkRecords } from '../cardMapping';
import { sheetLayout } from './card-render';
import { resolveStyle } from './style';

/** A schema's views, in order — its real cardTemplates, or a single derived one if it has none yet. */
function viewsFor(schema: Schema) {
  return schema.cardTemplates.length ? schema.cardTemplates : [deriveAutoTemplate(schema)];
}

/** Every card the Cards gallery shows, in schema -> view -> record order — one card per
 *  (record x view): the persisted (packed) card if one exists, else an auto-derived one. Pure. */
export function collectPrintCards(project: Project): Card[] {
  const out: Card[] = [];
  for (const schema of project.schemas) {
    const recs = project.records.filter((r) => r.schemaId === schema.id);
    for (const template of viewsFor(schema)) {
      for (const rec of recs) {
        const packed = project.cards.find((c) => c.recordId === rec.id && c.templateId === template.id);
        out.push(packed ?? recordToCard(rec, schema, template, project.settings, project.activeLocale));
      }
    }
  }
  return out;
}

/** One card on a packed leftover page, carrying the NATIVE cell size + style of its source view so
 *  it renders exactly as it does on that view's own pages (no uniform-grid resize). */
export interface PackItem { card: Card; cellW: number; cellH: number; settings: Settings; }

/** A printed page. Normally a uniform N-up grid (`lay` + `cards`). When `pack` is set the page is a
 *  flow-packed leftover: cards from different-grid views combined onto one sheet, each kept at its
 *  own size/style (`cards`/`settings`/`lay` are still filled for count, paper geometry and captions). */
export interface Sheet { cards: Card[]; lay: ReturnType<typeof sheetLayout>; settings: Settings; pack?: PackItem[]; }

/** Optional export filter — include only the given view ids and/or record ids. An unset field means
 *  "all" for that dimension; an empty Set means "none". */
export interface PrintSelection { views?: Set<string>; records?: Set<string> }

/** Every printed sheet, grouped by view (all of view 1's sheets, then view 2's, ...), each in the
 *  view's own resolved N-up layout, filtered by `selection`. Pure — collectPrintSheets applies the
 *  leftover merge on top. */
function sheetsByView(project: Project, selection?: PrintSelection): Sheet[] {
  const out: Sheet[] = [];
  for (const schema of project.schemas) {
    const recs = project.records.filter((r) => r.schemaId === schema.id
      && (!selection?.records || selection.records.has(r.id)));
    for (const template of viewsFor(schema)) {
      if (selection?.views && !selection.views.has(template.id)) continue;
      if (!recs.length) continue;   // this view has no selected records → no sheets
      const schemaEff = resolveStyle(project.settings, template.style);
      const orient = schemaEff.orientation;
      const lay = sheetLayout(template, schemaEff.paperSize, orient);
      const cards = recs.map((r) =>
        project.cards.find((c) => c.recordId === r.id && c.templateId === template.id) ??
        recordToCard(r, schema, template, project.settings, project.activeLocale));
      for (const chunk of chunkRecords(cards, lay.perPage)) out.push({ cards: chunk, lay, settings: schemaEff });
    }
  }
  return out;
}

/** Signature of every resolved-style field that per-cell rendering actually consumes (see
 *  resolveStyle/buildSheetHTML→buildCardHTML) — border, image, fonts, margin/padding/imgPadding,
 *  textVAlign, paraGap. paperSize/orientation are already part of the geometry key below, and the
 *  PDF export-only fields (pdfImageFormat/pdfJpegQuality/pdfScale/customCss) don't affect the on-page
 *  cell look, so they're deliberately excluded. Deterministic (plain JSON.stringify, fixed key order). */
function styleSignature(s: Settings): string {
  return JSON.stringify({
    margin: s.margin, padding: s.padding, imgPadding: s.imgPadding, paraGap: s.paraGap, imgTextGap: s.imgTextGap,
    textVAlign: s.textVAlign, border: s.border, image: s.image,
    titleFont: s.titleFont, contentFont: s.contentFont,
  });
}

/** Leftover "bucket" key — trailing partials merge across views as long as they share the same paper,
 *  orientation AND resolved per-cell style (border/fonts/etc.). Grid geometry (cols/rows/cell px) is
 *  deliberately NOT part of the key: a sheet renders every cell at one size with one style, so cards
 *  from different-grid views can still share a leftover page (each cell renders its own card layout).
 *  Style stays in the key because merging views with different borders/fonts would repaint one view's
 *  cards with the other's look. */
function leftoverKey(s: Sheet): string {
  return `${s.settings.paperSize}|${s.lay.orient}|${styleSignature(s.settings)}`;
}

/** Exact grid geometry of a sheet — two partials with the same one merge into a uniform grid. */
function gridKey(lay: Sheet['lay']): string {
  return `${lay.cols}x${lay.rows}x${lay.cellW}x${lay.cellH}`;
}

/** Shelf-pack items (each already sized to its native cell) into pages: fill a row left-to-right,
 *  wrap when the next item overflows the width, start a new page when it overflows the height. Cards
 *  are never resized or split. Mirrors the flex-wrap render in buildPackedSheetHTML. Pure. */
export function packLeftovers(items: PackItem[], sheetW: number, sheetH: number): PackItem[][] {
  const pages: PackItem[][] = [];
  let cur: PackItem[] = [];
  let x = 0, y = 0, rowH = 0;
  for (const it of items) {
    if (x > 0 && x + it.cellW > sheetW) { y += rowH; x = 0; rowH = 0; }             // wrap to next row
    if (cur.length > 0 && y + it.cellH > sheetH) { pages.push(cur); cur = []; x = 0; y = 0; rowH = 0; } // new page
    cur.push(it); x += it.cellW; rowH = Math.max(rowH, it.cellH);
  }
  if (cur.length) pages.push(cur);
  return pages;
}

/** Combine trailing partial (not-full) sheets that share paper + orientation + style into fewer
 *  pages, appended after every view's full sheets. Partials with the SAME grid merge into a uniform
 *  grid (unchanged cell size). Partials with DIFFERENT grids are flow-PACKED (`pack`): every card
 *  keeps its own native size + style — no card is resized to a common cell. A partial alone in its
 *  bucket keeps its own page. Full sheets are never reshuffled or reordered. Deterministic: order
 *  follows the input `sheets` order (schema -> view). Pure. */
export function mergeLeftoverSheets(sheets: Sheet[]): Sheet[] {
  const full: Sheet[] = [];
  const partials: Sheet[] = [];
  for (const s of sheets) {
    if (s.cards.length >= s.lay.perPage) full.push(s);
    else partials.push(s);
  }
  if (!partials.length) return full;

  const buckets = new Map<string, Sheet[]>();
  const order: string[] = [];
  for (const p of partials) {
    const key = leftoverKey(p);
    if (!buckets.has(key)) { buckets.set(key, []); order.push(key); }
    buckets.get(key)!.push(p);
  }

  const merged: Sheet[] = [];
  for (const key of order) {
    const group = buckets.get(key)!;
    if (group.length === 1) { merged.push(group[0]); continue; }
    const uniform = group.every((s) => gridKey(s.lay) === gridKey(group[0].lay));
    if (uniform) {
      // Same grid → re-tile into full uniform pages (cell size unchanged).
      const allCards = group.flatMap((s) => s.cards);
      for (const chunk of chunkRecords(allCards, group[0].lay.perPage))
        merged.push({ cards: chunk, lay: group[0].lay, settings: group[0].settings });
    } else {
      // Mixed grids → flow-pack, keeping each card's native size + style.
      const items: PackItem[] = group.flatMap((s) =>
        s.cards.map((card) => ({ card, cellW: s.lay.cellW, cellH: s.lay.cellH, settings: s.settings })));
      const { sheetW, sheetH } = group[0].lay;
      for (const pageItems of packLeftovers(items, sheetW, sheetH))
        merged.push({ cards: pageItems.map((it) => it.card), lay: group[0].lay, settings: group[0].settings, pack: pageItems });
    }
  }
  return [...full, ...merged];
}

/** Every printed sheet -- grouped by view, with each group's trailing partial page merged across
 *  same-layout views (fewer, fuller pages on export/print). Pure. */
export function collectPrintSheets(project: Project, selection?: PrintSelection): Sheet[] {
  return mergeLeftoverSheets(sheetsByView(project, selection));
}
