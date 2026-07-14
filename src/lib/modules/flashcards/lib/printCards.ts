import type { Project, Card } from '../model';
import { deriveAutoTemplate, recordsToCard, cardsPerPage, chunkRecords } from '../cardMapping';
import { schemaForCard } from '../cardOps';

/** Every card the Cards gallery shows, in schema order: persisted packed cards
 *  plus auto-derived cards for records not in any packed card. Pure. */
export function collectPrintCards(project: Project): Card[] {
  const out: Card[] = [];
  for (const schema of project.schemas) {
    const template = schema.cardTemplates[0] ?? deriveAutoTemplate(schema);
    const compound = cardsPerPage(template.layout) > 1;
    const recs = project.records.filter((r) => r.schemaId === schema.id);
    const packed = compound
      ? project.cards.filter((c) => c.packedRecordIds?.length && schemaForCard(project, c)?.id === schema.id)
      : [];
    out.push(...packed);
    const packedIds = new Set(packed.flatMap((c) => c.packedRecordIds ?? []));
    const autoRecs = recs.filter((r) => !packedIds.has(r.id));
    for (const chunk of chunkRecords(autoRecs, cardsPerPage(template.layout))) {
      out.push(recordsToCard(chunk, schema, template, project.settings, project.activeLocale));
    }
  }
  return out;
}
