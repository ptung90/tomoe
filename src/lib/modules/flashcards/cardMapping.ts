import { uid, type Project, type Schema, type CardTemplate, type RecordItem, type Card, type CardSection, type CardImage, type Settings } from './model';
import { resolveLocale, LAYOUT_SLOTS } from './lib/card-render';

const DEFAULT_IMAGE_HEIGHT = 50;

export function deriveAutoTemplate(schema: Schema): CardTemplate {
  const hasImage = schema.fields.some((f) => f.type === 'image');
  const layout = hasImage ? '1top-1bot' : 'fulltext';
  return {
    id: uid('tpl'),
    templateType: 'single',
    layout,
    size: null,
    orientation: undefined,
    hideTitle: false,
    hideSectionLabels: false,
    mapping: {},
  };
}

const COMPOUND_LAYOUTS = new Set(['3card']);

export function cardsPerPage(layout: string): number {
  return COMPOUND_LAYOUTS.has(layout) ? (LAYOUT_SLOTS[layout] ?? 1) : 1;
}

export function chunkRecords<T>(items: T[], size: number): T[][] {
  const n = Math.max(1, size);
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n));
  return out;
}

/** Build one Card from a chunk of records. Single layouts use records[0]
 *  (identical to the former recordToCard); compound (3card) maps each record
 *  to one cell (label=first text field, content=second, image=first image). */
export function recordsToCard(
  records: RecordItem[], schema: Schema, template: CardTemplate, settings: Settings, locale: string,
): Card {
  const orientation = template.orientation ?? settings.orientation;
  if (!COMPOUND_LAYOUTS.has(template.layout)) {
    const record = records[0];
    const textFields = schema.fields.filter((f) => f.type !== 'image');
    const imageFields = schema.fields.filter((f) => f.type === 'image');
    const titleField = textFields[0] ?? null;
    const sectionFields = titleField ? textFields.slice(1) : textFields;
    const slotCount = LAYOUT_SLOTS[template.layout] ?? 0;
    const images: CardImage[] = [];
    if (record) {
      for (let i = 0; i < Math.min(slotCount, imageFields.length); i++) {
        const url = resolveLocale(record.fields[imageFields[i].key], locale);
        if (url) images.push({ slot: i, url });
      }
    }
    const sections: CardSection[] = record
      ? sectionFields.map((f) => ({ id: uid('sec'), label: f.label, content: resolveLocale(record.fields[f.key], locale) }))
      : [];
    return {
      id: 'preview_' + (record?.id ?? 'empty'),
      layout: template.layout,
      imageHeightPercent: template.imageHeightPercent ?? DEFAULT_IMAGE_HEIGHT,
      images,
      title: record && titleField ? resolveLocale(record.fields[titleField.key], locale) : '',
      sections,
      orientation,
      hideTitle: template.hideTitle,
      hideSectionLabels: template.hideSectionLabels,
      ...(record ? { recordId: record.id } : {}),
      templateId: template.id,
    };
  }

  // Compound (3card): each record → one cell.
  const textFields = schema.fields.filter((f) => f.type !== 'image');
  const imageFields = schema.fields.filter((f) => f.type === 'image');
  const labelField = textFields[0] ?? null;
  const contentField = textFields[1] ?? null;
  const imageField = imageFields[0] ?? null;
  const slots = LAYOUT_SLOTS[template.layout] ?? 3;
  const cells = records.slice(0, slots);

  const sections: CardSection[] = cells.map((rec) => ({
    id: uid('sec'),
    label: labelField ? resolveLocale(rec.fields[labelField.key], locale) : '',
    content: contentField ? resolveLocale(rec.fields[contentField.key], locale) : '',
  }));
  while (sections.length < slots) sections.push({ id: uid('sec'), label: '', content: '' });

  const images: CardImage[] = [];
  cells.forEach((rec, i) => {
    if (!imageField) return;
    const url = resolveLocale(rec.fields[imageField.key], locale);
    if (url) images.push({ slot: i, url });
  });

  return {
    id: 'preview_' + (cells[0]?.id ?? 'empty'),
    layout: template.layout,
    imageHeightPercent: template.imageHeightPercent ?? DEFAULT_IMAGE_HEIGHT,
    images,
    title: '',
    sections,
    orientation,
    hideTitle: template.hideTitle,
    hideSectionLabels: template.hideSectionLabels,
    templateId: template.id,
    packedRecordIds: cells.map((r) => r.id),
  };
}

export function recordToCard(
  record: RecordItem, schema: Schema, template: CardTemplate, settings: Settings, locale: string,
): Card {
  return recordsToCard([record], schema, template, settings, locale);
}

export function applySettings(p: Project, patch: Partial<Settings>): Project {
  const s = p.settings;
  return { ...p, settings: {
    ...s, ...patch,
    border: { ...s.border, ...(patch.border ?? {}) },
    image: { ...s.image, ...(patch.image ?? {}) },
    titleFont: { ...s.titleFont, ...(patch.titleFont ?? {}) },
    contentFont: { ...s.contentFont, ...(patch.contentFont ?? {}) },
  } };
}

export function applyTemplatePatch(p: Project, schemaId: string, patch: Partial<CardTemplate>): Project {
  return { ...p, schemas: p.schemas.map((s) => {
    if (s.id !== schemaId) return s;
    const existing = s.cardTemplates[0] ?? deriveAutoTemplate(s);
    return { ...s, cardTemplates: [{ ...existing, ...patch }, ...s.cardTemplates.slice(1)] };
  }) };
}
