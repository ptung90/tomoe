import type { Project, Card, Settings } from '../model';
import { deriveAutoTemplate, recordToCard, chunkRecords } from '../cardMapping';
import { sheetLayout } from './card-render';
import { resolveStyle } from './style';

/** Every card the Cards gallery shows, in schema order — one card per record:
 *  the persisted (packed) card if one exists, else an auto-derived one. Pure. */
export function collectPrintCards(project: Project): Card[] {
  const out: Card[] = [];
  for (const schema of project.schemas) {
    const template = schema.cardTemplates[0] ?? deriveAutoTemplate(schema);
    const recs = project.records.filter((r) => r.schemaId === schema.id);
    for (const rec of recs) {
      const packed = project.cards.find((c) => c.recordId === rec.id);
      out.push(packed ?? recordToCard(rec, schema, template, project.settings, project.activeLocale));
    }
  }
  return out;
}

export interface Sheet { cards: Card[]; lay: ReturnType<typeof sheetLayout>; settings: Settings; }
/** Every printed sheet, in schema order — records chunked per the template's resolved
 *  N-up sheet layout (fixed grid or auto-fit). Pure. */
export function collectPrintSheets(project: Project): Sheet[] {
  const out: Sheet[] = [];
  for (const schema of project.schemas) {
    const template = schema.cardTemplates[0] ?? deriveAutoTemplate(schema);
    const schemaEff = resolveStyle(project.settings, template.style);
    const orient = schemaEff.orientation;
    const lay = sheetLayout(template, schemaEff.paperSize, orient);
    const recs = project.records.filter((r) => r.schemaId === schema.id);
    const cards = recs.map((r) =>
      project.cards.find((c) => c.recordId === r.id) ?? recordToCard(r, schema, template, project.settings, project.activeLocale));
    for (const chunk of chunkRecords(cards, lay.perPage)) out.push({ cards: chunk, lay, settings: schemaEff });
  }
  return out;
}
