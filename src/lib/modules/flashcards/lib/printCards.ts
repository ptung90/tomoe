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

export interface Sheet { cards: Card[]; lay: ReturnType<typeof sheetLayout>; settings: Settings; }

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
    margin: s.margin, padding: s.padding, imgPadding: s.imgPadding, paraGap: s.paraGap,
    textVAlign: s.textVAlign, border: s.border, image: s.image,
    titleFont: s.titleFont, contentFont: s.contentFont,
  });
}

/** Layout "bucket" key — sheets only merge with others sharing the exact same paper + grid geometry
 *  AND the same resolved per-cell style (border/fonts/etc.) — two views can share geometry but look
 *  different (e.g. different border width), and their leftover pages must not blend those looks. */
function layoutKey(s: Sheet): string {
  return `${s.settings.paperSize}|${s.lay.orient}|${s.lay.cols}|${s.lay.rows}|${s.lay.cellW}|${s.lay.cellH}|${styleSignature(s.settings)}`;
}

/** Re-tile trailing partial (not-full) sheets that share the same paper/grid layout into fewer,
 *  more-filled pages, appended after every view's full sheets. A partial sheet whose layout key is
 *  unique among the partials keeps its own page. Full sheets are never reshuffled or reordered.
 *  Deterministic: iteration/merge order follows the input `sheets` order (i.e. schema -> view order). Pure. */
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
    const key = layoutKey(p);
    if (!buckets.has(key)) { buckets.set(key, []); order.push(key); }
    buckets.get(key)!.push(p);
  }

  const merged: Sheet[] = [];
  for (const key of order) {
    const group = buckets.get(key)!;
    if (group.length === 1) { merged.push(group[0]); continue; }
    const perPage = group[0].lay.perPage;
    const allCards = group.flatMap((s) => s.cards);
    for (const chunk of chunkRecords(allCards, perPage)) merged.push({ cards: chunk, lay: group[0].lay, settings: group[0].settings });
  }
  return [...full, ...merged];
}

/** Every printed sheet -- grouped by view, with each group's trailing partial page merged across
 *  same-layout views (fewer, fuller pages on export/print). Pure. */
export function collectPrintSheets(project: Project, selection?: PrintSelection): Sheet[] {
  return mergeLeftoverSheets(sheetsByView(project, selection));
}
