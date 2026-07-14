import { uid, type Project, type Card, type Schema, type CardTemplate, type RecordItem, type CardSection, type CardImage } from './model';
import { deriveAutoTemplate, recordsToCard, cardsPerPage, chunkRecords } from './cardMapping';
import { hashFields } from './lib/hash';

function templateFor(schema: Schema): CardTemplate {
  return schema.cardTemplates[0] ?? deriveAutoTemplate(schema);
}

/** Resolve a packed card's schema via the first surviving packed record (robust to template-id
 *  drift and to earlier packed records having since been deleted). */
export function schemaForCard(project: Project, card: Card): Schema | null {
  for (const id of card.packedRecordIds ?? []) {
    const rec = project.records.find((r) => r.id === id);
    if (rec) return project.schemas.find((s) => s.id === rec.schemaId) ?? null;
  }
  return null;
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
  const next: Card = { ...rebuilt, id: card.id, sourceHash: hashFields(project, card.packedRecordIds), edited: false };
  return { ...project, cards: project.cards.map((c) => (c.id === cardId ? next : c)) };
}

export function deleteCard(project: Project, cardId: string): Project {
  return { ...project, cards: project.cards.filter((c) => c.id !== cardId) };
}

export function isCardStale(card: Card, project: Project): boolean {
  if (!card.packedRecordIds?.length) return false;
  return hashFields(project, card.packedRecordIds) !== card.sourceHash;
}

function asStr(v: unknown): string { return typeof v === 'string' ? v : ''; }

export function setCardCell(
  project: Project, cardId: string, i: number,
  patch: { label?: string; content?: string; image?: string },
): Project {
  const cards = project.cards.map((card) => {
    if (card.id !== cardId) return card;
    let sections: CardSection[] = card.sections;
    if (patch.label !== undefined || patch.content !== undefined) {
      sections = card.sections.map((s, idx) => (idx === i
        ? { ...s,
            ...(patch.label !== undefined ? { label: patch.label } : {}),
            ...(patch.content !== undefined ? { content: patch.content } : {}) }
        : s));
    }
    let images: CardImage[] = card.images;
    if (patch.image !== undefined) {
      const others = card.images.filter((im) => im.slot !== i);
      images = patch.image ? [...others, { slot: i, url: patch.image }] : others;
    }
    return { ...card, sections, images, edited: true };
  });
  return { ...project, cards };
}

export function applyCardToRecords(project: Project, cardId: string): Project {
  const card = project.cards.find((c) => c.id === cardId);
  if (!card || !card.packedRecordIds?.length) return project;
  const schema = schemaForCard(project, card);
  if (!schema) return project;
  const textFields = schema.fields.filter((f) => f.type !== 'image');
  const imageFields = schema.fields.filter((f) => f.type === 'image');
  const labelField = textFields[0] ?? null;
  const contentField = textFields[1] ?? null;
  const imageField = imageFields[0] ?? null;
  const locale = project.activeLocale;
  const ids = card.packedRecordIds;

  const write = (fields: Record<string, unknown>, key: string | undefined, value: string) => {
    if (!key) return;
    const cur = fields[key];
    if (cur && typeof cur === 'object') fields[key] = { ...(cur as Record<string, string>), [locale]: value };
    else fields[key] = value;
  };

  const records = project.records.map((rec) => {
    const idx = ids.indexOf(rec.id);
    if (idx < 0) return rec;
    const section = card.sections[idx];
    const image = card.images.find((im) => im.slot === idx);
    const fields: Record<string, unknown> = { ...rec.fields };
    if (section) {
      write(fields, labelField?.key, asStr(section.label));
      write(fields, contentField?.key, asStr(section.content));
    }
    if (imageField) write(fields, imageField.key, image?.url ?? '');
    return { ...rec, fields: fields as RecordItem['fields'] };
  });

  const updated = { ...project, records };
  const restamped: Card = { ...card, sourceHash: hashFields(updated, ids), edited: false };
  return { ...updated, cards: project.cards.map((c) => (c.id === cardId ? restamped : c)) };
}
