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
    orientation: 'portrait',
    hideTitle: false,
    hideSectionLabels: false,
    mapping: {},
  };
}

export function recordToCard(
  record: RecordItem, schema: Schema, template: CardTemplate, settings: Settings, locale: string,
): Card {
  const textFields = schema.fields.filter((f) => f.type !== 'image');
  const imageFields = schema.fields.filter((f) => f.type === 'image');
  const titleField = textFields[0] ?? null;
  const sectionFields = titleField ? textFields.slice(1) : textFields;
  const slotCount = LAYOUT_SLOTS[template.layout] ?? 0;

  const images: CardImage[] = [];
  for (let i = 0; i < Math.min(slotCount, imageFields.length); i++) {
    const url = resolveLocale(record.fields[imageFields[i].key], locale);
    if (url) images.push({ slot: i, url });
  }
  const sections: CardSection[] = sectionFields.map((f) => ({
    id: uid('sec'),
    label: f.label,
    content: resolveLocale(record.fields[f.key], locale),
  }));

  return {
    id: 'preview_' + record.id,
    layout: template.layout,
    imageHeightPercent: DEFAULT_IMAGE_HEIGHT,
    images,
    title: titleField ? resolveLocale(record.fields[titleField.key], locale) : '',
    sections,
    orientation: template.orientation ?? settings.orientation,
    hideTitle: template.hideTitle,
    hideSectionLabels: template.hideSectionLabels,
    recordId: record.id,
    templateId: template.id,
  };
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
