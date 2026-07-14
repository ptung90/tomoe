export type Locale = string;
export type LocalizedText = string | Record<Locale, string>;
export interface FontSpec { family: string; size: number; weight?: number; color: string; lineHeight: number; textAlign?: string }
export interface Settings {
  paperSize: 'A4'|'A5'|'A6'|'Letter'; orientation: 'portrait'|'landscape';
  margin: number; padding: number; imgPadding: number;
  textVAlign: 'top'|'middle'|'bottom'; threeCardFit: boolean;
  border: { width: number; style: string; color: string; radius: number };
  image: { backgroundSize: string; backgroundPosition: string };
  titleFont: FontSpec; contentFont: FontSpec;
  pdfImageFormat: 'jpeg'|'png'; pdfJpegQuality: number; pdfScale: number; customCss: string;
}
export interface SchemaField { id: string; key: string; label: string; type: 'text'|'text-long'|'image'; multilingual?: boolean }
export interface CardTemplate { id: string; templateType: 'single'|'compound'; layout: string; locale?: string; size?: string|null; orientation?: string; hideTitle?: boolean; hideSectionLabels?: boolean; cardClass?: string|null; cardConfig?: Record<string, unknown>; mapping: { titleSlot?: string; labelSlot?: string; textSlot?: string; imageSlot?: string; imageSlots?: string[]; sections?: string[] } }
export interface Schema { id: string; name: string; fields: SchemaField[]; cardTemplates: CardTemplate[] }
export interface RecordItem { id: string; schemaId: string; fieldsHash: string; fields: Record<string, LocalizedText> }
export interface CardSection { id: string; label: LocalizedText; content: LocalizedText; recordId?: string; customClass?: string; fontSize?: number; textAlign?: string; labelSize?: number }
export interface CardImage { slot: number; url: string; recordId?: string; size?: string|null; color?: string; attribution?: unknown; search_query?: string }
export interface Card { id: string; layout: string; imageHeightPercent: number; imageGridSplit?: { row: number; col: number; inner: number; rowBorders?: boolean }; images: CardImage[]; title: LocalizedText; sections: CardSection[]; orientation?: string|null; hideTitle?: boolean; hideSectionLabels?: boolean; titleFont?: FontSpec|null; contentFont?: FontSpec|null; customCss?: string; cssClass?: string; recordId?: string; templateId?: string; packedRecordIds?: string[]; sourceHash?: string; [k: string]: unknown }
export interface Project { version: number; projectName: string; projectIcon: string; settings: Settings; schemas: Schema[]; records: RecordItem[]; cards: Card[]; locales: Locale[]; activeLocale: Locale }

export const DEFAULT_SETTINGS: Settings = {
  paperSize: 'A5', orientation: 'portrait', margin: 9, padding: 2, imgPadding: 0,
  textVAlign: 'middle', threeCardFit: false,
  border: { width: 4, style: 'double', color: '#6B21A8', radius: 0 },
  image: { backgroundSize: 'cover', backgroundPosition: 'center' },
  titleFont: { family: 'sans-serif', size: 14, weight: 700, color: '#1a1a1a', lineHeight: 1.0 },
  contentFont: { family: 'sans-serif', size: 12, weight: 400, color: '#1a1a1a', lineHeight: 1.1 },
  pdfImageFormat: 'jpeg', pdfJpegQuality: 0.85, pdfScale: 2, customCss: '',
};
let _n = 0;
export function uid(prefix = 'id'): string { _n += 1; const r = Math.abs(Math.floor((performance.now()*1000)%1e9)).toString(36); return `${prefix}_${_n.toString(36)}${r}`; }
export function newProject(): Project {
  return { version: 1, projectName: 'Untitled', projectIcon: '🗂️', settings: structuredClone(DEFAULT_SETTINGS), schemas: [], records: [], cards: [], locales: ['en','vi'], activeLocale: 'en' };
}
export function serializeProject(p: Project): string { return JSON.stringify(p, null, 2) + '\n'; }
export function parseProject(text: string): Project {
  const raw = JSON.parse(text) as any; const base = newProject();
  const s = raw.settings || {};
  const settings: Settings = { ...base.settings, ...s,
    border: { ...base.settings.border, ...(s.border||{}) },
    image: { ...base.settings.image, ...(s.image||{}) },
    titleFont: { ...base.settings.titleFont, ...(s.titleFont||{}) },
    contentFont: { ...base.settings.contentFont, ...(s.contentFont||{}) } };
  return { version: typeof raw.version==='number'?raw.version:1,
    projectName: raw.projectName ?? raw.project_name ?? base.projectName,
    projectIcon: raw.projectIcon ?? raw.project_icon ?? base.projectIcon,
    settings, schemas: raw.schemas ?? [], records: raw.records ?? [], cards: raw.cards ?? [],
    locales: raw.locales ?? base.locales, activeLocale: raw.activeLocale ?? base.activeLocale };
}
export function looksLikeFlashcards(text: string): boolean {
  try { const o = JSON.parse(text); return !!o && typeof o==='object' && Array.isArray(o.schemas) && Array.isArray(o.cards); }
  catch { return false; }
}
