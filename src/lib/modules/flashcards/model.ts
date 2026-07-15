import { LAYOUT_IDS } from './lib/layouts';

export type Locale = string;
export type LocalizedText = string | Record<Locale, string>;
export interface FontSpec { family: string; size: number; weight?: number; color: string; lineHeight: number; textAlign?: string }
export interface Settings {
  paperSize: 'A4'|'A5'|'A6'|'Letter'; orientation: 'portrait'|'landscape';
  margin: number; padding: number; imgPadding: number;
  /** Vertical gap (px) between content paragraphs; the last paragraph gets none. */
  paraGap: number;
  textVAlign: 'top'|'middle'|'bottom';
  border: { width: number; style: string; color: string; radius: number };
  image: { backgroundSize: string; backgroundPosition: string };
  titleFont: FontSpec; contentFont: FontSpec;
  pdfImageFormat: 'jpeg'|'png'; pdfJpegQuality: number; pdfScale: number; customCss: string;
}
export interface SchemaField { id: string; key: string; label: string; type: 'text'|'text-long'|'image'; multilingual?: boolean }
/** Partial style layer for the cascade (Global settings → per-schema template.style → per-card card.style).
 *  Resolved per-property via `resolveStyle`; nested groups (border/image/fonts) merge field-by-field. */
export interface StyleOverrides {
  border?: Partial<Settings['border']>;
  image?: Partial<Settings['image']>;
  titleFont?: Partial<FontSpec>;
  contentFont?: Partial<FontSpec>;
  margin?: number; padding?: number; imgPadding?: number; paraGap?: number;
  textVAlign?: 'top' | 'middle' | 'bottom';
  paperSize?: Settings['paperSize'];
  orientation?: Settings['orientation'];
}
export interface CardTemplate { id: string; templateType: 'single'|'compound'; layout: string; locale?: string; size?: string|null; orientation?: string; imageHeightPercent?: number; hideTitle?: boolean; hideSectionLabels?: boolean; cardClass?: string|null; cardConfig?: Record<string, unknown>; cardsPerPage?: number; autoFit?: boolean; cardSize?: 'A4'|'A5'|'A6'|'A7'|'A8'|'Letter'; style?: StyleOverrides; mapping: { titleSlot?: string; labelSlot?: string; textSlot?: string; imageSlot?: string; imageSlots?: string[]; sections?: string[] } }
export interface Schema { id: string; name: string; fields: SchemaField[]; cardTemplates: CardTemplate[] }
export interface RecordItem { id: string; schemaId: string; fieldsHash: string; fields: Record<string, LocalizedText> }
export interface CardSection { id: string; label: LocalizedText; content: LocalizedText; recordId?: string; customClass?: string; fontSize?: number; textAlign?: string; labelSize?: number }
export interface CardImage { slot: number; url: string; recordId?: string; size?: string|null; color?: string; attribution?: unknown; search_query?: string }
export interface Card { id: string; layout: string; imageHeightPercent: number; imageGridSplit?: { row: number; col: number; inner: number; rowBorders?: boolean }; images: CardImage[]; title: LocalizedText; sections: CardSection[]; orientation?: string|null; hideTitle?: boolean; hideSectionLabels?: boolean; style?: StyleOverrides; /** legacy: only read by parseProject migration (folded into `style.titleFont`/`style.contentFont`); never written */ titleFont?: FontSpec|null; /** legacy: see titleFont */ contentFont?: FontSpec|null; customCss?: string; cssClass?: string; recordId?: string; templateId?: string; /** legacy/read-only: only read by parseProject to drop old compound-card snapshots; never written */ packedRecordIds?: string[]; sourceHash?: string; edited?: boolean; [k: string]: unknown }
export interface Project { version: number; projectName: string; projectIcon: string; settings: Settings; schemas: Schema[]; records: RecordItem[]; cards: Card[]; locales: Locale[]; activeLocale: Locale }

export const DEFAULT_SETTINGS: Settings = {
  paperSize: 'A5', orientation: 'portrait', margin: 9, padding: 2, imgPadding: 0,
  paraGap: 2,
  textVAlign: 'middle',
  border: { width: 4, style: 'double', color: '#6B21A8', radius: 0 },
  image: { backgroundSize: 'cover', backgroundPosition: 'center' },
  titleFont: { family: 'Lexend', size: 14, weight: 700, color: '#1a1a1a', lineHeight: 1.0 },
  contentFont: { family: 'Lexend', size: 12, weight: 400, color: '#1a1a1a', lineHeight: 1.1 },
  pdfImageFormat: 'jpeg', pdfJpegQuality: 0.85, pdfScale: 2, customCss: '',
};
let _n = 0;
export function uid(prefix = 'id'): string { _n += 1; const r = Math.abs(Math.floor((performance.now()*1000)%1e9)).toString(36); return `${prefix}_${_n.toString(36)}${r}`; }
export function newProject(): Project {
  return { version: 1, projectName: 'Untitled', projectIcon: '🗂️', settings: structuredClone(DEFAULT_SETTINGS), schemas: [], records: [], cards: [], locales: ['en','vi'], activeLocale: 'en' };
}
export function serializeProject(p: Project): string { return JSON.stringify(p, null, 2) + '\n'; }

// ── Migration: removed compound/3card layouts → single-card + cardsPerPage ──
const COMPOUND_MIGRATION: Record<string, { layout: string; cardsPerPage: number }> = {
  '3card':     { layout: 'title-img-text', cardsPerPage: 3 },
  '2img-2txt': { layout: '1top-1bot', cardsPerPage: 2 },
  '3img-3txt': { layout: '1top-1bot', cardsPerPage: 3 },
  'img3-txt3': { layout: '1top-1bot', cardsPerPage: 3 },
  '6cell':     { layout: '1top-1bot', cardsPerPage: 6 },
  '8img-8txt': { layout: '1top-1bot', cardsPerPage: 8 },
  'txtgrid':   { layout: 'fulltext',  cardsPerPage: 12 },
};
function migrateTemplate(t: any, schemaHasImage: boolean): CardTemplate {
  const m = COMPOUND_MIGRATION[t?.layout];
  let out: any = t;
  if (m) out = { ...out, layout: m.layout, cardsPerPage: out.cardsPerPage ?? m.cardsPerPage, templateType: 'single' };
  else if (!LAYOUT_IDS.includes(out?.layout)) out = { ...out, layout: schemaHasImage ? '1top-1bot' : 'fulltext' };
  // Fold legacy per-template orientation into style.orientation (cascade single source) and drop the top-level field.
  if (out?.orientation !== undefined) {
    const style = out.style?.orientation !== undefined ? out.style : { ...(out.style ?? {}), orientation: out.orientation };
    const { orientation, ...rest } = out;
    out = { ...rest, style };
  }
  return out;
}

export function parseProject(text: string): Project {
  const raw = JSON.parse(text) as any; const base = newProject();
  const s = raw.settings || {};
  const settings: Settings = { ...base.settings, ...s,
    border: { ...base.settings.border, ...(s.border||{}) },
    image: { ...base.settings.image, ...(s.image||{}) },
    titleFont: { ...base.settings.titleFont, ...(s.titleFont||{}) },
    contentFont: { ...base.settings.contentFont, ...(s.contentFont||{}) } };

  const normSchema = (sc: any): Schema => {
    const fields = Array.isArray(sc.fields) ? sc.fields : [];
    const schemaHasImage = fields.some((f: SchemaField) => f.type === 'image');
    const cardTemplates = (Array.isArray(sc.cardTemplates) ? sc.cardTemplates : [])
      .map((t: any) => migrateTemplate(t, schemaHasImage));
    return { ...sc, id: sc.id || uid('sch'), name: sc.name || 'Records', fields, cardTemplates };
  };
  // Legacy flashcard-creator single-schema files use `schema` (object) instead of `schemas`.
  let schemas: Schema[];
  const rawRecords: any[] = Array.isArray(raw.records) ? raw.records : [];
  if (raw.schema && typeof raw.schema === 'object' && !Array.isArray(raw.schemas)) {
    schemas = [normSchema(raw.schema)];
  } else {
    schemas = (Array.isArray(raw.schemas) ? raw.schemas : []).map(normSchema);
  }
  const fallbackSchemaId = schemas[0]?.id ?? '';
  const records: RecordItem[] = rawRecords.map((r) => ({
    id: r.id || uid('rec'),
    schemaId: r.schemaId ?? fallbackSchemaId,
    fieldsHash: r.fieldsHash ?? '',
    fields: r.fields ?? {},
  }));

  // Drop persisted compound card snapshots (packedRecordIds) — one Card = one record now.
  // Remap any surviving card's layout that referenced a removed compound layout.
  // Fold legacy per-card titleFont/contentFont into card.style (cascade) and drop the old top-level fields.
  const cards: Card[] = (Array.isArray(raw.cards) ? raw.cards : [])
    .filter((c: any) => !(c.packedRecordIds?.length))
    .map((c: any) => (COMPOUND_MIGRATION[c.layout] ? { ...c, layout: COMPOUND_MIGRATION[c.layout].layout } : c))
    .map((c: any) => {
      const legacy = (c.titleFont || c.contentFont)
        ? { ...(c.style ?? {}), ...(c.titleFont ? { titleFont: c.titleFont } : {}), ...(c.contentFont ? { contentFont: c.contentFont } : {}) }
        : c.style;
      const { titleFont, contentFont, ...rest } = c;
      return legacy ? { ...rest, style: legacy } : rest;
    });

  return { version: typeof raw.version==='number'?raw.version:1,
    projectName: raw.projectName ?? raw.project_name ?? base.projectName,
    projectIcon: raw.projectIcon ?? raw.project_icon ?? base.projectIcon,
    settings, schemas, records, cards,
    locales: raw.locales ?? base.locales, activeLocale: raw.activeLocale ?? base.activeLocale };
}
export function looksLikeFlashcards(text: string): boolean {
  try {
    const o = JSON.parse(text);
    if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
    // project_name/project_icon are on every flashcard-creator save; projectName/projectIcon on Tomoe's.
    if ('project_name' in o || 'project_icon' in o || 'projectName' in o || 'projectIcon' in o) return true;
    if (Array.isArray(o.schemas) && Array.isArray(o.records)) return true;              // schema+records project
    if (Array.isArray(o.cards) && (Array.isArray(o.schemas) || o.settings)) return true; // packed project
    if (o.schema && typeof o.schema === 'object' && Array.isArray(o.records)) return true; // legacy single-schema
    return false;
  } catch { return false; }
}
