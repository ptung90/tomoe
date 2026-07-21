// Declarative registry of the single-card layouts. No `marked`/render deps —
// safe for `model.ts` (migration) to import without pulling in the render engine.
export interface LayoutDef {
  id: string; label: string; slots: number;
  split: { row: number; col: number; inner: number };
  hideTitle?: boolean;
}
export const LAYOUTS: LayoutDef[] = [
  { id: 'fulltext',    label: 'Text only',                slots: 0, split: { row: 0,   col: 50, inner: 50 }, hideTitle: true },
  { id: 'fullimage',   label: 'Image only',               slots: 1, split: { row: 100, col: 100, inner: 50 }, hideTitle: true },
  { id: '1full',       label: 'Image + text',             slots: 1, split: { row: 100, col: 100, inner: 50 } },
  // Like 1full (main image + title + content) but with extra flag images pinned to the top-right
  // corner: slot 0 = main image, slots ≥1 (extra image fields) = corner flags. One record can carry
  // several flags (e.g. a Himalaya photo shared by multiple countries).
  { id: 'img-text-flags', label: 'Image + text + corner flags', slots: 1, split: { row: 100, col: 100, inner: 50 } },
  { id: 'title-img-text', label: 'Title / image / text',  slots: 1, split: { row: 50,  col: 50, inner: 50 } },
  { id: '1top-1bot',   label: 'Image top / text bottom',  slots: 2, split: { row: 50,  col: 50, inner: 50 } },
  { id: '2x2',         label: '2×2 grid',                 slots: 4, split: { row: 50,  col: 50, inner: 50 } },
  { id: '1top-2bot',   label: '1 top / 2 bottom',         slots: 3, split: { row: 50,  col: 50, inner: 50 } },
  { id: '2top-1bot',   label: '2 top / 1 bottom',         slots: 3, split: { row: 50,  col: 50, inner: 50 } },
  { id: '1top-3bot',   label: '1 top / 3 bottom',         slots: 4, split: { row: 67,  col: 50, inner: 50 } },
  { id: '1big-2small', label: '1 big + 2 small',          slots: 3, split: { row: 50,  col: 67, inner: 50 } },
  { id: '1left-2right',label: '1 left / 2 right',         slots: 3, split: { row: 50,  col: 33, inner: 50 } },
  { id: '1left-3right',label: '1 left / 3 right',         slots: 4, split: { row: 50,  col: 33, inner: 50 } },
];
export const LAYOUT_IDS: string[] = LAYOUTS.map((l) => l.id);
export const LAYOUT_SLOTS: Record<string, number> = Object.fromEntries(LAYOUTS.map((l) => [l.id, l.slots]));
export const LAYOUT_SPLIT_DEFAULTS: Record<string, { row: number; col: number; inner: number }> =
  Object.fromEntries(LAYOUTS.map((l) => [l.id, l.split]));
export const HIDE_TITLE_LAYOUTS = new Set(LAYOUTS.filter((l) => l.hideTitle).map((l) => l.id));
