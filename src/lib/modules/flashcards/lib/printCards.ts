import type { Project, Card } from '../model';
import { deriveAutoTemplate, recordToCard } from '../cardMapping';

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
