import { uid, type Project, type Schema, type CardTemplate, type RecordItem, type Card, type CardSection, type CardImage, type Settings, type StyleOverrides, type SchemaField } from './model';
import { resolveLocale } from './lib/card-render';
import { LAYOUT_SLOTS } from './lib/layouts';
import { mergeStyle } from './lib/style';

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

export function chunkRecords<T>(items: T[], size: number): T[][] {
  const n = Math.max(1, size);
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n));
  return out;
}

/** Build one Card from a single record — one Card = one record. */
export function recordToCard(
  record: RecordItem, schema: Schema, template: CardTemplate, settings: Settings, locale: string,
): Card {
  const orientation = template.style?.orientation ?? template.orientation ?? settings.orientation;
  // A view (template.fields) selects + orders a subset of the schema's fields; empty/undefined = all.
  const activeFields: SchemaField[] = template.fields?.length
    ? template.fields.map((k) => schema.fields.find((f) => f.key === k)).filter((f): f is SchemaField => !!f)
    : schema.fields;
  const textFields = activeFields.filter((f) => f.type !== 'image');
  const imageFields = activeFields.filter((f) => f.type === 'image');
  const titleField = textFields[0] ?? null;
  const sectionFields = titleField ? textFields.slice(1) : textFields;
  const slotCount = LAYOUT_SLOTS[template.layout] ?? 0;
  const images: CardImage[] = [];
  for (let i = 0; i < Math.min(slotCount, imageFields.length); i++) {
    const url = resolveLocale(record.fields[imageFields[i].key], locale);
    if (url) images.push({ slot: i, url });
  }
  const sections: CardSection[] = sectionFields.map((f) => (
    { id: uid('sec'), label: f.label, content: resolveLocale(record.fields[f.key], locale) }
  ));
  return {
    id: 'preview_' + record.id,
    layout: template.layout,
    imageHeightPercent: template.imageHeightPercent ?? DEFAULT_IMAGE_HEIGHT,
    images,
    title: titleField ? resolveLocale(record.fields[titleField.key], locale) : '',
    sections,
    orientation,
    hideTitle: template.hideTitle,
    hideSectionLabels: template.hideSectionLabels,
    recordId: record.id,
    templateId: template.id,
  };
}

const MAX_VIEW_LABEL = 24;
/** The display name for a view (a CardTemplate): the explicit `name` if set; else the label of
 *  its one selected field; else its selected fields' labels joined (truncated); else "View {n}"
 *  (1-based `index` — the caller passes the template's position in `schema.cardTemplates`). Pure. */
export function viewLabel(template: CardTemplate, schema: Schema, index: number): string {
  if (template.name) return template.name;
  const keys = template.fields ?? [];
  if (keys.length === 1) {
    const f = schema.fields.find((x) => x.key === keys[0]);
    if (f) return f.label;
  } else if (keys.length > 1) {
    const labels = keys.map((k) => schema.fields.find((x) => x.key === k)?.label ?? k);
    const joined = labels.join(' + ');
    return joined.length > MAX_VIEW_LABEL ? joined.slice(0, MAX_VIEW_LABEL - 1) + '…' : joined;
  }
  return `View ${index + 1}`;
}

export function applySettings(p: Project, patch: Partial<Settings> | StyleOverrides): Project {
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

export function applyTemplateStyle(p: Project, schemaId: string, patch: StyleOverrides): Project {
  return { ...p, schemas: p.schemas.map((s) => {
    if (s.id !== schemaId) return s;
    const existing = s.cardTemplates[0] ?? deriveAutoTemplate(s);
    return { ...s, cardTemplates: [{ ...existing, style: mergeStyle(existing.style, patch) }, ...s.cardTemplates.slice(1)] };
  }) };
}
