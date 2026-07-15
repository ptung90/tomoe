import { uid, type Project, type Card, type Schema, type CardTemplate, type CardSection, type CardImage } from './model';
import { deriveAutoTemplate, recordToCard } from './cardMapping';
import { hashFields } from './lib/hash';
import { LAYOUT_SLOTS } from './lib/layouts';

/** A schema's views, in order — its real cardTemplates, or a single derived one if it has none yet. */
function viewsFor(schema: Schema): CardTemplate[] {
  return schema.cardTemplates.length ? schema.cardTemplates : [deriveAutoTemplate(schema)];
}

/** Resolve a card's schema via its source record. */
export function schemaForCard(project: Project, card: Card): Schema | null {
  const rec = project.records.find((r) => r.id === card.recordId);
  if (!rec) return null;
  return project.schemas.find((s) => s.id === rec.schemaId) ?? null;
}

/** Resolve the view (CardTemplate) a card was built from, via its own `templateId`; falls back to
 *  the schema's first view if that id no longer names one of the schema's current views. */
export function templateForCard(project: Project, card: Card): CardTemplate | null {
  const schema = schemaForCard(project, card);
  if (!schema) return null;
  const views = viewsFor(schema);
  return views.find((t) => t.id === card.templateId) ?? views[0];
}

/** Persist one Card per (requested record x schema view) pair, replacing any existing card for that pair. */
export function packRecords(project: Project, schemaId: string, recordIds: string[]): Project {
  const schema = project.schemas.find((s) => s.id === schemaId);
  if (!schema) return project;
  const views = viewsFor(schema);

  const wanted = new Set(recordIds);
  const idOrder = project.records.filter((r) => r.schemaId === schemaId && wanted.has(r.id)).map((r) => r.id);
  const viewIds = new Set(views.map((t) => t.id));

  // Replace existing cards for these records, across any of this schema's views.
  const kept = project.cards.filter((c) => !(c.recordId && wanted.has(c.recordId) && c.templateId && viewIds.has(c.templateId)));

  const newCards: Card[] = [];
  for (const template of views) {
    for (const id of idOrder) {
      const rec = project.records.find((r) => r.id === id)!;
      const built = recordToCard(rec, schema, template, project.settings, project.activeLocale);
      newCards.push({ ...built, id: uid('card'), recordId: id, templateId: template.id, sourceHash: hashFields(project, [id]) });
    }
  }

  return { ...project, cards: [...kept, ...newCards] };
}

export function packAllForSchema(project: Project, schemaId: string): Project {
  const ids = project.records.filter((r) => r.schemaId === schemaId).map((r) => r.id);
  return packRecords(project, schemaId, ids);
}

export function regenerateCard(project: Project, cardId: string): Project {
  const card = project.cards.find((c) => c.id === cardId);
  if (!card || !card.recordId) return project;
  const schema = schemaForCard(project, card);
  if (!schema) return project;
  const template = templateForCard(project, card);
  if (!template) return project;
  const rec = project.records.find((r) => r.id === card.recordId);
  if (!rec) return project;
  const rebuilt = recordToCard(rec, schema, template, project.settings, project.activeLocale);
  const next: Card = { ...rebuilt, id: card.id, templateId: template.id, sourceHash: hashFields(project, [card.recordId]), edited: false };
  return { ...project, cards: project.cards.map((c) => (c.id === cardId ? next : c)) };
}

export function deleteCard(project: Project, cardId: string): Project {
  return { ...project, cards: project.cards.filter((c) => c.id !== cardId) };
}

export function isCardStale(card: Card, project: Project): boolean {
  if (!card.recordId) return false;
  return hashFields(project, [card.recordId]) !== card.sourceHash;
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
  if (!card || !card.recordId) return project;
  const schema = schemaForCard(project, card);
  if (!schema) return project;
  const textFields = schema.fields.filter((f) => f.type !== 'image');
  const imageFields = schema.fields.filter((f) => f.type === 'image');
  const titleField = textFields[0] ?? null;
  const sectionFields = titleField ? textFields.slice(1) : textFields;
  const locale = project.activeLocale;
  const recordId = card.recordId;
  // The card only captures images up to its template's layout slot count (see recordToCard).
  // Image fields beyond that were never shown/edited on the card — don't wipe them on apply.
  const template = templateForCard(project, card) ?? deriveAutoTemplate(schema);
  const capturedImageSlots = LAYOUT_SLOTS[card.layout] ?? LAYOUT_SLOTS[template.layout] ?? imageFields.length;

  const write = (fields: Record<string, unknown>, key: string | undefined, value: string) => {
    if (!key) return;
    const cur = fields[key];
    if (cur && typeof cur === 'object') fields[key] = { ...(cur as Record<string, string>), [locale]: value };
    else fields[key] = value;
  };

  const records = project.records.map((rec) => {
    if (rec.id !== recordId) return rec;
    const fields: Record<string, unknown> = { ...rec.fields };
    if (titleField) write(fields, titleField.key, asStr(card.title));
    sectionFields.forEach((f, idx) => write(fields, f.key, asStr(card.sections[idx]?.content)));
    imageFields.forEach((f, idx) => {
      if (idx >= capturedImageSlots) return; // beyond the card's layout slots — leave existing value untouched
      const image = card.images.find((im) => im.slot === idx);
      write(fields, f.key, image?.url ?? '');
    });
    return { ...rec, fields: fields as typeof rec.fields };
  });

  const updated = { ...project, records };
  const restamped: Card = { ...card, sourceHash: hashFields(updated, [recordId]), edited: false };
  return { ...updated, cards: project.cards.map((c) => (c.id === cardId ? restamped : c)) };
}
