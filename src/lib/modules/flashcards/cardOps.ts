import { uid, type Project, type Card, type Schema, type CardTemplate, type RecordItem } from './model';
import { deriveAutoTemplate, recordsToCard, cardsPerPage, chunkRecords } from './cardMapping';
import { hashFields } from './lib/hash';

function templateFor(schema: Schema): CardTemplate {
  return schema.cardTemplates[0] ?? deriveAutoTemplate(schema);
}

/** Resolve a packed card's schema via its first packed record (robust to template-id drift). */
export function schemaForCard(project: Project, card: Card): Schema | null {
  const firstId = card.packedRecordIds?.[0];
  if (!firstId) return null;
  const rec = project.records.find((r) => r.id === firstId);
  return rec ? (project.schemas.find((s) => s.id === rec.schemaId) ?? null) : null;
}

export function packRecords(project: Project, schemaId: string, recordIds: string[]): Project {
  const schema = project.schemas.find((s) => s.id === schemaId);
  if (!schema) return project;
  const template = templateFor(schema);
  const size = cardsPerPage(template.layout);
  if (size <= 1) return project; // only compound layouts pack

  // Records in this schema, in project order, limited to the requested ids.
  const wanted = new Set(recordIds);
  const idOrder = project.records.filter((r) => r.schemaId === schemaId && wanted.has(r.id)).map((r) => r.id);
  const chunks = chunkRecords(idOrder, size);

  // Replace this schema's existing packed cards.
  const kept = project.cards.filter((c) => !(c.packedRecordIds?.length && schemaForCard(project, c)?.id === schemaId));

  const newCards: Card[] = chunks.map((chunkIds) => {
    const recs = chunkIds
      .map((id) => project.records.find((r) => r.id === id))
      .filter((r): r is RecordItem => !!r);
    const built = recordsToCard(recs, schema, template, project.settings, project.activeLocale);
    return { ...built, id: uid('card'), sourceHash: hashFields(project, chunkIds) };
  });

  return { ...project, cards: [...kept, ...newCards] };
}

export function packAllForSchema(project: Project, schemaId: string): Project {
  const ids = project.records.filter((r) => r.schemaId === schemaId).map((r) => r.id);
  return packRecords(project, schemaId, ids);
}

export function regenerateCard(project: Project, cardId: string): Project {
  const card = project.cards.find((c) => c.id === cardId);
  if (!card || !card.packedRecordIds?.length) return project;
  const schema = schemaForCard(project, card);
  if (!schema) return project;
  const template = templateFor(schema);
  const recs = card.packedRecordIds
    .map((id) => project.records.find((r) => r.id === id))
    .filter((r): r is RecordItem => !!r);
  const rebuilt = recordsToCard(recs, schema, template, project.settings, project.activeLocale);
  const next: Card = { ...rebuilt, id: card.id, sourceHash: hashFields(project, card.packedRecordIds) };
  return { ...project, cards: project.cards.map((c) => (c.id === cardId ? next : c)) };
}

export function deleteCard(project: Project, cardId: string): Project {
  return { ...project, cards: project.cards.filter((c) => c.id !== cardId) };
}

export function isCardStale(card: Card, project: Project): boolean {
  if (!card.packedRecordIds?.length) return false;
  return hashFields(project, card.packedRecordIds) !== card.sourceHash;
}
