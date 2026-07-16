// Declarative registry of the "flow" (document) layouts. No `marked`/render deps —
// safe for `model.ts`/`cardMapping.ts` to import (same rule as `./layouts`).
export interface FlowLayoutDef {
  id: string; label: string; family: 'flow';
  mode: 'collage' | 'page';
  collageColumns?: number;                       // collage: image grid columns
  titleStyle?: 'filled' | 'outline';             // cover uses 'outline'
  imageWidth?: string;                           // page: floated image width, e.g. '40%'
  sectionImageSide?: 'alt' | 'left' | 'right';   // page: float side; 'alt' = alternate by index
}
export const FLOW_LAYOUTS: FlowLayoutDef[] = [
  { id: 'country-cover', label: 'Country cover (collage)', family: 'flow', mode: 'collage', collageColumns: 3, titleStyle: 'outline' },
  { id: 'country-page',  label: 'Country page',            family: 'flow', mode: 'page', imageWidth: '40%', sectionImageSide: 'alt' },
];
const _byId = new Map(FLOW_LAYOUTS.map((l) => [l.id, l]));
export function isFlowLayout(id: string): boolean { return _byId.has(id); }
export function getFlowLayout(id: string): FlowLayoutDef | undefined { return _byId.get(id); }
