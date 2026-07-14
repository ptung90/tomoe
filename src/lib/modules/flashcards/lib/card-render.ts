import { marked } from 'marked';
import type { Card, Settings, CardSection, CardImage, FontSpec, LocalizedText } from '../model';

export const PAPER_MM: Record<string, { w: number; h: number }> = {
  A4: { w: 210, h: 297 }, A5: { w: 148, h: 210 }, A6: { w: 105, h: 148 }, Letter: { w: 216, h: 279 },
};

export const LAYOUTS = ['fulltext', 'fullimage', '2x2', '1top-1bot', '1top-2bot', '2top-1bot', '3card'] as const;

export const LAYOUT_SLOTS: Record<string, number> = {
  fulltext: 0, fullimage: 1, '2x2': 4, '1top-1bot': 2, '1top-2bot': 3, '2top-1bot': 3, '3card': 3,
};

export const LAYOUT_SPLIT_DEFAULTS: Record<string, { row: number; col: number; inner: number }> = {
  fulltext: { row: 0, col: 50, inner: 50 }, fullimage: { row: 100, col: 100, inner: 50 },
  '2x2': { row: 50, col: 50, inner: 50 }, '1top-1bot': { row: 50, col: 50, inner: 50 },
  '1top-2bot': { row: 50, col: 50, inner: 50 }, '2top-1bot': { row: 50, col: 50, inner: 50 },
  '3card': { row: 50, col: 33, inner: 33 },
};

export function getPaperPx(paperSize: string, orientation: string): { w: number; h: number } {
  let { w, h } = PAPER_MM[paperSize] || PAPER_MM.A4;
  if (orientation === 'landscape') [w, h] = [h, w];
  return { w: Math.round((w / 25.4) * 96), h: Math.round((h / 25.4) * 96) };
}

export function mmToPx(mm: number): number { return Math.round((mm / 25.4) * 96); }

export function esc(str: unknown): string {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function resolveLocale(val: LocalizedText | undefined | null, locale: string): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'object') return val[locale] ?? '';
  return val;
}

export function mdInline(text: string): string { return marked.parseInline(text || '', { async: false }) as string; }
export function mdBlock(text: string): string {
  if (!text) return '';
  if (text.trimStart().startsWith('<')) return text;
  return marked.parse(text, { async: false, breaks: false }) as string;
}
